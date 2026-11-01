import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryColumn('uuid')
    id!: string;

    @Column({
        name: 'email',
        type: 'varchar',
        length: 254,
        unique: true,
    })
    email!: string;

    @Column({
        name: 'password_hash',
        type: 'varchar',
        length: 255,
        select: false
    })
    passwordHash!: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt!: Date;
}