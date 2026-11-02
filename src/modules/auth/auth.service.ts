import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import { UsersRepository } from '../users/users.repository';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TransactionManager } from '../../common/database/transaction-manager';
import { WalletsRepository } from '../wallets/wallets.repository';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '../../common/errors/domain-errors';

export interface RegisterResult {
  id: string;
  email: string;
  walletId: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;

  constructor(
    private readonly tx: TransactionManager,
    private readonly users: UsersRepository,
    private readonly wallets: WalletsRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash('dummy-password', {
      type: argon2.argon2id,
    });
  }

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const userId = randomUUID();
    const walletId = randomUUID();

    try {
      await this.tx.run(async () => {
        await this.users.insert({ id: userId, email: dto.email, passwordHash });
        await this.wallets.insert({ id: walletId, userId, balanceInCents: 0 });
      });
    } catch (err) {
      if (this.isUniqueEmailViolation(err)) {
        throw new EmailAlreadyRegisteredError();
      }
      throw err;
    }

    return { id: userId, email: dto.email, walletId };
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.users.findByEmailWithHash(dto.email);
    const hash = user?.passwordHash ?? this.dummyHash;
    const valid = await argon2.verify(hash, dto.password).catch(() => false);

    if (!user || !valid) {
      throw new InvalidCredentialsError();
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN'),
    };
  }

  private isUniqueEmailViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const driver = err.driverError as { code?: string; constraint?: string };
    return driver.code === '23505' && driver.constraint === 'uq_users_email';
  }
}
