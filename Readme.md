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

**users**: `id`, `email` (UNIQUE), `password_hash`, `created_at`, `updated_at`

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
