import { DataSourceOptions } from 'typeorm';

export interface DbConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export const buildDataSourceOptions = (
  db: DbConnection,
): DataSourceOptions => ({
  type: 'postgres',
  ...db,
  entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
