import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

const IGNORED_PREFIXES = ['/metrics', '/health'];

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.originalUrl.split('?')[0];
    if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      next();
      return;
    }

    // O Nest monta este middleware como rota curinga; se nenhum controller casar, req.route continua sendo ela
    const middlewareRoute: unknown = req.route;
    const end = this.metrics.startHttpTimer();
    res.on('finish', () => {
      end({
        method: req.method,
        route: routePattern(req, middlewareRoute),
        status_code: String(res.statusCode),
      });
    });
    next();
  }
}

// Padrão da rota (/transfers/:id/reversal), nunca a URL real: ids no label explodiriam a cardinalidade
function routePattern(req: Request, middlewareRoute: unknown): string {
  const route: unknown = req.route;
  if (route === middlewareRoute) return 'unmatched';
  if (typeof route === 'object' && route !== null && 'path' in route) {
    const { path } = route;
    if (typeof path === 'string') return path;
  }
  return 'unmatched';
}
