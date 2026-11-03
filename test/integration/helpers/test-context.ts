import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { configureApp } from '../../../src/configure-app';
import { buildDataSourceOptions } from '../../../src/database/typeorm.options';
import type { AppModule as AppModuleType } from '../../../src/app.module';

export interface TestUser {
  email: string;
  token: string;
  walletId: string;
}

export type CountableTable =
  | 'transfers'
  | 'transfer_reversals'
  | 'idempotency_keys'
  | 'users'
  | 'wallets'
  | 'ledger_entries';

export interface WalletReconciliation {
  walletId: string;
  balance: number;
  ledgerSum: number;
}

export interface DbSnapshot {
  balances: Record<string, number>;
  counts: Record<CountableTable, number>;
}

const COUNTABLE_TABLES: CountableTable[] = [
  'transfers',
  'transfer_reversals',
  'idempotency_keys',
  'users',
  'wallets',
  'ledger_entries',
];

export class TestContext {
  constructor(
    readonly app: INestApplication,
    readonly db: DataSource,
    private readonly container: StartedPostgreSqlContainer,
  ) {}

  static async create(): Promise<TestContext> {
    const container = await new PostgreSqlContainer(
      'postgres:16-alpine',
    ).start();

    process.env.DATABASE_HOST = container.getHost();
    process.env.DATABASE_PORT = String(container.getPort());
    process.env.DATABASE_USER = container.getUsername();
    process.env.DATABASE_PASSWORD = container.getPassword();
    process.env.DATABASE_NAME = container.getDatabase();
    process.env.JWT_SECRET =
      'ksjdfkjsdfkjdsakjflkasjkflmksamf,msanc,vmsklamglmfakçfkfskkfkafkasflkfakflçfdklçfças';
    // Todas as requisições do Supertest saem do mesmo IP; com o rate limit ativo, os testes recebem 429.
    process.env.THROTTLE_DISABLED = 'true';

    const migrator = new DataSource(
      buildDataSourceOptions({
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getPassword(),
        database: container.getDatabase(),
      }),
    );
    await migrator.initialize();
    await migrator.runMigrations();
    await migrator.destroy();

    // O ConfigModule.forRoot lê e congela o .env quando o app.module é avaliado, e o
    // ConfigService prioriza esse snapshot sobre o process.env. Com import estático, o
    // snapshot seria feito antes das linhas acima e a app conectaria no banco do .env
    // (o do docker compose), truncando os dados de dev. Por isso o require tardio.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../../../src/app.module') as {
      AppModule: typeof AppModuleType;
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    // Servidor já escutando: sem isso o supertest chama listen() a cada request
    // e requisições em paralelo quebram com ERR_SERVER_ALREADY_LISTEN.
    await app.listen(0);

    const db = app.get(DataSource);
    await TestContext.assertUsesContainer(db, container, app);

    return new TestContext(app, db, container);
  }

  // Barreira contra regressão: nunca rodar TRUNCATE fora do Testcontainer.
  private static async assertUsesContainer(
    db: DataSource,
    container: StartedPostgreSqlContainer,
    app: INestApplication,
  ): Promise<void> {
    const options = db.options as { host?: string; port?: number };
    if (
      options.host === container.getHost() &&
      options.port === container.getPort()
    ) {
      return;
    }

    await app.close();
    await container.stop();
    throw new Error(
      `A app de teste conectou em ${options.host}:${options.port}, não no Testcontainer ` +
        `(${container.getHost()}:${container.getPort()}). Abortado para não apagar outro banco.`,
    );
  }

  async close(): Promise<void> {
    await this.app.close();
    await this.container.stop();
  }

  http() {
    return request(this.app.getHttpServer());
  }

  async truncateAll(): Promise<void> {
    await this.db.query(
      `TRUNCATE ledger_entries, transfer_reversals, transfers, idempotency_keys, wallets, users CASCADE`,
    );
  }

  register(email: string, password = 'Senha@123') {
    return this.http().post('/api/v1/auth/register').send({ email, password });
  }

  login(email: string, password: string) {
    return this.http().post('/api/v1/auth/login').send({ email, password });
  }

  async createUser(email: string, password = 'Senha@123'): Promise<TestUser> {
    await this.register(email, password).expect(201);
    const login = await this.login(email, password).expect(200);
    const token = login.body.accessToken as string;
    const wallet = await this.http()
      .get('/api/v1/wallets/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { email, token, walletId: wallet.body.id as string };
  }

  async fund(walletId: string, cents: number): Promise<void> {
    await this.db.query(
      `UPDATE wallets SET balance_in_cents = $2 WHERE id = $1`,
      [walletId, cents],
    );
    await this.db.query(
      `INSERT INTO ledger_entries (id, wallet_id, transfer_id, direction, amount_in_cents, balance_after_in_cents, source)
       VALUES ($1, $2, NULL, 'CREDIT', $3, $3, 'DEMO_SEED')`,
      [randomUUID(), walletId, cents],
    );
  }

  transfer(
    from: TestUser,
    toWalletId: string,
    amountInCents: unknown,
    key = randomUUID(),
  ) {
    return this.http()
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${from.token}`)
      .set('Idempotency-Key', key)
      .send({ receiverWalletId: toWalletId, amountInCents });
  }

  reverse(by: TestUser, transferId: string) {
    return this.http()
      .post(`/api/v1/transfers/${transferId}/reversal`)
      .set('Authorization', `Bearer ${by.token}`);
  }

  getTransfer(by: TestUser, transferId: string) {
    return this.http()
      .get(`/api/v1/transfers/${transferId}`)
      .set('Authorization', `Bearer ${by.token}`);
  }

  async balanceOf(walletId: string): Promise<number> {
    const rows: { balance_in_cents: string }[] = await this.db.query(
      `SELECT balance_in_cents FROM wallets WHERE id = $1`,
      [walletId],
    );
    return Number(rows[0].balance_in_cents);
  }

  async statusOf(transferId: string): Promise<string> {
    const rows: { status: string }[] = await this.db.query(
      `SELECT status FROM transfers WHERE id = $1`,
      [transferId],
    );
    return rows[0].status;
  }

  async count(table: CountableTable): Promise<number> {
    const rows: { n: string }[] = await this.db.query(
      `SELECT count(*) AS n FROM ${table}`,
    );
    return Number(rows[0].n);
  }

  async snapshot(): Promise<DbSnapshot> {
    const rows: { id: string; balance_in_cents: string }[] =
      await this.db.query(
        `SELECT id, balance_in_cents FROM wallets ORDER BY id`,
      );
    const balances: Record<string, number> = {};
    for (const row of rows) balances[row.id] = Number(row.balance_in_cents);

    const counts = {} as Record<CountableTable, number>;
    for (const table of COUNTABLE_TABLES)
      counts[table] = await this.count(table);

    return { balances, counts };
  }

  async reconcile(): Promise<WalletReconciliation[]> {
    const rows: { wallet_id: string; balance: string; ledger_sum: string }[] =
      await this.db.query(`
      SELECT w.id AS wallet_id,
             w.balance_in_cents AS balance,
             COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount_in_cents ELSE -l.amount_in_cents END), 0) AS ledger_sum
        FROM wallets w
        LEFT JOIN ledger_entries l ON l.wallet_id = w.id
       GROUP BY w.id, w.balance_in_cents
    `);
    return rows.map((r) => ({
      walletId: r.wallet_id,
      balance: Number(r.balance),
      ledgerSum: Number(r.ledger_sum),
    }));
  }
}
