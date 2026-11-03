import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../app.module';
import { EmailAlreadyRegisteredError } from '../../common/errors/domain-errors';
import { TransactionManager } from '../../common/database/transaction-manager';
import { AuthService } from '../../modules/auth/auth.service';
import { LedgerRepository } from '../../modules/ledger/ledger.repository';
import { UsersRepository } from '../../modules/users/users.repository';
import { WalletsRepository } from '../../modules/wallets/wallets.repository';

interface DemoUser {
  email: string;
  balanceInCents: number;
}

interface SeededUser {
  email: string;
  walletId: string;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'alice@example.com', balanceInCents: 100_000 },
  { email: 'bob@example.com', balanceInCents: 50_000 },
];

const DEFAULT_SEED_PASSWORD = 'Demo@12345';

const logger = new Logger('Seed');

// Checado antes de subir o contexto: com o seed desligado nem conecta no banco.
// Sai com 0 para não travar o compose (a API depende do seed concluir com sucesso).
function isSeedEnabled(): boolean {
  const enabled = process.env.SEED_DEMO?.trim().toLowerCase() === 'true';
  return enabled && process.env.NODE_ENV !== 'production';
}

async function seed(): Promise<void> {
  if (!isSeedEnabled()) {
    logger.log(
      'Seed ignorado (requer SEED_DEMO=true e NODE_ENV diferente de production).',
    );
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const auth = app.get(AuthService);
    const tx = app.get(TransactionManager);
    const users = app.get(UsersRepository);
    const wallets = app.get(WalletsRepository);
    const ledger = app.get(LedgerRepository);
    const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_SEED_PASSWORD;

    logger.warn(
      'Seed de demonstração: apenas para uso local, nunca em produção.',
    );

    const seeded: SeededUser[] = [];

    for (const demo of DEMO_USERS) {
      try {
        const { walletId } = await auth.register({
          email: demo.email,
          password,
        });

        await tx.run(async () => {
          await wallets.updateBalance(walletId, demo.balanceInCents);
          await ledger.insertMany([
            {
              id: randomUUID(),
              walletId,
              transferId: null,
              direction: 'CREDIT',
              amountInCents: demo.balanceInCents,
              balanceAfterInCents: demo.balanceInCents,
              source: 'DEMO_SEED',
            },
          ]);
        });

        logger.log(`Criado: ${demo.email} (wallet ${walletId})`);
        seeded.push({ email: demo.email, walletId });
      } catch (err) {
        if (!(err instanceof EmailAlreadyRegisteredError)) throw err;

        const walletId = await findWalletId(users, wallets, demo.email);
        logger.log(
          `Já existe: ${demo.email} (wallet ${walletId}); saldo não alterado`,
        );
        seeded.push({ email: demo.email, walletId });
      }
    }

    logger.log(summary(seeded));
  } finally {
    await app.close();
  }
}

async function findWalletId(
  users: UsersRepository,
  wallets: WalletsRepository,
  email: string,
): Promise<string> {
  const user = await users.findByEmail(email);
  const wallet = user ? await wallets.findByUserId(user.id) : null;
  return wallet?.id ?? 'carteira não encontrada';
}

function summary(seeded: SeededUser[]): string {
  const base = `http://localhost:${process.env.API_PORT ?? '3000'}`;
  const lines = [
    '',
    '================ Ambiente de demonstração ================',
    `Swagger: ${base}/docs`,
    `Health:  ${base}/health/ready`,
    'Senha dos usuários: SEED_USER_PASSWORD do .env',
    ...seeded.map((u) => `${u.email.padEnd(20)} wallet ${u.walletId}`),
    '==========================================================',
  ];
  return lines.join('\n');
}

seed().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
