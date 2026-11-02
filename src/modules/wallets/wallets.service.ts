import { Injectable, NotFoundException } from '@nestjs/common';
import { WalletsRepository } from './wallets.repository';
import { WalletResponseDto } from './dto/wallet.response.dto';

@Injectable()
export class WalletsService {
  constructor(private readonly wallets: WalletsRepository) {}

  async getByUserId(userId: string): Promise<WalletResponseDto> {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    return {
      id: wallet.id,
      balanceInCents: wallet.balanceInCents,
      currency: wallet.currency,
    };
  }
}
