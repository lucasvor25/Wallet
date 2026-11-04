import { ApiProperty } from '@nestjs/swagger';

export class TransactionItemDto {
  @ApiProperty({
    description: 'Id do lançamento no ledger',
    example: '9e2c4a6b-8d0f-4b1e-a3c5-7d9f1b3e5a70',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description:
      'Id da transferência ou do estorno que originou o lançamento; null quando não há transferência (ex.: DEMO_SEED)',
    example: '5a9d3e2f-1b7c-4c8e-a6f0-2e4d6b8a0c12',
    format: 'uuid',
    type: String,
    nullable: true,
  })
  transferId!: string | null;

  @ApiProperty({
    description:
      'DEBIT: saída de saldo da carteira. CREDIT: entrada de saldo na carteira.',
    enum: ['DEBIT', 'CREDIT'],
    example: 'DEBIT',
  })
  direction!: 'DEBIT' | 'CREDIT';

  @ApiProperty({
    description:
      'Valor do lançamento em centavos inteiros (BRL), sempre positivo; o sentido é dado por direction. 1050 = R$ 10,50.',
    example: 1050,
    type: 'integer',
  })
  amountInCents!: number;

  @ApiProperty({
    description: 'Saldo da carteira, em centavos, logo após este lançamento',
    example: 98950,
    type: 'integer',
  })
  balanceAfterInCents!: number;

  @ApiProperty({
    description:
      'TRANSFER: transferência. REVERSAL: estorno. DEMO_SEED: crédito inicial dos dados de demonstração.',
    enum: ['TRANSFER', 'REVERSAL', 'DEMO_SEED'],
    example: 'TRANSFER',
  })
  source!: 'TRANSFER' | 'REVERSAL' | 'DEMO_SEED';

  @ApiProperty({
    description:
      'Carteira do outro lado da operação; null quando não há contraparte (ex.: DEMO_SEED)',
    example: 'c4e1a2b7-9d3f-4e6a-8b5c-1f2e3d4c5b6a',
    format: 'uuid',
    type: String,
    nullable: true,
  })
  counterpartyWalletId!: string | null;

  @ApiProperty({
    description: 'Data do lançamento em ISO 8601 (UTC)',
    example: '2026-11-03T14:25:07.123Z',
    format: 'date-time',
  })
  createdAt!: string;
}

export class TransactionsPageDto {
  @ApiProperty({
    description: 'Lançamentos da página, do mais recente para o mais antigo',
    type: [TransactionItemDto],
  })
  items!: TransactionItemDto[];

  @ApiProperty({
    description:
      'Cursor da próxima página (envie em ?cursor=). null quando esta é a última página.',
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI2LTExLTAzVDE0OjI1OjA3LjEyMzQ1NloiLCJpZCI6IjVhOWQzZTJmIn0',
    type: String,
    nullable: true,
  })
  nextCursor!: string | null;
}
