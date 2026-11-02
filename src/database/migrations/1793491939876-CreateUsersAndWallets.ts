import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndWallets1793491939876 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      email varchar(254) NOT NULL,
      password_hash varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
    await queryRunner.query(`
    CREATE UNIQUE INDEX uq_users_email ON users (lower(email))
  `);

    await queryRunner.query(`
    CREATE TABLE wallets (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL UNIQUE REFERENCES users(id),
      balance_in_cents bigint NOT NULL DEFAULT 0
    CONSTRAINT ck_wallets_balance_non_negative CHECK (balance_in_cents >= 0),
      currency char(3) NOT NULL DEFAULT 'BRL',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE wallets`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
