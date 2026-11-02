import { MigrationInterface, QueryRunner } from 'typeorm';

// Trigger em vez de REVOKE: o usuário da aplicação é dono da tabela e poderia se reconceder o privilégio.
export class LedgerAppendOnly1793641964350 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'ledger_entries é append-only: % bloqueado', TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
    END;
    $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
    CREATE TRIGGER trg_ledger_entries_append_only
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER trg_ledger_entries_append_only ON ledger_entries`,
    );
    await queryRunner.query(`DROP FUNCTION forbid_ledger_mutation()`);
  }
}
