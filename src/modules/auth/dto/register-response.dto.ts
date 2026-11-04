import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({
    description: 'Id do usuário criado',
    example: '8b2f6c1e-4a3d-4f7b-9e21-6c0d5a7b3e90',
  })
  id!: string;

  @ApiProperty({
    description: 'E-mail cadastrado (normalizado em minúsculas)',
    example: 'maria.silva@example.com',
  })
  email!: string;

  @ApiProperty({
    description: 'Id da carteira criada junto com o usuário (saldo inicial 0)',
    example: 'c4e1a2b7-9d3f-4e6a-8b5c-1f2e3d4c5b6a',
  })
  walletId!: string;
}
