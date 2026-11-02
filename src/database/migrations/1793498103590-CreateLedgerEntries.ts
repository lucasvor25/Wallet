import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedgerEntries1793498103590 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    CREATE TABLE ledger_entries (
      id uuid PRIMARY KEY,
      wallet_id uuid NOT NULL REFERENCES wallets(id),
      transfer_id uuid REFERENCES transfers(id),
      direction varchar(6) NOT NULL
        CONSTRAINT ck_ledger_direction CHECK (direction IN ('DEBIT', 'CREDIT')),
      amount_in_cents bigint NOT NULL
        CONSTRAINT ck_ledger_amount_positive CHECK (amount_in_cents > 0),
      balance_after_in_cents bigint NOT NULL
        CONSTRAINT ck_ledger_balance_after_non_negative CHECK (balance_after_in_cents >= 0),
      source varchar(10) NOT NULL
        CONSTRAINT ck_ledger_source CHECK (source IN ('TRANSFER', 'REVERSAL', 'DEMO_SEED')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_ledger_transfer_matches_source
        CHECK ((source = 'DEMO_SEED') = (transfer_id IS NULL))
    )
  `);
    await queryRunner.query(`
    CREATE INDEX ix_ledger_wallet
      ON ledger_entries (wallet_id, created_at DESC, id DESC)
  `);
    await queryRunner.query(`
    CREATE INDEX ix_ledger_transfer ON ledger_entries (transfer_id)
  `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE ledger_entries`);
  }
}
