import { InvalidCursorError } from '../../common/errors/domain-errors';

export interface TransactionsCursor {
  // Texto com microssegundos, como veio do banco: passar por Date perderia precisão e pularia linhas.
  createdAt: string;
  id: string;
}

const CREATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: TransactionsCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(raw: string): TransactionsCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidCursorError();
  }
  const { createdAt, id } = parsed as Record<string, unknown>;

  if (
    typeof createdAt !== 'string' ||
    typeof id !== 'string' ||
    !CREATED_AT_PATTERN.test(createdAt) ||
    !isRealCalendarInstant(createdAt) ||
    !UUID_PATTERN.test(id)
  ) {
    throw new InvalidCursorError();
  }

  return { createdAt, id };
}

function isRealCalendarInstant(value: string): boolean {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19);
}
