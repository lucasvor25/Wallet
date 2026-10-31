# Carteira Financeira API

API REST de carteira digital em que usuários se cadastram, autenticam e transferem saldo entre si, com estorno, idempotência e trilha de auditoria (ledger).

**Stack:** Node.js · NestJS · TypeScript · PostgreSQL · TypeORM · Docker Compose · Jest

---

## Como rodar

```bash
cp .env.example .env
docker compose up --build            # sobe banco, roda migrations e inicia a API
docker compose --profile seed run --rm seed   # (opcional) cria usuários de demonstração
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Health: `GET /health` · Métricas: `GET /metrics`
- Usuários de demo (seed): `alice@example.com` e `bob@example.com`, senhas em `.env.example`

```bash
npm run test          # unitários
npm run test:int      # integração (Testcontainers, requer Docker)
```

> O seed é apenas para demonstração e não deve rodar em produção.

---

## Escopo

**Dentro:** cadastro, autenticação JWT, carteira, transferência entre carteiras, estorno, idempotência, extrato, logs, health e métricas.

**Fora (de propósito):** depósito/saque reais (PIX, bancos), estorno parcial, agendamento, notificações, múltiplas carteiras por usuário, múltiplas moedas, frontend, microserviços, stack de monitoramento (Prometheus/Grafana).

---

## Decisões principais

| Tema           | Decisão                                                   | Motivo                                                               |
| -------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Banco          | PostgreSQL                                                | ACID, locks de linha, constraints                                    |
| ORM            | TypeORM                                                   | Integração oficial com Nest, controle de transação e `FOR UPDATE`    |
| Dinheiro       | Centavos em `bigint`                                      | Inteiro é exato; float não (`0.1 + 0.2 !== 0.3`)                     |
| API de valores | Inteiro no campo `amountInCents`                          | Unidade explícita no nome elimina ambiguidade (100 = R$ 1,00)        |
| Moeda          | `currency = 'BRL'` fixa                                   | Deixa o contrato pronto para evoluir                                 |
| IDs            | UUID gerado pela aplicação                                | Sem vazar volume de registros, permite gerar o id antes de persistir |
| Concorrência   | Lock pessimista nas duas carteiras, sempre em ordem de id | Impede saldo inconsistente e deadlock em A→B / B→A                   |
| Saldo          | Armazenado em `wallets.balance` + ledger como auditoria   | Leitura O(1); ledger explica cada centavo                            |
| Hash de senha  | Argon2id                                                  | Memory-hard, dificulta ataque em massa                               |
| Paginação      | Cursor `(created_at, id)`                                 | Desempenho estável com histórico grande                              |
| Depósito       | Sem endpoint; saldo inicial via seed                      | Endpoint aberto criaria dinheiro infinito                            |

### Padrões aplicados (e por quê)

- **Repository:** isola o TypeORM do domínio e permite testar services com mocks.
- **Unit of Work (`TransactionManager`):** o service executa um bloco transacional sem conhecer o ORM.
- **Dependency Injection:** nativa do Nest; dependências por interface (DIP).
- **DTO + ValidationPipe:** validação na borda (`whitelist` e `forbidNonWhitelisted`).
- **Exception Filter global:** erros de domínio viram HTTP em um único ponto.
- **SRP:** controller só HTTP, service só regra, repository só persistência.

---

## Modelagem de dados

**users**: `id`, `name`, `email` (UNIQUE), `password_hash`, `created_at`, `updated_at`

**wallets**: `id`, `user_id` (UNIQUE, FK), `balance_in_cents` (CHECK `>= 0`), `currency`, `created_at`, `updated_at`

**transfers**: `id`, `sender_wallet_id`, `receiver_wallet_id`, `amount_in_cents` (CHECK `> 0`, CHECK sender ≠ receiver), `type` (`TRANSFER | REVERSAL`), `status` (`COMPLETED | REVERSED`), `original_transfer_id` (FK, nulo em transferências normais), `created_at`

**ledger_entries** (append-only): `id`, `wallet_id`, `transfer_id` (nulo no crédito de demonstração), `direction` (`DEBIT | CREDIT`), `amount_in_cents`, `balance_after_in_cents`, `source` (`TRANSFER | REVERSAL | DEMO_SEED`), `created_at`

**idempotency_keys**: `id`, `user_id`, `key`, `request_hash`, `response_status`, `response_body`, `expires_at`, `created_at`

### Índices e constraints

| Tabela           | Índice / constraint                                  | Serve para                              |
| ---------------- | ---------------------------------------------------- | --------------------------------------- |
| users            | UNIQUE(email)                                        | Login e unicidade                       |
| wallets          | UNIQUE(user_id)                                      | Uma carteira por usuário                |
| wallets          | CHECK(balance >= 0)                                  | Segunda barreira contra saldo negativo  |
| transfers        | (sender_wallet_id, created_at DESC, id DESC)         | Histórico de enviadas                   |
| transfers        | (receiver_wallet_id, created_at DESC, id DESC)       | Histórico de recebidas                  |
| transfers        | UNIQUE(original_transfer_id) WHERE type = 'REVERSAL' | Impede estorno duplicado                |
| ledger_entries   | (wallet_id, created_at DESC, id DESC)                | Extrato paginado por cursor             |
| ledger_entries   | (transfer_id)                                        | Buscar lançamentos de uma transferência |
| idempotency_keys | UNIQUE(user_id, key)                                 | Impede processamento duplicado          |

Invariante verificada em teste: `wallets.balance == soma(créditos) − soma(débitos)` do ledger daquela carteira.

---

## Fluxo de transferência

`POST /transfers` com header obrigatório `Idempotency-Key`. O remetente vem do token, nunca do body.

1. Valida DTO (`receiverWalletId`, `amountInCents` inteiro, positivo e até o limite configurado).
2. Abre transação.
3. Registra a chave de idempotência. Se já existe com o mesmo payload, devolve a resposta salva; com payload diferente, `409`.
4. Trava as duas carteiras com `FOR UPDATE`, ordenadas por id.
5. Valida: destinatário existe (`404`), não é a própria carteira, saldo suficiente (`422`).
6. Debita e credita, grava `transfers` e dois `ledger_entries`.
7. Salva a resposta na chave de idempotência e faz commit. Qualquer erro causa **rollback** total.
8. Loga o evento **depois** do commit.

Transferências são instantâneas e atômicas. Falhas fazem rollback e não deixam registro financeiro (ficam só nos logs).

## Estorno

`POST /transfers/:id/reversal`

- Pode solicitar quem enviou ou quem recebeu a transferência original.
- Só transferências `COMPLETED` do tipo `TRANSFER`, dentro da janela configurável (`REVERSAL_WINDOW_HOURS`).
- Uma única vez; estorno não pode ser estornado.
- Se o destinatário original não tem saldo, o estorno é negado (`422`). Não há saldo negativo nem estorno parcial.
- A original é imutável, exceto `status`, que passa a `REVERSED`. O estorno é um novo registro `REVERSAL` com `original_transfer_id` e lançamentos inversos no ledger.
- Mesma transação, mesma ordem de locks; o status da original é revalidado já com o lock.

---

## API (`/api/v1`)

| Método | Rota                       | Descrição                             | Respostas                    |
| ------ | -------------------------- | ------------------------------------- | ---------------------------- |
| POST   | `/auth/register`           | Cadastro + carteira (mesma transação) | 201, 400, 409                |
| POST   | `/auth/login`              | Login, devolve access token           | 200, 400, 401                |
| GET    | `/users/me`                | Dados do usuário                      | 200, 401                     |
| GET    | `/wallets/me`              | Carteira e saldo                      | 200, 401                     |
| GET    | `/wallets/me/transactions` | Extrato paginado por cursor (ledger)  | 200, 400, 401                |
| POST   | `/transfers`               | Transferir                            | 201, 400, 401, 404, 409, 422 |
| GET    | `/transfers/:id`           | Detalhe (só participantes)            | 200, 401, 404                |
| POST   | `/transfers/:id/reversal`  | Estornar                              | 201, 401, 404, 409, 422      |

Erros seguem um formato único: `{ statusCode, error, message, requestId, timestamp, path }`.

---

## Segurança

- Argon2id; hash nunca sai em resposta ou log.
- Senha: mínimo 8 caracteres com maiúscula, minúscula, número e especial (e limite máximo para evitar abuso do hash).
- JWT de 15 min; secret via env; sem secrets no repositório (`.env.example` apenas).
- Login com `401` genérico, sem revelar se o e-mail existe.
- Autorização por posse: usuário só acessa a própria carteira e transferências em que participa.
- `helmet`, CORS restrito, rate limit global e mais rígido em login, cadastro e transferência.
- Container roda com usuário não-root.

## Observabilidade

- **Logs:** `nestjs-pino`, JSON estruturado, `requestId` em todos os logs e no header `X-Request-Id`, com `redact` de `authorization` e `password`.
- **Níveis:** `info` fluxo normal · `warn` erro de negócio e acesso negado · `error` falha inesperada.
- **Eventos:** startup/shutdown, requisições, login (sucesso/falha), transferência e estorno (ids, sem saldos), erros.
- **Health:** `GET /health` (liveness e conexão com o banco).
- **Métricas:** `GET /metrics` (formato Prometheus): requisições, latência, erros, transferências por status, memória e event loop. Sem labels de alta cardinalidade (nada de user ou transfer id).
- O ledger é a fonte oficial do histórico financeiro; logs são apenas técnicos.

## Testes

- **Unitários (Jest, mocks):** regras de transferência (valor, saldo, mesma carteira), estorno (permissão, duplicado, saldo), idempotência, login.
- **Integração (Jest + Supertest + Testcontainers/PostgreSQL):**
  - transferência atualiza saldos, `transfers` e ledger;
  - **rollback** em falha no meio da operação;
  - **concorrência:** duas transferências simultâneas com o mesmo saldo, só uma passa, saldo final correto; transferências cruzadas A→B e B→A sem deadlock;
  - estorno e requisições repetidas com a mesma chave não duplicam dinheiro;
  - autorização e formato de erro.

---

## Limitações conhecidas

- Processamento síncrono, sem filas ou outbox.
- Sem 2FA, antifraude, limites por perfil ou integração bancária.
- Uma instância de PostgreSQL, sem alta disponibilidade.
- Valores acima de 2^53 centavos não são suportados (~R$ 90 trilhões).

## Melhorias futuras

Refresh token com rotação e logout, depósito via webhook de provedor (PIX), outbox/eventos, Sentry e OpenTelemetry, Prometheus + Grafana, papéis (admin), limites configuráveis por usuário, 2FA, CI com GitHub Actions.

---

## Roadmap de implementação

- [ ] **0.** README e decisões (este documento)
- [ ] **1.** Scaffold Nest, Docker Compose (db + migrate + api), validação de env
- [ ] **2.** Migrations: users, wallets, transfers, ledger, idempotency (com CHECKs e índices)
- [ ] **3.** Cadastro (user + wallet na mesma transação) e login JWT
- [ ] **4.** `TransactionManager` + `TransfersService` (locks, saldo, ledger, idempotência)
- [ ] **5.** Estorno
- [ ] **6.** Testes unitários + integração (concorrência e rollback primeiro)
- [ ] **7.** Pino, requestId, health, métricas, Swagger
- [ ] **8.** Seed, arquivo `.http`, teste em clone limpo, revisão final do README
<!-- 1 - O cadastro exige quais campos? (nome, email, senha, CPF?) Qual é o identificador único de login?
Email, nome , senha
2 - A wallet é criada automaticamente no cadastro? Com saldo inicial zero ou com algum valor? (Se zero, como você demonstra a transferência? Seed? Endpoint de depósito?)
Wallet é criada automaticamente com valor 0. Seed para o deposito e um endpoint para transferencia com historico dizendo quem enviou.
3 - Preciso de um endpoint de depósito para colocar saldo, mesmo o enunciado não pedindo? Ele entra no escopo ou fica só no seed?
Não. o Depósito seria feito via seed
4 - Quem é o destinatário na transferência: identificado por email, id da wallet ou CPF? Por quê?
Seria via id da wallet mas talvez cpf seja uma boa. prefiro o id da wallet pois um usuario pode ter mais de uma carteira, talvez nao nessa aplicaçao mas se tratando de realidade poderia ter.
5 - Existe limite de valor por transferência? Valor mínimo?
Minimo de 1 centavo e maximo nao tem. Se achar q deveria ter me diga.
6 - Posso transferir para mim mesmo?
Não posso transferir para eu mesmo
7 - Como armazeno valores: centavos em bigint ou numeric(18,2)? Por quê?
Centavos em bigint. É mais seguro pois float e outros podem deixar resquicios numericos e onde deveria ter um 0 por exemplo teria algum valor quebrado tipo um 0,00001
8 - Só uma moeda (BRL)? Preciso de campo currency?
Sera em brl mas acho q um currency nao é ruim
9 - Como a API recebe e devolve o valor: em centavos (inteiro) ou decimal? Como evito ambiguidade?
Centavos inteiro. Deixando todos os valores como centavo e fazendo uma conversao via trasnformer no backend
10 - “Reversão em caso de inconsistência”: confirmo que isso é o rollback da transação de banco?
Sim
11 - “Reversão por solicitação do usuário”: será um estorno que cria nova transferência inversa? Ou posso cancelar uma transferência pendente? (Defina se existe estado pendente ou se toda transferência é instantânea.)
Seria uma transferencia inversa. apesar de eu pretender colocar status completed e reversed as transferencias serao instantaneas pois nao tenho um provedor ou algo externo.
12 - Quem pode solicitar o estorno: só o remetente, ou o destinatário também?
Ambos
13 - Existe janela de tempo para pedir estorno (ex.: 24h)? Por quê?
Nao acho necessario o teste nao pede. se fosse algo em produçao imagino q seria bom umas 48 72 horas
14 - Pode estornar mais de uma vez a mesma transferência?
Não
15 - E se o destinatário já gastou o dinheiro e não tem saldo para o estorno? Falha, saldo negativo ou estorno parcial?
Negar, o restante nao faz sentido com o teste
16 - Um estorno pode ser estornado?
Não
17 - A transferência original é alterada ou fica imutável? Como o histórico fica auditável?
A original fica imutavel. O status muda de completed para reverted e tera um novo registro para o estorno/reversao.
18 - Qual estratégia de concorrência: lock pessimista (FOR UPDATE), otimista (version) ou nível de isolamento serializable? Por quê?
lock pessismista. pois bloqueia as duas carteiras durante a transaçao e impede erros de mandar ou receber saldo durante uma transaçao
19 - Como evito deadlock em transferências cruzadas (A→B e B→A simultâneas)?
Bloqueando as carteiras sempre na mesma ordem independente de quem tenha enviado ou recebido
20 - Como trato requisições repetidas (timeout do cliente, duplo clique)? Terei Idempotency-Key? Por quanto tempo vale?
Sim. terei indepotence key por 24 horas.
21 - O que garante no banco, além do código, que o saldo nunca fica negativo?
CHECK CONSTRAINT e udate condicional e o for update pra bloquear as carteiras
22 - Quais tabelas e relacionamentos? (users, wallets, transfers, ledger?)
wallets sempre vai ser atrelada a users e users sempre tera um wallets, tranfers tera q ter um wallei_id para saber de onde vem e para onde vai, e o ledger vai depende das transfers para ter um historico das trasnferencias seja saldo enviado, recebido ou revertido
23 - Preciso de ledger_entries ou o saldo na wallet + tabela transfers bastam? Qual o custo/benefício?
preciso de ledger entries para entender melhor o historico das transaçoes feitas
24 - O saldo é um campo armazenado ou calculado pela soma do ledger? Por quê?
Armazenado na wallets. A consulta fica mais extensa conforme o historico cresce enquanto armazenado seria apenas uma consulta do saldo
25 - Quais índices e constraints (unique, CHECK, FK) e por quê?
Tabela Índice Finalidade
users UNIQUE(email) Encontrar usuário pelo e-mail
wallets UNIQUE(user_id) Encontrar carteira do usuário
transfers (sender_wallet_id, created_at DESC) Histórico de transferências enviadas
transfers (receiver_wallet_id, created_at DESC) Histórico de transferências recebidas
ledger_entries (wallet_id, created_at DESC) Histórico financeiro da carteira
transfer_reversals UNIQUE(transfer_id) Impedir estorno duplicado
idempotency_keys UNIQUE(user_id, key) Impedir processamento duplicado
confesso que essa nao savia direito e pesquisei mas pode dar uma dica melhor
26 - Uso soft delete em algo? (Dinheiro normalmente não se apaga.)
Acho que somente em usuários e talvez nem isso, afinal é interessante manter os registros dele salvo mesmo q ele esteja desativado
27 - IDs: uuid ou serial? Por quê?
UUid nao é sequencial o q dificulta o acesso indevido. a aplicaçao gera o id antes de persistir o registro.
28 - Algoritmo de hash de senha e justificativa (argon2 vs bcrypt)?
Argon2. è memory-hard exige mais memoria ram o q dificulta ataques q tentam milhoes de senhas
29 - JWT: tempo de expiração, onde fica o secret, haverá refresh token?
tempo de expiração pode ser 15 minutos. secret vai ser armazenado no env. e o tera refresh token de 7 dias.
30 - Como impeço que um usuário veja ou movimente a wallet de outro? (O remetente vem do token, nunca do body.)
Atraves da autenticação o usuario so pode consultar e movimentar a propia carteira
31 - Quais rate limits e em quais rotas?
Rate limit global, e limites mais rigorosos nas rotas sensiveis
32 - Como evito enumeração de usuários no login e no cadastro?
Retornando o mesmo erro 401 independente de login ou senha estar errado e nao revelando se o email existe
33 - Quais dados nunca aparecem em log ou resposta?
nenhum dado que permita autenticar um usuário, movimentar dinheiro ou expor informações financeiras sensíveis deve aparecer em logs ou respostas desnecessariamente.
34 - Política de senha mínima?
Sim. Senha forte com Letra maiuscula, minuscula, caractere especial, numero e pelo menos 8 digitos
35 - Qual ORM e por quê?
Typeorm. Integraçao oficial com nest, e o typeorm permite controlar debito credito transferencias entre outros
36 -Como organizo as camadas (controller, service, repository)? Cada uma tem qual responsabilidade?
usando o mvc do nest, controller para as rotas, service para as regras de negocio e model para definir a estrutura de dados, e talvez um repository para acessar o banco.
37 - Como abstraio a transação para o service não depender do ORM?
Criando uma abstração de transação q independa do orm
38 - Quais padrões vou aplicar de fato e que problema cada um resolve? (Se não resolve problema, não entra.)
Repository pattern, unit of work, dependency inkjection, dto, strategy pattern, Guard Pattern
39 - Como represento erros de negócio e como viram status HTTP? (ex.: saldo insuficiente → 422)
Criando erros de negocio com exceçoes propias, fazenmdo a conversao ára httm em um ponto central da aplicação usando um Exception Filter global do NestJS.
40 - Quais princípios SOLID consigo apontar no código, com exemplo concreto?
srp para responsabilidade unica para classes nao terem muitas responsabilidades como uma classe q valida dados valida saldo executa consultas sql e mais coisas, pode ter uma classe para cada, OCP para codigo fechado a modificação criando abstraçoes para caso seja trocado algo apenas criar uma nova classe.
41 - Quais endpoints, métodos e códigos de resposta?
Autenticação
Método Endpoint Descrição Respostas
POST /auth/register Cadastro de usuário e criação automática da carteira 201, 400, 409
POST /auth/login Autenticação e emissão de tokens 200, 400, 401
POST /auth/refresh Renovação dos tokens 200, 401
POST /auth/logout Encerramento da sessão e revogação do refresh token 204, 401

Usuários
Método Endpoint Descrição Respostas
GET /users/me Consulta os dados do usuário autenticado 200, 401
PATCH /users/me Atualiza os dados do usuário autenticado 200, 400, 401, 409

Carteiras
Método Endpoint Descrição Respostas
GET /wallets/me Consulta a carteira e o saldo atual 200, 401
GET /wallets/me/transactions Consulta o histórico de movimentações 200, 401, 400

Transferências
Método Endpoint Descrição Respostas
POST /transfers Realiza uma transferência entre carteiras 201, 400, 401, 404, 409, 422
GET /transfers Lista transferências enviadas e recebidas 200, 401, 400
GET /transfers/:id Consulta detalhes de uma transferência 200, 401, 404
POST /transfers/:id/reversal Solicita a reversão de uma transferência 201, 401, 404, 409, 422

Códigos HTTP utilizados
Código Significado Exemplos
200 OK Consulta ou atualização realizada
201 Created Cadastro ou transferência criada
204 No Content Logout realizado
400 Bad Request Dados inválidos
401 Unauthorized Não autenticado ou token inválido
404 Not Found Usuário, carteira ou transferência inexistente
409 Conflict E-mail duplicado, chave idempotente conflitante ou transferência já revertida
422 Unprocessable Content Saldo insuficiente ou regra de negócio violada
429 Too Many Requests Limite de requisições excedido
500 Internal Server Error Erro inesperado
acabei copiando de ia, se puder dar sugestoes aceito
42 - Como pagino o histórico? (cursor ou offset, por quê?)
Cursor. offset é bom mas o historico ode crescer continuamente e cursor tem melhor desempenho em grandes histociso e nao precisa percorrer grandes quantidades de registros anteriores
43 - Versionamento da API (/v1)?
Sim, a partir da url com algo tipo /api/v1
44 - Formato padrão de erro (um JSON único para todos os erros)?
sim. um unico para todos os erros
45 - O que será logado e em que nível? O que fica de fora?
A aplicação utilizará logs estruturados em JSON, com níveis DEBUG, INFO, WARN e ERROR.

Eventos registrados:

Inicialização e encerramento da aplicação.

Requisições HTTP, incluindo método, rota, status e duração.

Autenticações bem-sucedidas e falhas de autenticação.

Transferências e reversões realizadas.

Erros de negócio relevantes e tentativas de acesso não autorizado.

Falhas inesperadas e problemas de conexão com o banco de dados.

Níveis de log:

INFO: operações normais e eventos concluídos.

WARN: situações suspeitas ou condições de negócio relevantes.

ERROR: falhas inesperadas e problemas operacionais.

DEBUG: informações detalhadas para desenvolvimento e diagnóstico.

Informações que não serão registradas:

Senhas e hashes de senhas.

Tokens de acesso e refresh tokens.

Cookies, cabeçalhos de autenticação e credenciais.

Chaves secretas e dados sensíveis desnecessários.

As requisições terão um identificador (requestId) para facilitar a rastreabilidade. Os registros técnicos serão separados do ledger financeiro, que será a fonte oficial do histórico de movimentações.
essa parte nao entendo tanto vi essa resposta de ia e gostei mas pode dar sugestao
46 - Terei request id/correlation id?
sim para ficar mais facil de rastrear operaçoes entre logs erros
47 - Haverá /health e /metrics? Quais métricas?
ambos. Será disponibilizado /metrics, em formato compatível com Prometheus, para acompanhar:

Volume de requisições HTTP.

Tempo de resposta.

Quantidade de erros.

Transferências realizadas e falhas.

Uso de memória e comportamento do Event Loop do Node.js.

As métricas não armazenarão informações pessoais ou identificadores individuais de usuários e transferências.
48 - Como o app sobe: docker compose up, migrations automáticas ou comando separado?
um único docker compose up sobe a aplicação e executa as migrations automaticamente
49 - Como funciona o seed para a demonstração?
Migrations criam a estrutura do banco.

Seed cria dados fictícios para demonstração.

Seed não deve ser executado automaticamente em produção.

Seed deve poder ser executado várias vezes sem duplicar dados.

Os créditos fictícios devem ser identificados no histórico como dados de demonstração.
50 - O que cubro com testes unitários e o que com integração?

## Estratégia de testes

A aplicação utilizará **Jest** para testes unitários e de integração, garantindo a confiabilidade das regras de negócio e o correto funcionamento dos componentes em conjunto.

### Testes unitários

Focados em validar regras de negócio isoladamente, utilizando mocks para dependências externas, sem necessidade de acessar o banco de dados.

Serão cobertos:

- **Autenticação:** validação das regras de login, tratamento de credenciais inválidas e fluxo de renovação de tokens.
- **Usuários:** validação de dados e regras de cadastro.
- **Carteiras:** validação de consultas e regras relacionadas ao saldo.
- **Transferências:** validação de valores positivos, saldo insuficiente, transferência para a própria carteira e demais regras de negócio.
- **Estornos:** validação de permissões, transferências já estornadas e saldo insuficiente na carteira de destino.
- **Idempotência:** validação do comportamento esperado para chaves repetidas e conflitos de payload.

### Testes de integração

Focados em validar a interação entre os componentes da aplicação, incluindo serviços, repositórios, banco de dados e infraestrutura HTTP.

Serão cobertos:

- **Cadastro:** criação do usuário e da carteira associada, garantindo a persistência dos dados.
- **Autenticação:** fluxo de login, validação de credenciais e acesso a rotas protegidas.
- **Transferências:** débito e crédito nas carteiras, criação dos registros de transferência e lançamentos no ledger.
- **Atomicidade:** garantia de rollback quando uma etapa da transferência falhar, evitando alterações parciais.
- **Concorrência:** validação de transferências simultâneas, impedindo saldo negativo e inconsistências.
- **Estornos:** persistência do estorno, atualização dos saldos e criação dos lançamentos inversos no ledger.
- **Idempotência:** garantia de que requisições repetidas não provoquem operações financeiras duplicadas.
- **Autorização:** garantia de que um usuário não consulte ou estorne transferências às quais não tem acesso.
- **Validações HTTP:** verificação dos códigos de resposta e do formato padronizado dos erros.

Os testes de integração utilizarão um banco PostgreSQL de testes, isolado do ambiente de desenvolvimento, para validar o comportamento real das operações e das transações.
51 - Como provo que duas transferências concorrentes não geram saldo negativo?
teste de integração que executa duas transferências simultaneamente usando o mesmo saldo inicial e verifica o resultado diretamente no PostgreSQL.
52 - Banco de teste: Testcontainers ou instância dedicada? Por quê?
Testcontainers com PostgreSQL, O principal motivo é a reprodutibilidade dos testes: qualquer pessoa que clonar o projeto consegue executar os testes utilizando uma instância isolada do mesmo banco de dados usado pela aplicação, sem precisar configurar um PostgreSQL manualmente.
53 - O que ficou fora do escopo de propósito?

## Fora do escopo

Para manter o projeto focado nos requisitos principais e evitar complexidade desnecessária, as seguintes funcionalidades não fazem parte desta implementação:

- **Depósitos e saques reais:** não haverá integração com bancos, instituições financeiras, PIX ou gateways de pagamento. Os saldos iniciais serão disponibilizados exclusivamente por dados fictícios de demonstração.
- **Transferências entre instituições:** as movimentações serão restritas às carteiras existentes dentro da própria aplicação.
- **Estornos parciais:** será permitido apenas o estorno integral de uma transferência elegível.
- **Agendamento de transferências:** todas as transferências serão processadas imediatamente, sem agendamento futuro.
- **Transferências recorrentes:** não haverá execução automática de movimentações periódicas.
- **Notificações externas:** não haverá envio de e-mails, SMS ou notificações push para informar movimentações.
- **Múltiplas carteiras por usuário:** cada usuário terá apenas uma carteira associada.
- **Múltiplas moedas:** todas as operações serão realizadas exclusivamente em BRL (Real brasileiro).
- **Conversão cambial:** não haverá operações de câmbio ou integração com provedores de cotação.
- **Aplicação frontend:** o escopo contempla exclusivamente a API REST, documentada por meio do Swagger.
- **Aplicativo mobile:** não haverá aplicação nativa ou integração específica para dispositivos móveis.
- **Microserviços:** a solução será desenvolvida como um monólito modular, sem necessidade de comunicação entre serviços independentes.
- **Infraestrutura de produção:** não serão implementados Kubernetes, alta disponibilidade, balanceamento de carga ou infraestrutura distribuída.
- **Monitoramento avançado:** não haverá implantação de uma stack completa de observabilidade, como Prometheus e Grafana.

Essas decisões não representam limitações definitivas da arquitetura, mas escolhas conscientes para concentrar o desenvolvimento nos requisitos essenciais: autenticação, movimentações financeiras, atomicidade, concorrência, idempotência, estornos e rastreabilidade.
54 - Quais as limitações conhecidas da solução? (ex.: sem fila, sem 2FA)

## Limitações conhecidas

A solução foi desenvolvida com foco em demonstrar boas práticas de arquitetura, segurança e integridade em operações financeiras. Apesar disso, existem limitações conhecidas que podem ser consideradas em uma evolução futura:

- **Ausência de filas e processamento assíncrono:** as operações financeiras são processadas de forma síncrona pela API. Não há utilização de RabbitMQ, Kafka ou outro broker de mensagens. Isso simplifica a arquitetura, mas limita estratégias de processamento assíncrono e desacoplamento de tarefas.
- **Autenticação sem 2FA:** a autenticação utiliza credenciais e tokens, sem uma segunda camada de verificação por aplicativo autenticador, SMS ou e-mail.
- **Ausência de integração bancária:** não há comunicação com instituições financeiras, PIX ou sistemas externos de pagamento.
- **Escalabilidade limitada:** a aplicação utiliza uma arquitetura de monólito modular e depende de uma única instância PostgreSQL. Não foram implementadas estratégias de alta disponibilidade ou distribuição de carga.
- **Sem processamento distribuído:** não há mecanismos de coordenação de transações entre diferentes serviços ou bancos de dados.
- **Sem notificações em tempo real:** o usuário precisa consultar a API para verificar novas movimentações. Não há WebSockets ou notificações push.
- **Sem análise antifraude avançada:** não existem modelos de detecção de fraude, análise comportamental ou sistemas automatizados de avaliação de risco.
- **Sem limites financeiros configuráveis:** não há sistema avançado de limites por usuário, horário, período ou perfil de risco.
- **Sem recuperação automatizada de operações externas:** como não existem integrações com serviços financeiros externos, não há mecanismos de compensação ou reconciliação com instituições terceiras.
- **Observabilidade básica:** a aplicação possui logs estruturados e verificações de saúde, mas não conta com uma infraestrutura completa de monitoramento distribuído, tracing ou alertas automatizados.

Essas limitações são conhecidas e não comprometem os objetivos principais da implementação. Uma evolução para um ambiente de produção financeiro exigiria avaliações adicionais de segurança, disponibilidade, escalabilidade, conformidade regulatória e prevenção a fraudes.
55 - O que faria com mais tempo? (outbox, Sentry, OpenTelemetry, refresh token, KYC, antifraude)

## Limitações conhecidas

A solução foi desenvolvida com foco em demonstrar boas práticas de arquitetura, segurança e integridade em operações financeiras. Apesar disso, existem limitações conhecidas que podem ser consideradas em uma evolução futura:

- **Ausência de filas e processamento assíncrono:** as operações financeiras são processadas de forma síncrona pela API. Não há utilização de RabbitMQ, Kafka ou outro broker de mensagens. Isso simplifica a arquitetura, mas limita estratégias de processamento assíncrono e desacoplamento de tarefas.
- **Autenticação sem 2FA:** a autenticação utiliza credenciais e tokens, sem uma segunda camada de verificação por aplicativo autenticador, SMS ou e-mail.
- **Ausência de integração bancária:** não há comunicação com instituições financeiras, PIX ou sistemas externos de pagamento.
- **Escalabilidade limitada:** a aplicação utiliza uma arquitetura de monólito modular e depende de uma única instância PostgreSQL. Não foram implementadas estratégias de alta disponibilidade ou distribuição de carga.
- **Sem processamento distribuído:** não há mecanismos de coordenação de transações entre diferentes serviços ou bancos de dados.
- **Sem notificações em tempo real:** o usuário precisa consultar a API para verificar novas movimentações. Não há WebSockets ou notificações push.
- **Sem análise antifraude avançada:** não existem modelos de detecção de fraude, análise comportamental ou sistemas automatizados de avaliação de risco.
- **Sem limites financeiros configuráveis:** não há sistema avançado de limites por usuário, horário, período ou perfil de risco.
- **Sem recuperação automatizada de operações externas:** como não existem integrações com serviços financeiros externos, não há mecanismos de compensação ou reconciliação com instituições terceiras.
- **Observabilidade básica:** a aplicação possui logs estruturados e verificações de saúde, mas não conta com uma infraestrutura completa de monitoramento distribuído, tracing ou alertas automatizados.

Essas limitações são conhecidas e não comprometem os objetivos principais da implementação. Uma evolução para um ambiente de produção financeiro exigiria avaliações adicionais de segurança, disponibilidade, escalabilidade, conformidade regulatória e prevenção a fraudes. -->
