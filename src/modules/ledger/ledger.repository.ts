import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TransactionManager } from '../../common/database/transaction-manager';
import { LedgerEntry } from './entities/ledger-entry.entity';

@Injectable()
export class LedgerRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get repo(): Repository<LedgerEntry> {
    return this.tx.manager.getRepository(LedgerEntry);
  }

  async insertMany(entries: Omit<LedgerEntry, 'createdAt'>[]): Promise<void> {
    await this.repo.insert(entries);
  }
}
