import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

type RequestWithId = Request & { id?: string };

export function configureApp(app: INestApplication): void {
  app.use((req: RequestWithId, res: Response, next: NextFunction) => {
    const header = req.headers['x-request-id'];
    const requestId =
      typeof header === 'string' && REQUEST_ID_PATTERN.test(header)
        ? header
        : randomUUID();

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();
}
