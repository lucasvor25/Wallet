import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

const API_DESCRIPTION = `
API REST de carteira financeira: cadastro, autenticação JWT, consulta de saldo e extrato, transferência entre carteiras e estorno.

## Valores monetários
Todos os valores são **centavos inteiros** (campos \`amountInCents\`, \`balanceInCents\`, ...), moeda **BRL**. Exemplo: \`1050\` = R$ 10,50. Nunca envie decimais.

## Como autorizar
1. Chame \`POST /api/v1/auth/login\` (ou cadastre-se antes em \`POST /api/v1/auth/register\`).
2. Copie o \`accessToken\` da resposta.
3. Clique em **Authorize** e cole **só o token**, sem o prefixo \`Bearer\`. A autorização fica salva ao recarregar a página.

## Idempotência em POST /transfers
O header \`Idempotency-Key\` é **obrigatório**. Repetir a requisição com a mesma chave e o mesmo corpo não cria nova transferência: devolve a **resposta salva da primeira execução** (201, mesmo corpo). Por isso, o estado atual (por exemplo, \`REVERSED\` após um estorno) deve ser consultado em \`GET /api/v1/transfers/{id}\`. A mesma chave com outro corpo gera \`409 IDEMPOTENCY_KEY_CONFLICT\`.

## Formato de erro
Todo erro tem o mesmo corpo: \`{ statusCode, error, message, details?, requestId, timestamp, path }\`. O campo \`error\` traz o código (ex.: \`INSUFFICIENT_BALANCE\`, \`BAD_REQUEST\`), \`details\` aparece só em erros de validação e \`requestId\` é o mesmo do header \`X-Request-Id\`.

## Rate limit (por IP)
- Login e cadastro: 5 requisições/min.
- Transferência: 5 requisições/min.
- Estorno: 5 requisições/min.
- Demais rotas: \`THROTTLE_LIMIT\` requisições por janela de \`THROTTLE_TTL_MS\` (padrão 100 a cada 60 s).
- \`/health\` não tem limite.

Ao exceder, a resposta é \`429 TOO_MANY_REQUESTS\`.
`;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Wallet API')
    .setDescription(API_DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
