import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WalletResponseDto } from './dto/wallet.response.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { TransactionsPageDto } from './dto/transactions-page.dto';

@ApiTags('wallets')
@ApiBearerAuth()
@ApiResponse({
  status: 401,
  description: 'UNAUTHORIZED: token ausente, inválido ou expirado.',
  type: ErrorResponseDto,
})
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Consultar minha carteira',
    description:
      'Devolve a carteira do usuário autenticado com o saldo atual em centavos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Carteira do usuário autenticado',
    type: WalletResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'WALLET_NOT_FOUND: o usuário não possui carteira.',
    type: ErrorResponseDto,
  })
  getMine(
    @Req() req: Request & { user: { userId: string } },
  ): Promise<WalletResponseDto> {
    return this.wallets.getByUserId(req.user.userId);
  }

  @Get('me/transactions')
  @ApiOperation({
    summary: 'Extrato da minha carteira',
    description:
      'Lista os lançamentos do ledger da carteira do usuário autenticado, do mais recente para o mais antigo, com paginação por cursor. Use limit (1 a 100, padrão 20) e, para avançar, envie em cursor o nextCursor da resposta anterior; nextCursor null indica a última página.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página do extrato',
    type: TransactionsPageDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'BAD_REQUEST: query inválida (limit fora de 1 a 100, parâmetros extras). INVALID_CURSOR: cursor corrompido ou adulterado.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'WALLET_NOT_FOUND: o usuário não possui carteira.',
    type: ErrorResponseDto,
  })
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
