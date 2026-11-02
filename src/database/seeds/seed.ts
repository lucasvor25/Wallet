import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../app.module';
import { EmailAlreadyRegisteredError } from '../../common/errors/domain-errors';
import { TransactionManager } from '../../common/database/transaction-manager';
import { AuthService } from '../../modules/auth/auth.service';
import { LedgerRepository } from '../../modules/ledger/ledger.repository';
import { WalletsRepository } from '../../modules/wallets/wallets.repository';

interface DemoUser {
  email: string;
  balanceInCents: number;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'alice@example.com', balanceInCents: 100_000 },
  { email: 'bob@example.com', balanceInCents: 50_000 },
];

const DEFAULT_SEED_PASSWORD = 'Demo@12345';

async function seed(): Promise<void> {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const auth = app.get(AuthService);
    const tx = app.get(TransactionManager);
    const wallets = app.get(WalletsRepository);
    const ledger = app.get(LedgerRepository);
    const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_SEED_PASSWORD;

    logger.warn(
      'Seed de demonstração: apenas para uso local, nunca em produção.',
    );

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
      } catch (err) {
        if (err instanceof EmailAlreadyRegisteredError) {
          logger.log(`Já existe: ${demo.email}`);
          continue;
        }
        throw err;
      }
    }
  } finally {
    await app.close();
  }
}

seed().catch((err: unknown) => {
  new Logger('Seed').error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
