import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

type RequestWithId = IncomingMessage & { id?: string };

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.getOrThrow<string>('NODE_ENV');
        const pretty =
          config.getOrThrow<boolean>('LOG_PRETTY') && nodeEnv !== 'test';

        return {
          pinoHttp: {
            level:
              nodeEnv === 'test'
                ? 'silent'
                : config.getOrThrow<string>('LOG_LEVEL'),

            genReqId: (req: IncomingMessage) =>
              (req as RequestWithId).id ?? randomUUID(),

            customLogLevel: (
              _req: IncomingMessage,
              res: { statusCode: number },
              err?: Error,
            ) =>
              err || res.statusCode >= 500
                ? 'error'
                : res.statusCode >= 400
                  ? 'warn'
                  : 'info',

            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },

            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.password',
                '*.passwordHash',
                '*.accessToken',
              ],
              censor: '[REDACTED]',
            },

            autoLogging: {
              ignore: (req: IncomingMessage) =>
                (req.url ?? '').startsWith('/health') ||
                (req.url ?? '').startsWith('/metrics'),
            },

            transport: pretty
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
