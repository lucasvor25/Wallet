import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { DomainError } from '../errors/domain.error';
import { MetricsService } from '../../modules/metrics/metrics.service';

// Deadlock, falha de serialização e lock indisponível: o cliente pode repetir com segurança (Idempotency-Key)
const TRANSIENT_PG_CODES: ReadonlySet<string> = new Set([
  '40P01',
  '40001',
  '55P03',
]);

interface PgDriverError {
  code?: string;
  constraint?: string;
}

const DOMAIN_ERROR_STATUS: Readonly<Record<string, number>> = {
  INVALID_CURSOR: HttpStatus.BAD_REQUEST,
  WALLET_NOT_FOUND: HttpStatus.NOT_FOUND,
  TRANSFER_NOT_FOUND: HttpStatus.NOT_FOUND,
  EMAIL_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  TRANSFER_ALREADY_REVERSED: HttpStatus.CONFLICT,
  IDEMPOTENCY_KEY_CONFLICT: HttpStatus.CONFLICT,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  REVERSAL_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  SELF_TRANSFER: HttpStatus.UNPROCESSABLE_ENTITY,
  AMOUNT_EXCEEDS_LIMIT: HttpStatus.UNPROCESSABLE_ENTITY,
  INSUFFICIENT_BALANCE: HttpStatus.UNPROCESSABLE_ENTITY,
  REVERSAL_FUNDS_UNAVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  BALANCE_LIMIT_EXCEEDED: HttpStatus.UNPROCESSABLE_ENTITY,
  TRANSFER_NOT_REVERSIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  REVERSAL_WINDOW_EXPIRED: HttpStatus.UNPROCESSABLE_ENTITY,
};

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  requestId: string | undefined;
  timestamp: string;
  path: string;
}

interface HttpMessage {
  message: string;
  details?: string[];
}

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Optional() private readonly metrics?: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    let status: number;
    let error: string;
    let message: string;
    let details: string[] | undefined;

    if (exception instanceof DomainError) {
      status =
        DOMAIN_ERROR_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      error = exception.code;
      message = exception.message;

      this.metrics?.recordDomainError(exception.code);
      this.logger.warn(`${exception.code}: ${exception.message}`);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = HttpStatus[status] ?? 'Error';

      const extracted = this.extractHttpMessage(exception);
      message = extracted.message;
      details = extracted.details;
    } else if (
      exception instanceof QueryFailedError &&
      TRANSIENT_PG_CODES.has(this.pgError(exception.driverError).code ?? '')
    ) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      error = 'SERVICE_BUSY';
      message = 'Sistema ocupado, tente novamente';
      response.setHeader('Retry-After', '1');

      this.logger.warn(
        `Erro transitório do Postgres: ${this.pgError(exception.driverError).code}`,
      );
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR];
      message = 'Erro interno';

      const { code, constraint } = this.pgError(exception.driverError);
      this.logger.error(
        `${exception.message} (code=${code ?? '-'}, constraint=${constraint ?? '-'})`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR];
      message = 'Erro interno';

      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      ...(details ? { details } : {}),
      requestId: request.id,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    response.status(status).json(body);
  }

  private pgError(driver: unknown): PgDriverError {
    if (typeof driver !== 'object' || driver === null) return {};
    const { code, constraint } = driver as Record<string, unknown>;
    return {
      code: typeof code === 'string' ? code : undefined,
      constraint: typeof constraint === 'string' ? constraint : undefined,
    };
  }

  private extractHttpMessage(exception: HttpException): HttpMessage {
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse };
    }

    const body = exceptionResponse as { message?: string | string[] };

    if (Array.isArray(body.message)) {
      return { message: 'Dados inválidos', details: body.message };
    }

    return { message: body.message ?? exception.message };
  }
}
