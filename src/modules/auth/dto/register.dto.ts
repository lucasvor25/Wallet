import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
        message: 'A senha deve ter maiúscula, minúscula, número e caractere especial',
    })
    password!: string;
}