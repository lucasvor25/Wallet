import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { TransactionManager } from '../../common/database/transaction-manager';
import {
  AmountExceedsLimitError,
  BalanceLimitExceededError,
  IdempotencyKeyConflictError,
  InsufficientBalanceError,
  ReversalFundsUnavailableError,
  ReversalNotAllowedError,
  ReversalWindowExpiredError,
  SelfTransferError,
  TransferAlreadyReversedError,
  TransferNotFoundError,
  TransferNotReversibleError,
  WalletNotFoundError,
} from '../../common/errors/domain-errors';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { LedgerRepository } from '../ledger/ledger.repository';
import { Wallet } from '../wallets/wallet.entity';
import { WalletsRepository } from '../wallets/wallets.repository';
import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  toTransferResponse,
  TransferResponseDto,
} from './dto/transfer-response.dto';
import { Transfer } from './entities/transfer.entity';
import { IdempotencyRepository } from './idempotency.repository';
import { TransfersRepository } from './transfers.repository';

type CreateOutcome =
  | { replayed: true; response: TransferResponseDto }
  | { replayed: false; transfer: Transfer };

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly tx: TransactionManager,
    private readonly wallets: WalletsRepository,
    private readonly transfers: TransfersRepository,
    private readonly ledger: LedgerRepository,
    private readonly idempotency: IdempotencyRepository,
    private readonly config: ConfigService,
  ) {}

  async create(
    userId: string,
    idempotencyKey: string,
    dto: CreateTransferDto,
  ): Promise<TransferResponseDto> {
    const maxCents = this.config.getOrThrow<number>('MAX_TRANSFER_CENTS');
    if (dto.amountInCents > maxCents)
      throw new AmountExceedsLimitError(maxCents);

    const requestHash = this.hashRequest(dto);

    const outcome = await this.tx.run<CreateOutcome>(async () => {
      const now = new Date();
      const ttlHours = this.config.getOrThrow<number>('IDEMPOTENCY_TTL_HOURS');
      const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
      const candidateId = randomUUID();

      const inserted = await this.idempotency.tryInsert({
        id: candidateId,
        userId,
        key: idempotencyKey,
        requestHash,
        expiresAt,
      });

      let idempotencyId: string = candidateId;

      if (!inserted) {
        const existing = await this.idempotency.lockByUserAndKey(
          userId,
          idempotencyKey,
        );
        if (!existing) throw new IdempotencyKeyConflictError();

        idempotencyId = existing.id;

        if (existing.expiresAt.getTime() <= now.getTime()) {
          await this.idempotency.reset(existing.id, requestHash, expiresAt);
        } else if (existing.requestHash !== requestHash) {
          throw new IdempotencyKeyConflictError();
        } else if (existing.responseBody !== null) {
          return {
            replayed: true,
            response: existing.responseBody as unknown as TransferResponseDto,
          };
        } else {
          throw new IdempotencyKeyConflictError();
        }
      }

      const transfer = await this.applyTransfer(userId, dto);
      await this.idempotency.saveResponse(idempotencyId, 201, {
        ...toTransferResponse(transfer),
      });

      return { replayed: false, transfer };
    });

    if (outcome.replayed) return outcome.response;

    this.logger.log({
      event: 'transfer.completed',
      transferId: outcome.transfer.id,
    });
    return toTransferResponse(outcome.transfer);
  }

  private async applyTransfer(
    userId: string,
    dto: CreateTransferDto,
  ): Promise<Transfer> {
    const senderRef = await this.wallets.findByUserId(userId);
    if (!senderRef) throw new WalletNotFoundError();
    if (senderRef.id === dto.receiverWalletId) throw new SelfTransferError();

    const [sender, receiver] = await this.lockPair(
      senderRef.id,
      dto.receiverWalletId,
    );
    if (sender.balanceInCents < dto.amountInCents) {
      throw new InsufficientBalanceError();
    }

    const newSenderBalance = sender.balanceInCents - dto.amountInCents;
    const newReceiverBalance = receiver.balanceInCents + dto.amountInCents;

    if (
      !Number.isSafeInteger(newSenderBalance) ||
      !Number.isSafeInteger(newReceiverBalance)
    ) {
      throw new BalanceLimitExceededError();
    }

    const created: Transfer = {
      id: randomUUID(),
      senderWalletId: sender.id,
      receiverWalletId: receiver.id,
      amountInCents: dto.amountInCents,
      createdAt: new Date(),
      type: 'TRANSFER',
      status: 'COMPLETED',
    };

    await this.wallets.updateBalance(sender.id, newSenderBalance);
    await this.wallets.updateBalance(receiver.id, newReceiverBalance);
    await this.transfers.insert(created);
    await this.ledger.insertMany([
      this.entry(
        sender.id,
        created.id,
        'DEBIT',
        created.amountInCents,
        newSenderBalance,
        'TRANSFER',
      ),
      this.entry(
        receiver.id,
        created.id,
        'CREDIT',
        created.amountInCents,
        newReceiverBalance,
        'TRANSFER',
      ),
    ]);
    return created;
  }

  async reverse(
    userId: string,
    transferId: string,
  ): Promise<TransferResponseDto> {
    const windowMs =
      this.config.getOrThrow<number>('REVERSAL_WINDOW_HOURS') * 3_600_000;

    const reversal = await this.tx.run(async () => {
      const probe = await this.transfers.findById(transferId);
      const userWallet = await this.wallets.findByUserId(userId);
      if (!userWallet) throw new WalletNotFoundError();
      if (!probe) throw new TransferNotFoundError();

      const isSender = probe.senderWalletId === userWallet.id;
      const isReceiver = probe.receiverWalletId === userWallet.id;
      if (!isSender && !isReceiver) throw new TransferNotFoundError();
      if (!isSender) throw new ReversalNotAllowedError();

      const [sender, receiver] = await this.lockPair(
        probe.senderWalletId,
        probe.receiverWalletId,
      );

      const original = await this.transfers.lockById(transferId);
      if (!original) throw new TransferNotFoundError();
      if (original.type !== 'TRANSFER') throw new TransferNotReversibleError();
      if (original.status === 'REVERSED')
        throw new TransferAlreadyReversedError();
      if (Date.now() - original.createdAt.getTime() > windowMs)
        throw new ReversalWindowExpiredError();

      const amount = original.amountInCents;
      if (receiver.balanceInCents < amount)
        throw new ReversalFundsUnavailableError();
      const newReceiverBalance = receiver.balanceInCents - amount;
      const newSenderBalance = sender.balanceInCents + amount;

      if (!Number.isSafeInteger(newSenderBalance))
        throw new BalanceLimitExceededError();

      const created: Transfer = {
        id: randomUUID(),
        senderWalletId: receiver.id,
        receiverWalletId: sender.id,
        amountInCents: amount,
        type: 'REVERSAL',
        status: 'COMPLETED',
        createdAt: new Date(),
      };

      await this.wallets.updateBalance(receiver.id, newReceiverBalance);
      await this.wallets.updateBalance(sender.id, newSenderBalance);
      await this.transfers.insert(created);
      await this.transfers.insertReversalLink({
        id: randomUUID(),
        originalTransferId: original.id,
        reversalTransferId: created.id,
        requestedByUserId: userId,
      });
      await this.transfers.markReversed(original.id);
      await this.ledger.insertMany([
        this.entry(
          receiver.id,
          created.id,
          'DEBIT',
          amount,
          newReceiverBalance,
          'REVERSAL',
        ),
        this.entry(
          sender.id,
          created.id,
          'CREDIT',
          amount,
          newSenderBalance,
          'REVERSAL',
        ),
      ]);
      return created;
    });
    this.logger.log({
      event: 'transfer.reversed',
      transferId,
      reversalId: reversal.id,
    });
    return toTransferResponse(reversal);
  }

  async getById(
    userId: string,
    transferId: string,
  ): Promise<TransferResponseDto> {
    const wallet = await this.wallets.findByUserId(userId);
    const transfer = await this.transfers.findById(transferId);
    if (!wallet || !transfer) throw new TransferNotFoundError();
    const participant =
      transfer.senderWalletId === wallet.id ||
      transfer.receiverWalletId === wallet.id;
    if (!participant) throw new TransferNotFoundError();

    return toTransferResponse(transfer);
  }

  private hashRequest(dto: CreateTransferDto): string {
    const payload = JSON.stringify({
      receiverWalletId: dto.receiverWalletId,
      amountInCents: dto.amountInCents,
    });

    return createHash('sha256').update(payload).digest('hex');
  }

  private async lockPair(idA: string, idB: string): Promise<[Wallet, Wallet]> {
    const [firstId, secondId] = [idA, idB].sort();
    const first = await this.wallets.lockById(firstId);
    const second = await this.wallets.lockById(secondId);
    if (!first || !second) throw new WalletNotFoundError();
    return idA === firstId ? [first, second] : [second, first];
  }

  private entry(
    walletId: string,
    transferId: string,
    direction: 'DEBIT' | 'CREDIT',
    amountInCents: number,
    balanceAfterInCents: number,
    source: 'TRANSFER' | 'REVERSAL',
  ): Omit<LedgerEntry, 'createdAt'> {
    return {
      id: randomUUID(),
      walletId,
      transferId,
      direction,
      amountInCents,
      balanceAfterInCents,
      source,
    };
  }
}
