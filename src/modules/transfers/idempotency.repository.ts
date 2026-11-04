import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TransactionManager } from '../../common/database/transaction-manager';
import { IdempotencyKey } from './entities/idempotency-key.entity';

export interface NewIdempotencyKey {
  id: string;
  userId: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
}

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get repo(): Repository<IdempotencyKey> {
    return this.tx.manager.getRepository(IdempotencyKey);
  }

  async tryInsert(row: NewIdempotencyKey): Promise<boolean> {
    const rows: unknown[] = await this.tx.manager.query(
      `INSERT INTO idempotency_keys (id, user_id, key, request_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, key) DO NOTHING
     RETURNING id`,
      [row.id, row.userId, row.key, row.requestHash, row.expiresAt],
    );
    return rows.length > 0;
  }

  lockByUserAndKey(
    userId: string,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return this.repo
      .createQueryBuilder('ik')
      .setLock('pessimistic_write')
      .where('ik.userId = :userId AND ik.key = :key', { userId, key })
      .getOne();
  }

  async reset(id: string, requestHash: string, expiresAt: Date): Promise<void> {
    await this.tx.manager.query(
      `UPDATE idempotency_keys
        SET request_hash = $2,
            expires_at = $3,
            response_status = NULL,
            response_body = NULL
      WHERE id = $1`,
      [id, requestHash, expiresAt],
    );
  }

  async saveResponse(id: string, status: number, body: object): Promise<void> {
    const updateResult = await this.repo.update(
      { id },
      { responseStatus: status, responseBody: body },
    );
    if (updateResult.affected !== 1) {
      throw new Error(
        `Idempotency record ${id} not found when saving response`,
      );
    }
  }
}
