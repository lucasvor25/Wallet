import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsPositive, IsUUID, Max } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({
    description:
      'Id (UUID) da carteira de destino. O remetente é sempre a carteira do usuário autenticado (JWT), nunca informado no corpo.',
    example: 'c4e1a2b7-9d3f-4e6a-8b5c-1f2e3d4c5b6a',
    format: 'uuid',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  receiverWalletId!: string;

  @ApiProperty({
    description:
      'Valor em centavos inteiros (BRL). 1050 = R$ 10,50. Deve ser positivo e não pode exceder MAX_TRANSFER_CENTS.',
    example: 1050,
    type: 'integer',
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amountInCents!: number;
}
