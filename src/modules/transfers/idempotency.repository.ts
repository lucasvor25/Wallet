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

  async tryInsert(entry: NewIdempotencyKey): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(IdempotencyKey)
      .values({
        ...entry,
        responseStatus: null,
        responseBody: null,
      })
      .orIgnore()
      .returning('id')
      .execute();

    return result.identifiers.length > 0;
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
    await this.repo.update(id, {
      requestHash,
      expiresAt,
      responseStatus: null,
      responseBody: null,
    });
  }

  async saveResponse(
    id: string,
    responseStatus: number,
    responseBody: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.query(
      'UPDATE idempotency_keys SET response_status = $1, response_body = $2::jsonb WHERE id = $3',
      [responseStatus, JSON.stringify(responseBody), id],
    );
  }
}
