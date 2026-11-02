import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { TransactionManager } from '../../common/database/transaction-manager';

@Injectable()
export class UsersRepository {
  constructor(private readonly tx: TransactionManager) {}

  // Getter (e não propriedade): busca o manager a cada chamada, usando o da transação em andamento.
  private get repo(): Repository<User> {
    return this.tx.manager.getRepository(User);
  }

  async insert(
    user: Pick<User, 'id' | 'email' | 'passwordHash'>,
  ): Promise<void> {
    await this.repo.insert(user);
  }

  findByEmailWithHash(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = :email', { email })
      .getOne();
  }
}
