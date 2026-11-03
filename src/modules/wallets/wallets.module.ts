import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsController } from './wallets.controller';
import { WalletsRepository } from './wallets.repository';
import { WalletsService } from './wallets.service';

@Module({
  imports: [LedgerModule],
  controllers: [WalletsController],
  providers: [WalletsRepository, WalletsService],
  exports: [WalletsRepository],
})
export class WalletsModule {}
