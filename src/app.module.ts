import { Module } from '@nestjs/common';
import { envValidationSchema } from './config/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { buildDataSourceOptions } from './database/typeorm.options';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './common/database/database.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { AuthModule } from './modules/auth/auth.module';
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
    UsersModule,
    DatabaseModule,
    WalletsModule,
    AuthModule,
  ]
})
export class AppModule { }
