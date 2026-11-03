import { Injectable } from '@nestjs/common';
import { WalletNotFoundError } from '../../common/errors/domain-errors';
import { LedgerRepository } from '../ledger/ledger.repository';
import { TransactionsPageDto } from './dto/transactions-page.dto';
import { WalletResponseDto } from './dto/wallet.response.dto';
import { decodeCursor, encodeCursor } from './transactions-cursor';
import { WalletsRepository } from './wallets.repository';

@Injectable()
export class WalletsService {
  constructor(
    private readonly wallets: WalletsRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  async getByUserId(userId: string): Promise<WalletResponseDto> {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) throw new WalletNotFoundError();

    return {
      id: wallet.id,
      balanceInCents: wallet.balanceInCents,
      currency: wallet.currency,
    };
  }

  async listTransactions(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<TransactionsPageDto> {
    const after = cursor === undefined ? undefined : decodeCursor(cursor);

    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) throw new WalletNotFoundError();

    const entries = await this.ledger.findPageByWallet(
      wallet.id,
      limit + 1,
      after,
    );
    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;
    const lastEntry = page[page.length - 1];

    return {
      items: page.map((entry) => ({
        id: entry.id,
        transferId: entry.transferId,
        direction: entry.direction,
        amountInCents: entry.amountInCents,
        balanceAfterInCents: entry.balanceAfterInCents,
        source: entry.source,
        counterpartyWalletId: entry.counterpartyWalletId,
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor:
        hasMore && lastEntry
          ? encodeCursor({
              createdAt: lastEntry.cursorCreatedAt,
              id: lastEntry.id,
            })
          : null,
    };
  }
}
