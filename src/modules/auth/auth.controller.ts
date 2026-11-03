import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { AuthService, LoginResult, RegisterResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Cadastrar usuário',
    description:
      'Cria o usuário e a carteira dele (saldo inicial 0, moeda BRL). A senha é armazenada com Argon2id e nunca é devolvida. Limite: 5 requisições por minuto por IP.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuário e carteira criados',
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'BAD_REQUEST: corpo inválido (e-mail mal formatado, senha fora da regra de força, campos extras). As violações vêm em details.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'EMAIL_ALREADY_REGISTERED: o e-mail já está em uso.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'TOO_MANY_REQUESTS: limite de 5 cadastros por minuto por IP.',
    type: ErrorResponseDto,
  })
  register(@Body() dto: RegisterDto): Promise<RegisterResult> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Autenticar e obter token JWT',
    description:
      'Devolve um JWT de acesso. Para usar no Swagger, clique em Authorize e cole apenas o accessToken (sem "Bearer"). Credenciais erradas sempre geram o mesmo 401, sem revelar se o e-mail existe. Limite: 5 requisições por minuto por IP.',
  })
  @ApiResponse({
    status: 200,
    description: 'Autenticado com sucesso',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'BAD_REQUEST: corpo inválido (e-mail mal formatado, senha vazia ou acima de 128 caracteres, campos extras).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'INVALID_CREDENTIALS: e-mail ou senha incorretos (resposta genérica).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'TOO_MANY_REQUESTS: limite de 5 logins por minuto por IP.',
    type: ErrorResponseDto,
  })
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto);
  }
}
