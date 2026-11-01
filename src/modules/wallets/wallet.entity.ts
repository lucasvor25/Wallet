import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../commom/database/bigint.transformer';

@Entity('wallets')
export class Wallet {
    @PrimaryColumn('uuid')
    id!: string;

    @Column({
        name: 'user_id',
        type: 'uuid'
    })
    userId!: string;

    @Column({
        name: 'balance_in_cents',
        type: 'bigint',
        transformer: bigintTransformer,
        default: 0,
    })
    balanceInCents!: bigint;

    @Column({
        name: 'currency',
        type: 'char',
        default: 'BRL',
    })
    currency!: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt!: Date;
}