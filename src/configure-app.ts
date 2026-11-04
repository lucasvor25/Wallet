import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

type RequestWithId = Request & { id?: string };

export function configureApp(app: INestApplication): void {
  const secure = helmet();
  const docsFriendly = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const middleware = req.path.startsWith('/docs') ? docsFriendly : secure;
    middleware(req, res, next);
  });

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

  app.setGlobalPrefix('api/v1', {
    exclude: ['health/live', 'health/ready', 'metrics'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();
}
