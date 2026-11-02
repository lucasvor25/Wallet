import { Injectable } from '@nestjs/common';
import { WalletsRepository } from './wallets.repository';
import { WalletResponseDto } from './dto/wallet.response.dto';
import { WalletNotFoundError } from '../../common/errors/domain-errors';

@Injectable()
export class WalletsService {
  constructor(private readonly wallets: WalletsRepository) {}

  async getByUserId(userId: string): Promise<WalletResponseDto> {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) throw new WalletNotFoundError();

    return {
      id: wallet.id,
      balanceInCents: wallet.balanceInCents,
      currency: wallet.currency,
    };
  }
}
