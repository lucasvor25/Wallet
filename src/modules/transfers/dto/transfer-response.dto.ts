import { ApiProperty } from '@nestjs/swagger';
import { Transfer } from '../entities/transfer.entity';

export class TransferResponseDto {
  @ApiProperty({
    description: 'Id da transferência (ou do estorno)',
    example: '5a9d3e2f-1b7c-4c8e-a6f0-2e4d6b8a0c12',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description:
      'Carteira debitada. Em um estorno, é o destinatário da transferência original.',
    example: 'e7b3c1d9-2a4f-4b6e-8c0d-9f1a3b5c7d2e',
    format: 'uuid',
  })
  senderWalletId!: string;

  @ApiProperty({
    description:
      'Carteira creditada. Em um estorno, é o remetente da transferência original.',
    example: 'c4e1a2b7-9d3f-4e6a-8b5c-1f2e3d4c5b6a',
    format: 'uuid',
  })
  receiverWalletId!: string;

  @ApiProperty({
    description: 'Valor em centavos inteiros (BRL). 1050 = R$ 10,50.',
    example: 1050,
    type: 'integer',
  })
  amountInCents!: number;

  @ApiProperty({
    description:
      'TRANSFER: transferência entre carteiras. REVERSAL: estorno de uma transferência.',
    enum: ['TRANSFER', 'REVERSAL'],
    example: 'TRANSFER',
  })
  type!: 'TRANSFER' | 'REVERSAL';

  @ApiProperty({
    description:
      'COMPLETED: efetivada. REVERSED: transferência original que já foi estornada (os valores não mudam, só o status).',
    enum: ['COMPLETED', 'REVERSED'],
    example: 'COMPLETED',
  })
  status!: 'COMPLETED' | 'REVERSED';

  @ApiProperty({
    description: 'Data de criação em ISO 8601 (UTC)',
    example: '2026-11-03T14:25:07.123Z',
    format: 'date-time',
  })
  createdAt!: string;
}

export function toTransferResponse(transfer: Transfer): TransferResponseDto {
  return {
    id: transfer.id,
    senderWalletId: transfer.senderWalletId,
    receiverWalletId: transfer.receiverWalletId,
    amountInCents: transfer.amountInCents,
    type: transfer.type,
    status: transfer.status,
    createdAt: transfer.createdAt.toISOString(),
  };
}
