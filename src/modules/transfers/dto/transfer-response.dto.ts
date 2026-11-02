import { Transfer } from '../entities/transfer.entity';

export class TransferResponseDto {
  id!: string;
  senderWalletId!: string;
  receiverWalletId!: string;
  amountInCents!: number;
  type!: 'TRANSFER' | 'REVERSAL';
  status!: 'COMPLETED' | 'REVERSED';
  createdAt!: string;
}

export function toTransferResponse(t: Transfer): TransferResponseDto {
  return {
    id: t.id,
    senderWalletId: t.senderWalletId,
    receiverWalletId: t.receiverWalletId,
    amountInCents: t.amountInCents,
    type: t.type,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
  };
}
