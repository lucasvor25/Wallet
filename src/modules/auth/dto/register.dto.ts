import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description:
      'E-mail do usuário. É normalizado (trim + minúsculas) e deve ser único.',
    example: 'maria.silva@example.com',
    format: 'email',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Senha forte: 8 a 128 caracteres, com pelo menos uma letra maiúscula, uma minúscula, um número e um caractere especial.',
    example: 'Senha@Forte123',
    minLength: 8,
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message:
      'A senha deve ter maiúscula, minúscula, número e caractere especial',
  })
  password!: string;
}
