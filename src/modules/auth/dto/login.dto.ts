import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'E-mail cadastrado (normalizado: trim + minúsculas)',
    example: 'alice@example.com',
    format: 'email',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Senha da conta. No login NÃO se aplica a regra de força do cadastro: basta ser não vazia e ter no máximo 128 caracteres.',
    example: 'Demo@12345',
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
