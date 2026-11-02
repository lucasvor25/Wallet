import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdempotencyKeys1793498130364 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    CREATE TABLE idempotency_keys (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id),
      key varchar(128) NOT NULL,
      request_hash char(64) NOT NULL,
      response_status smallint,
      response_body jsonb,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_idempotency_user_key UNIQUE (user_id, key)
    )
  `);
    await queryRunner.query(`
    CREATE INDEX ix_idempotency_expires_at ON idempotency_keys (expires_at)
  `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE idempotency_keys`);
  }
}
