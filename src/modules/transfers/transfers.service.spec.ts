import { ConfigService } from '@nestjs/config';
import { TransactionManager } from '../../common/database/transaction-manager';
import {
  AmountExceedsLimitError,
  InsufficientBalanceError,
  SelfTransferError,
  TransferAlreadyReversedError,
} from '../../common/errors/domain-errors';
import { LedgerRepository } from '../ledger/ledger.repository';
import { Wallet } from '../wallets/wallet.entity';
import { WalletsRepository } from '../wallets/wallets.repository';
import { Transfer } from './entities/transfer.entity';
import { IdempotencyRepository } from './idempotency.repository';
import { TransfersRepository } from './transfers.repository';
import { TransfersService } from './transfers.service';

const USER_ID = 'user-alice';
const ALICE_WALLET = '11111111-1111-4111-8111-111111111111';
const BOB_WALLET = '22222222-2222-4222-8222-222222222222';
const MAX_TRANSFER_CENTS = 5_000_000;

const CONFIG: Record<string, number> = {
  MAX_TRANSFER_CENTS,
  REVERSAL_WINDOW_HOURS: 72,
  IDEMPOTENCY_TTL_HOURS: 24,
};

function wallet(id: string, balanceInCents: number): Wallet {
  return { id, userId: `owner-${id}`, balanceInCents } as Wallet;
}

describe('TransfersService', () => {
  let service: TransfersService;
  let tx: { run: jest.Mock };
  let wallets: jest.Mocked<
    Pick<WalletsRepository, 'findByUserId' | 'lockById' | 'updateBalance'>
  >;
  let transfers: jest.Mocked<
    Pick<
      TransfersRepository,
      'insert' | 'findById' | 'lockById' | 'markReversed' | 'insertReversalLink'
    >
  >;
  let ledger: jest.Mocked<Pick<LedgerRepository, 'insertMany'>>;
  let idempotency: jest.Mocked<
    Pick<IdempotencyRepository, 'tryInsert' | 'saveResponse'>
  >;

  beforeEach(() => {
    tx = { run: jest.fn((work: () => Promise<unknown>) => work()) };
    wallets = {
      findByUserId: jest.fn(),
      lockById: jest.fn(),
      updateBalance: jest.fn(),
    };
    transfers = {
      insert: jest.fn(),
      findById: jest.fn(),
      lockById: jest.fn(),
      markReversed: jest.fn(),
      insertReversalLink: jest.fn(),
    };
    ledger = { insertMany: jest.fn() };
    idempotency = {
      tryInsert: jest.fn().mockResolvedValue(true),
      saveResponse: jest.fn(),
    };
    const config = {
      getOrThrow: jest.fn((key: string) => CONFIG[key]),
    };

    service = new TransfersService(
      tx as unknown as TransactionManager,
      wallets as unknown as WalletsRepository,
      transfers as unknown as TransfersRepository,
      ledger as unknown as LedgerRepository,
      idempotency as unknown as IdempotencyRepository,
      config as unknown as ConfigService,
    );
  });

  function givenWallets(aliceBalance: number, bobBalance = 0): void {
    const byId: Record<string, Wallet> = {
      [ALICE_WALLET]: wallet(ALICE_WALLET, aliceBalance),
      [BOB_WALLET]: wallet(BOB_WALLET, bobBalance),
    };
    wallets.findByUserId.mockResolvedValue(byId[ALICE_WALLET]);
    wallets.lockById.mockImplementation((id: string) =>
      Promise.resolve(byId[id] ?? null),
    );
  }

  function expectNoFinancialWrites(): void {
    expect(wallets.updateBalance).not.toHaveBeenCalled();
    expect(transfers.insert).not.toHaveBeenCalled();
    expect(ledger.insertMany).not.toHaveBeenCalled();
  }

  describe('create', () => {
    it('rejeita valor acima do limite antes de abrir transação', async () => {
      givenWallets(100_000_000);

      await expect(
        service.create(USER_ID, 'key-1', {
          receiverWalletId: BOB_WALLET,
          amountInCents: MAX_TRANSFER_CENTS + 1,
        }),
      ).rejects.toBeInstanceOf(AmountExceedsLimitError);

      expect(tx.run).not.toHaveBeenCalled();
      expectNoFinancialWrites();
    });

    it('aceita valor exatamente igual ao limite', async () => {
      givenWallets(MAX_TRANSFER_CENTS);

      const res = await service.create(USER_ID, 'key-1', {
        receiverWalletId: BOB_WALLET,
        amountInCents: MAX_TRANSFER_CENTS,
      });

      expect(res.amountInCents).toBe(MAX_TRANSFER_CENTS);
    });

    it('rejeita com saldo insuficiente e não grava nada', async () => {
      givenWallets(9_999);

      await expect(
        service.create(USER_ID, 'key-1', {
          receiverWalletId: BOB_WALLET,
          amountInCents: 10_000,
        }),
      ).rejects.toBeInstanceOf(InsufficientBalanceError);

      expectNoFinancialWrites();
      expect(idempotency.saveResponse).not.toHaveBeenCalled();
    });

    it('valida o saldo com o valor lido depois do lock, não antes', async () => {
      // findByUserId vê saldo alto; o lock devolve o saldo real, já consumido por outra transação.
      wallets.findByUserId.mockResolvedValue(wallet(ALICE_WALLET, 100_000));
      wallets.lockById.mockImplementation((id: string) =>
        Promise.resolve(
          id === ALICE_WALLET
            ? wallet(ALICE_WALLET, 5_000)
            : wallet(BOB_WALLET, 0),
        ),
      );

      await expect(
        service.create(USER_ID, 'key-1', {
          receiverWalletId: BOB_WALLET,
          amountInCents: 10_000,
        }),
      ).rejects.toBeInstanceOf(InsufficientBalanceError);

      expectNoFinancialWrites();
    });

    it('debita e credita quando o saldo é exatamente o valor', async () => {
      givenWallets(10_000, 500);

      await service.create(USER_ID, 'key-1', {
        receiverWalletId: BOB_WALLET,
        amountInCents: 10_000,
      });

      expect(wallets.updateBalance).toHaveBeenCalledWith(ALICE_WALLET, 0);
      expect(wallets.updateBalance).toHaveBeenCalledWith(BOB_WALLET, 10_500);
      expect(ledger.insertMany).toHaveBeenCalledTimes(1);
    });

    it('rejeita transferência para a própria carteira sem travar linhas', async () => {
      givenWallets(100_000);

      await expect(
        service.create(USER_ID, 'key-1', {
          receiverWalletId: ALICE_WALLET,
          amountInCents: 1_000,
        }),
      ).rejects.toBeInstanceOf(SelfTransferError);

      expect(wallets.lockById).not.toHaveBeenCalled();
      expectNoFinancialWrites();
    });

    it('trava as carteiras sempre em ordem crescente de id', async () => {
      givenWallets(0, 100_000);
      wallets.findByUserId.mockResolvedValue(wallet(BOB_WALLET, 100_000));

      await service.create(USER_ID, 'key-1', {
        receiverWalletId: ALICE_WALLET,
        amountInCents: 1_000,
      });

      expect(wallets.lockById.mock.calls.map(([id]) => id)).toEqual([
        ALICE_WALLET,
        BOB_WALLET,
      ]);
    });
  });

  describe('reverse', () => {
    function original(status: Transfer['status']): Transfer {
      return {
        id: 'transfer-1',
        senderWalletId: ALICE_WALLET,
        receiverWalletId: BOB_WALLET,
        amountInCents: 30_000,
        type: 'TRANSFER',
        status,
        createdAt: new Date(),
      };
    }

    it('rejeita estorno de transferência já estornada e não grava nada', async () => {
      givenWallets(70_000, 30_000);
      transfers.findById.mockResolvedValue(original('REVERSED'));
      transfers.lockById.mockResolvedValue(original('REVERSED'));

      await expect(
        service.reverse(USER_ID, 'transfer-1'),
      ).rejects.toBeInstanceOf(TransferAlreadyReversedError);

      expectNoFinancialWrites();
      expect(transfers.markReversed).not.toHaveBeenCalled();
      expect(transfers.insertReversalLink).not.toHaveBeenCalled();
    });

    it('decide pelo status lido com lock, não pela leitura inicial', async () => {
      // Sem lock a leitura inicial diz COMPLETED; com lock, um estorno concorrente já marcou REVERSED.
      givenWallets(70_000, 30_000);
      transfers.findById.mockResolvedValue(original('COMPLETED'));
      transfers.lockById.mockResolvedValue(original('REVERSED'));

      await expect(
        service.reverse(USER_ID, 'transfer-1'),
      ).rejects.toBeInstanceOf(TransferAlreadyReversedError);

      expectNoFinancialWrites();
    });
  });
});
