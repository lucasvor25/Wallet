import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('transfer_reversals')
export class TransferReversal {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'original_transfer_id', type: 'uuid' })
  originalTransferId!: string;

  @Column({ name: 'reversal_transfer_id', type: 'uuid' })
  reversalTransferId!: string;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
