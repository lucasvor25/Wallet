import { Transform } from 'class-transformer';
import { IsInt, IsPositive, IsUUID, Max } from 'class-validator';

export class CreateTransferDto {

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  receiverWalletId!: string;

  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amountInCents!: number;
}
