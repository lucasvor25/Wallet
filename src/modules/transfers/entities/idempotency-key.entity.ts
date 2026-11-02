import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'key', type: 'varchar', length: 128 })
  key!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ name: 'response_status', type: 'smallint', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: Record<string, unknown> | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
