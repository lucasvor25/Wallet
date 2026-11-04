import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TransactionManager } from '../../common/database/transaction-manager';
import { LedgerEntry } from './entities/ledger-entry.entity';

export interface LedgerPageRow {
  id: string;
  transferId: string | null;
  direction: LedgerEntry['direction'];
  amountInCents: number;
  balanceAfterInCents: number;
  source: LedgerEntry['source'];
  counterpartyWalletId: string | null;
  createdAt: Date;
  cursorCreatedAt: string;
}

interface RawLedgerPageRow {
  id: string;
  transfer_id: string | null;
  direction: LedgerEntry['direction'];
  amount_in_cents: string;
  balance_after_in_cents: string;
  source: LedgerEntry['source'];
  counterparty_wallet_id: string | null;
  created_at: Date;
  cursor_created_at: string;
}

const PAGE_SELECT = `
  SELECT l.id,
         l.transfer_id,
         l.direction,
         l.amount_in_cents,
         l.balance_after_in_cents,
         l.source,
         CASE l.direction
           WHEN 'DEBIT' THEN t.receiver_wallet_id
           WHEN 'CREDIT' THEN t.sender_wallet_id
         END AS counterparty_wallet_id,
         l.created_at,
         to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
    FROM ledger_entries l
    LEFT JOIN transfers t ON t.id = l.transfer_id`;

@Injectable()
export class LedgerRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get repo(): Repository<LedgerEntry> {
    return this.tx.manager.getRepository(LedgerEntry);
  }

  async insertMany(entries: Omit<LedgerEntry, 'createdAt'>[]): Promise<void> {
    await this.repo.insert(entries);
  }

  async findPageByWallet(
    walletId: string,
    take: number,
    after?: { createdAt: string; id: string },
  ): Promise<LedgerPageRow[]> {
    const rows: RawLedgerPageRow[] = after
      ? await this.tx.manager.query(
          `${PAGE_SELECT}
           WHERE l.wallet_id = $1
             AND (l.created_at, l.id) < ($2::timestamptz, $3::uuid)
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT $4`,
          [walletId, after.createdAt, after.id, take],
        )
      : await this.tx.manager.query(
          `${PAGE_SELECT}
           WHERE l.wallet_id = $1
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT $2`,
          [walletId, take],
        );

    return rows.map((row) => ({
      id: row.id,
      transferId: row.transfer_id,
      direction: row.direction,
      amountInCents: toSafeInteger(row.amount_in_cents),
      balanceAfterInCents: toSafeInteger(row.balance_after_in_cents),
      source: row.source,
      counterpartyWalletId: row.counterparty_wallet_id,
      createdAt: row.created_at,
      cursorCreatedAt: row.cursor_created_at,
    }));
  }
}

// Query crua não passa pelo bigintTransformer; mesma regra: falhar em vez de perder precisão
function toSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Valor do banco excede 2^53-1: ${value}`);
  }
  return parsed;
}
