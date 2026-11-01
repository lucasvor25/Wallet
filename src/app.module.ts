import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { buildDataSourceOptions } from './database/typeorm.options';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions({
          host: config.getOrThrow('DATABASE_HOST'),
          port: config.getOrThrow<number>('DATABASE_PORT'),
          username: config.getOrThrow('DATABASE_USER'),
          password: config.getOrThrow('DATABASE_PASSWORD'),
          database: config.getOrThrow('DATABASE_NAME'),
        }),
    }),
  ],
})
export class AppModule { }
