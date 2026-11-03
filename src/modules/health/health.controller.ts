import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  // Liveness não consulta dependências: banco fora do ar não deve reiniciar o processo
  @Get('live')
  @ApiOperation({
    summary: 'Liveness',
    description:
      'Indica que o processo está de pé. Não consulta dependências. Fora do prefixo /api/v1 e sem rate limit.',
  })
  @ApiResponse({
    status: 200,
    description: 'Processo vivo',
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
      example: { status: 'ok' },
    },
  })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck({ noCache: true, swaggerDocumentation: false })
  @ApiOperation({
    summary: 'Readiness',
    description:
      'Indica se a aplicação está pronta para receber tráfego (faz ping no banco). Fora do prefixo /api/v1 e sem rate limit.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pronta: banco acessível',
    schema: {
      type: 'object',
      example: {
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description:
      'SERVICE_UNAVAILABLE: banco inacessível; a aplicação não deve receber tráfego.',
    type: ErrorResponseDto,
  })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
