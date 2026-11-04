import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  private readonly token: string | undefined;

  constructor(
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.token = config.get<string>('METRICS_TOKEN');
  }

  @Get()
  async scrape(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (this.token !== undefined && !this.isAuthorized(req)) {
      throw new UnauthorizedException();
    }

    res.setHeader('Content-Type', this.metrics.contentType);
    return this.metrics.metrics();
  }

  private isAuthorized(req: Request): boolean {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return false;
    }
    // Hash iguala o tamanho dos buffers, exigido pelo timingSafeEqual, sem vazar o tamanho do token
    return timingSafeEqual(
      sha256(header.slice('Bearer '.length)),
      sha256(this.token ?? ''),
    );
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
