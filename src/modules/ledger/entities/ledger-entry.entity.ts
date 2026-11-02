import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/database/bigint.transformer';

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Column({ name: 'transfer_id', type: 'uuid', nullable: true })
  transferId!: string | null;

  @Column({ name: 'direction', type: 'varchar', length: 6 })
  direction!: 'DEBIT' | 'CREDIT';

  @Column({
    name: 'amount_in_cents',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  amountInCents!: number;

  @Column({
    name: 'balance_after_in_cents',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  balanceAfterInCents!: number;

  @Column({ name: 'source', type: 'varchar', length: 10 })
  source!: 'TRANSFER' | 'REVERSAL' | 'DEMO_SEED';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
