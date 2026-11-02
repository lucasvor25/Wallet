import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TransfersRepository } from './transfers.repository';
import { IdempotencyRepository } from './idempotency.repository';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';

@Module({
  imports: [WalletsModule, LedgerModule],
  controllers: [TransfersController],
  providers: [TransfersRepository, IdempotencyRepository, TransfersService],
})
export class TransfersModule {}
