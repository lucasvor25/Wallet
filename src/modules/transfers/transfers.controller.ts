import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { TransfersService } from './transfers.service';

@ApiBearerAuth()
@Controller('transfers')
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  create(
    @Req() req: Request & { user: { userId: string } },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferResponseDto> {
    return this.transfers.create(
      req.user.userId,
      this.requireIdempotencyKey(idempotencyKey),
      dto,
    );
  }

  @Get(':id')
  getById(
    @Req() req: Request & { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransferResponseDto> {
    return this.transfers.getById(req.user.userId, id);
  }

  @Post(':id/reversal')
  reverse(
    @Req() req: Request & { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransferResponseDto> {
    return this.transfers.reverse(req.user.userId, id);
  }

  private requireIdempotencyKey(key: string | undefined): string {
    if (!key || !/^[A-Za-z0-9._-]{1,128}$/.test(key)) {
      throw new BadRequestException(
        'Header Idempotency-Key ausente ou inválido',
      );
    }

    return key;
  }
}
