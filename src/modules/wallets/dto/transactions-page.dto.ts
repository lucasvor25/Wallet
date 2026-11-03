export class TransactionItemDto {
  id!: string;
  transferId!: string | null;
  direction!: 'DEBIT' | 'CREDIT';
  amountInCents!: number;
  balanceAfterInCents!: number;
  source!: 'TRANSFER' | 'REVERSAL' | 'DEMO_SEED';
  counterpartyWalletId!: string | null;
  createdAt!: string;
}

export class TransactionsPageDto {
  items!: TransactionItemDto[];
  nextCursor!: string | null;
}
