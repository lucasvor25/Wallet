import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TransactionManager } from '../../common/database/transaction-manager';
import { Transfer } from './entities/transfer.entity';
import { TransferReversal } from './entities/transfer-reversal.entity';

@Injectable()
export class TransfersRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get repo(): Repository<Transfer> {
    return this.tx.manager.getRepository(Transfer);
  }

  private get reversalRepo(): Repository<TransferReversal> {
    return this.tx.manager.getRepository(TransferReversal);
  }

  async insert(transfer: Transfer): Promise<void> {
    await this.repo.insert(transfer);
  }

  findById(id: string): Promise<Transfer | null> {
    return this.repo.findOne({ where: { id } });
  }

  lockById(id: string): Promise<Transfer | null> {
    return this.repo
      .createQueryBuilder('t')
      .setLock('pessimistic_write')
      .where('t.id = :id', { id })
      .getOne();
  }

  async markReversed(id: string): Promise<void> {
    await this.repo.update(id, { status: 'REVERSED' });
  }

  async insertReversalLink(
    link: Omit<TransferReversal, 'createdAt'>,
  ): Promise<void> {
    await this.reversalRepo.insert(link);
  }
}
