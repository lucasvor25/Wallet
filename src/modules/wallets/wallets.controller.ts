import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WalletResponseDto } from './dto/wallet.response.dto';
import { ApiBearerAuth } from '@nestjs/swagger';

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
}
