import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TransactionManager } from '../../common/database/transaction-manager';
import { Wallet } from './wallet.entity';


@Injectable()
export class WalletsRepository {
    constructor(private readonly tx: TransactionManager) { }

    private get repo(): Repository<Wallet> {
        return this.tx.manager.getRepository(Wallet);
    }

    async insert(wallet: Pick<Wallet, 'id' | 'userId' | 'balanceInCents'>): Promise<void> {
        await this.repo.insert(wallet);
    }

    findByUserId(userId: string): Promise<Wallet | null> {
        return this.repo.findOne({ where: { userId } });
    }
}