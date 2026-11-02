import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TransfersRepository } from './transfers.repository';

@Module({
  imports: [WalletsModule, LedgerModule],
  providers: [TransfersRepository],
})
export class TransfersModule {}
