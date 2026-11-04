import { ApiProperty } from '@nestjs/swagger';

export class WalletResponseDto {
  @ApiProperty({
    description:
      'Id da carteira (informe-o como receiverWalletId para receber)',
    example: 'c4e1a2b7-9d3f-4e6a-8b5c-1f2e3d4c5b6a',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Saldo atual em centavos inteiros. 100000 = R$ 1.000,00.',
    example: 100000,
    type: 'integer',
  })
  balanceInCents!: number;

  @ApiProperty({ description: 'Moeda da carteira', example: 'BRL' })
  currency!: string;
}
