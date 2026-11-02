import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/database/bigint.transformer';

@Entity('transfers')
export class Transfer {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'sender_wallet_id', type: 'uuid' })
  senderWalletId!: string;

  @Column({ name: 'receiver_wallet_id', type: 'uuid' })
  receiverWalletId!: string;

  @Column({
    name: 'amount_in_cents',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  amountInCents!: number;

  @Column({ name: 'type', type: 'varchar', length: 10 })
  type!: 'TRANSFER' | 'REVERSAL';

  @Column({ name: 'status', type: 'varchar', length: 10 })
  status!: 'COMPLETED' | 'REVERSED';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
