import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class TransactionManager {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();
    return this.dataSource.transaction((manager) =>
      this.storage.run(manager, work),
    );
  }

  get manager(): EntityManager {
    return this.storage.getStore() ?? this.dataSource.manager;
  }
}
