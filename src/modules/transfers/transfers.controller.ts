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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { TransfersService } from './transfers.service';
import { Throttle } from '@nestjs/throttler';

const TRANSFER_ID_PARAM = {
  name: 'id',
  description: 'Id (UUID) da transferência',
  example: '5a9d3e2f-1b7c-4c8e-a6f0-2e4d6b8a0c12',
  schema: { type: 'string', format: 'uuid' },
} as const;

@ApiTags('transfers')
@ApiBearerAuth()
@ApiResponse({
  status: 401,
  description: 'UNAUTHORIZED: token ausente, inválido ou expirado.',
  type: ErrorResponseDto,
})
@Controller('transfers')
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Transferir saldo para outra carteira',
    description:
      'Debita a carteira do usuário autenticado (o remetente vem do JWT, nunca do corpo) e credita a carteira de destino, de forma atômica. O header Idempotency-Key é obrigatório: repetir a requisição com a mesma chave e o mesmo corpo não gera nova transferência e devolve 201 com o corpo salvo da primeira execução (o status atual, por exemplo após estorno, deve ser consultado em GET /transfers/{id}). Limite: 5 requisições por minuto por IP.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Chave única por tentativa lógica de transferência, gerada pelo cliente (ex.: UUID v4). De 1 a 128 caracteres: letras, números, ponto, hífen e sublinhado. Reutilize a mesma chave ao repetir a requisição após falha de rede ou 503.',
    example: '7d3f9a2c-1e4b-4c6d-8a0f-2b5e7c9d1a36',
    schema: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      pattern: '^[A-Za-z0-9._-]{1,128}$',
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Transferência efetivada. Um replay com a mesma Idempotency-Key e o mesmo corpo também devolve 201 com o mesmo corpo da primeira execução.',
    type: TransferResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'BAD_REQUEST: corpo inválido (receiverWalletId não é UUID, amountInCents não é inteiro positivo, campos extras) ou header Idempotency-Key ausente/inválido.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'WALLET_NOT_FOUND: carteira do remetente ou de destino não existe.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'IDEMPOTENCY_KEY_CONFLICT: a chave já foi usada com outro corpo, ou a requisição original com essa chave ainda está em processamento.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description:
      'SELF_TRANSFER: destino é a própria carteira. AMOUNT_EXCEEDS_LIMIT: valor acima de MAX_TRANSFER_CENTS. INSUFFICIENT_BALANCE: saldo do remetente insuficiente. BALANCE_LIMIT_EXCEEDED: o saldo do destinatário ultrapassaria o limite permitido.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description:
      'TOO_MANY_REQUESTS: limite de 5 transferências por minuto por IP.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description:
      'SERVICE_BUSY: conflito transitório no banco (deadlock/lock). Nada foi efetivado; é seguro repetir com a mesma Idempotency-Key (header Retry-After: 1).',
    type: ErrorResponseDto,
  })
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
  @ApiOperation({
    summary: 'Consultar transferência',
    description:
      'Devolve o estado atual de uma transferência ou estorno. Só remetente e destinatário podem consultar; para os demais a resposta é 404, sem revelar que ela existe.',
  })
  @ApiParam(TRANSFER_ID_PARAM)
  @ApiResponse({
    status: 200,
    description: 'Transferência encontrada',
    type: TransferResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'BAD_REQUEST: id não é um UUID válido.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'TRANSFER_NOT_FOUND: a transferência não existe ou o usuário não participa dela.',
    type: ErrorResponseDto,
  })
  getById(
    @Req() req: Request & { user: { userId: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransferResponseDto> {
    return this.transfers.getById(req.user.userId, id);
  }

  @Post(':id/reversal')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Estornar transferência',
    description:
      'Cria uma transação REVERSAL que devolve o valor ao remetente e marca a original como REVERSED (os valores da original nunca mudam). Só o remetente pode estornar, dentro da janela REVERSAL_WINDOW_HOURS, e o destinatário precisa ter saldo para a devolução. A resposta é o registro do estorno (type REVERSAL). Limite: 5 requisições por minuto por IP.',
  })
  @ApiParam(TRANSFER_ID_PARAM)
  @ApiResponse({
    status: 201,
    description: 'Estorno efetivado; corpo é a transação de estorno',
    type: TransferResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'BAD_REQUEST: id não é um UUID válido.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'REVERSAL_NOT_ALLOWED: o usuário é o destinatário; só o remetente pode estornar.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'TRANSFER_NOT_FOUND: a transferência não existe ou o usuário não participa dela. WALLET_NOT_FOUND: o usuário não possui carteira.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'TRANSFER_ALREADY_REVERSED: a transferência já foi estornada.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description:
      'REVERSAL_FUNDS_UNAVAILABLE: o destinatário não tem saldo para devolver o valor. TRANSFER_NOT_REVERSIBLE: o id é de um estorno (REVERSAL), que não pode ser estornado. REVERSAL_WINDOW_EXPIRED: passou o prazo de REVERSAL_WINDOW_HOURS. BALANCE_LIMIT_EXCEEDED: o saldo do remetente ultrapassaria o limite permitido.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'TOO_MANY_REQUESTS: limite de 5 estornos por minuto por IP.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description:
      'SERVICE_BUSY: conflito transitório no banco (deadlock/lock). Nada foi efetivado; é seguro repetir (header Retry-After: 1).',
    type: ErrorResponseDto,
  })
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
