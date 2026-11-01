import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.options';

export default new DataSource(
    buildDataSourceOptions({
        host: process.env.DATABASE_HOST!,
        port: Number(process.env.DATABASE_PORT),
        username: process.env.DATABASE_USER!,
        password: process.env.DATABASE_PASSWORD!,
        database: process.env.DATABASE_NAME!,
    }),
);