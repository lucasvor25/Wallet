import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain.error';

const DOMAIN_ERROR_STATUS: Readonly<Record<string, number>> = {
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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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

      this.logger.warn(`${exception.code}: ${exception.message}`);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = HttpStatus[status] ?? 'Error';

      const extracted = this.extractHttpMessage(exception);
      message = extracted.message;
      details = extracted.details;
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

  private extractHttpMessage(exception: HttpException): HttpMessage {
    const res = exception.getResponse();

    if (typeof res === 'string') {
      return { message: res };
    }

    const body = res as { message?: string | string[] };

    if (Array.isArray(body.message)) {
      return { message: 'Dados inválidos', details: body.message };
    }

    return { message: body.message ?? exception.message };
  }
}
