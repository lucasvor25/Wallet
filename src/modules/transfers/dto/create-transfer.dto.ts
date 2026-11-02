import { IsInt, IsPositive, IsUUID, Max } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  receiverWalletId!: string;

  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amountInCents!: number;
}
