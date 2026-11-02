import { DomainError } from './domain.error';

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';

  constructor() {
    super('E-mail já cadastrado');
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Credenciais inválidas');
  }
}

export class WalletNotFoundError extends DomainError {
  readonly code = 'WALLET_NOT_FOUND';

  constructor() {
    super('Carteira não encontrada');
  }
}

export class TransferNotFoundError extends DomainError {
  readonly code = 'TRANSFER_NOT_FOUND';

  constructor() {
    super('Transferência não encontrada');
  }
}

export class SelfTransferError extends DomainError {
  readonly code = 'SELF_TRANSFER';

  constructor() {
    super('Não é possível transferir para a própria carteira');
  }
}

export class AmountExceedsLimitError extends DomainError {
  readonly code = 'AMOUNT_EXCEEDS_LIMIT';

  constructor(limitInCents: number) {
    super(`O valor excede o limite de ${limitInCents} centavos`);
  }
}

export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';

  constructor() {
    super('Saldo insuficiente');
  }
}

export class ReversalFundsUnavailableError extends DomainError {
  readonly code = 'REVERSAL_FUNDS_UNAVAILABLE';

  constructor() {
    super('O destinatário não possui saldo suficiente para o estorno');
  }
}

export class BalanceLimitExceededError extends DomainError {
  readonly code = 'BALANCE_LIMIT_EXCEEDED';

  constructor() {
    super('O saldo excede o limite permitido');
  }
}

export class TransferAlreadyReversedError extends DomainError {
  readonly code = 'TRANSFER_ALREADY_REVERSED';

  constructor() {
    super('Transferência já estornada');
  }
}

export class TransferNotReversibleError extends DomainError {
  readonly code = 'TRANSFER_NOT_REVERSIBLE';

  constructor() {
    super('Transferência não pode ser estornada');
  }
}

export class ReversalNotAllowedError extends DomainError {
  readonly code = 'REVERSAL_NOT_ALLOWED';

  constructor() {
    super('Estorno não permitido');
  }
}

export class ReversalWindowExpiredError extends DomainError {
  readonly code = 'REVERSAL_WINDOW_EXPIRED';

  constructor() {
    super('Prazo de estorno expirado');
  }
}

export class IdempotencyKeyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_CONFLICT';

  constructor() {
    super('Conflito de chave de idempotência');
  }
}
