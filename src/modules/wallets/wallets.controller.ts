import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WalletResponseDto } from './dto/wallet.response.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { TransactionsPageDto } from './dto/transactions-page.dto';

@ApiBearerAuth()
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('me')
  getMine(
    @Req() req: Request & { user: { userId: string } },
  ): Promise<WalletResponseDto> {
    return this.wallets.getByUserId(req.user.userId);
  }

  @Get('me/transactions')
  listMyTransactions(
    @Req() req: Request & { user: { userId: string } },
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionsPageDto> {
    return this.wallets.listTransactions(
      req.user.userId,
      query.limit,
      query.cursor,
    );
  }
}
