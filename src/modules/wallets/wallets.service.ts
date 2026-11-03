import { Injectable } from '@nestjs/common';
import { WalletsRepository } from './wallets.repository';
import { WalletResponseDto } from './dto/wallet.response.dto';
import { WalletNotFoundError } from '../../common/errors/domain-errors';
import { LedgerRepository } from '../ledger/ledger.repository';
import { TransactionsPageDto } from './dto/transactions-page.dto';
import { decodeCursor, encodeCursor } from './transactions-cursor';

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

    const rows = await this.ledger.findPageByWallet(
      wallet.id,
      limit + 1,
      after,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((r) => ({
        id: r.id,
        transferId: r.transferId,
        direction: r.direction,
        amountInCents: r.amountInCents,
        balanceAfterInCents: r.balanceAfterInCents,
        source: r.source,
        counterpartyWalletId: r.counterpartyWalletId,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.cursorCreatedAt, id: last.id })
          : null,
    };
  }
}
