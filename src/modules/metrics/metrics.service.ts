import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

export type TransferMetricType = 'TRANSFER' | 'REVERSAL';
export type TransferMetricResult = 'completed' | 'replayed';

type HttpLabels = 'method' | 'route' | 'status_code';

@Injectable()
export class MetricsService {
  // Registry por instância: o global do prom-client quebraria com métrica duplicada quando os testes sobem vários apps.
  private readonly registry = new Registry();

  private readonly httpDuration = new Histogram<HttpLabels>({
    name: 'wallet_http_request_duration_seconds',
    help: 'Duração das requisições HTTP em segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  private readonly domainErrors = new Counter<'code'>({
    name: 'wallet_domain_errors_total',
    help: 'Erros de domínio por código',
    labelNames: ['code'],
    registers: [this.registry],
  });

  private readonly transfers = new Counter<'type' | 'result'>({
    name: 'wallet_transfers_total',
    help: 'Transferências e estornos por resultado',
    labelNames: ['type', 'result'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'wallet_' });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  startHttpTimer(): (labels: Record<HttpLabels, string>) => void {
    const end = this.httpDuration.startTimer();
    return (labels) => {
      end(labels);
    };
  }

  recordDomainError(code: string): void {
    this.domainErrors.inc({ code });
  }

  recordTransfer(type: TransferMetricType, result: TransferMetricResult): void {
    this.transfers.inc({ type, result });
  }
}
