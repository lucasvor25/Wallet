import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({
    description:
      'JWT de acesso. No Swagger, clique em Authorize e cole apenas este valor (sem o prefixo "Bearer").',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YjJmNmMxZSJ9.signature',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Tipo do token, para o header Authorization',
    enum: ['Bearer'],
    example: 'Bearer',
  })
  tokenType!: 'Bearer';

  @ApiProperty({
    description: 'Validade do token (formato do JWT_EXPIRES_IN)',
    example: '15m',
  })
  expiresIn!: string;
}
