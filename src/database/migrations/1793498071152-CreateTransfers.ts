import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTransfers1793498071152 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
    CREATE TABLE transfers (
      id uuid PRIMARY KEY,
      sender_wallet_id uuid NOT NULL REFERENCES wallets(id),
      receiver_wallet_id uuid NOT NULL REFERENCES wallets(id),
      amount_in_cents bigint NOT NULL
        CONSTRAINT ck_transfers_amount_positive CHECK (amount_in_cents > 0),
      type varchar(10) NOT NULL
        CONSTRAINT ck_transfers_type CHECK (type IN ('TRANSFER', 'REVERSAL')),
      status varchar(10) NOT NULL
        CONSTRAINT ck_transfers_status CHECK (status IN ('COMPLETED', 'REVERSED')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_transfers_different_wallets
        CHECK (sender_wallet_id <> receiver_wallet_id)
    )
  `);
        await queryRunner.query(`
    CREATE INDEX ix_transfers_sender
      ON transfers (sender_wallet_id, created_at DESC, id DESC)
  `);
        await queryRunner.query(`
    CREATE INDEX ix_transfers_receiver
      ON transfers (receiver_wallet_id, created_at DESC, id DESC)
  `);

        await queryRunner.query(`
    CREATE TABLE transfer_reversals (
      id uuid PRIMARY KEY,
      original_transfer_id uuid NOT NULL UNIQUE REFERENCES transfers(id),
      reversal_transfer_id uuid NOT NULL UNIQUE REFERENCES transfers(id),
      requested_by_user_id uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_reversals_different_transfers
        CHECK (original_transfer_id <> reversal_transfer_id)
    )
  `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE transfer_reversals`);
        await queryRunner.query(`DROP TABLE transfers`);
    }

}
