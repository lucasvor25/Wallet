import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Espelha o corpo montado pelo AllExceptionsFilter; mantenha os dois em sincronia
export class ErrorResponseDto {
  @ApiProperty({ description: 'Status HTTP da resposta', example: 422 })
  statusCode!: number;

  @ApiProperty({
    description:
      'Código do erro. Erros de negócio usam o código de domínio (ex.: INSUFFICIENT_BALANCE); erros HTTP genéricos usam o nome do status (ex.: BAD_REQUEST, UNAUTHORIZED, TOO_MANY_REQUESTS); falhas transitórias do banco usam SERVICE_BUSY.',
    example: 'INSUFFICIENT_BALANCE',
  })
  error!: string;

  @ApiProperty({
    description: 'Mensagem legível, em português',
    example: 'Saldo insuficiente',
  })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Presente apenas em erros de validação: lista das violações encontradas no corpo, query ou parâmetros',
    type: [String],
    example: ['amountInCents must be a positive number'],
  })
  details?: string[];

  @ApiProperty({
    description:
      'Identificador da requisição (mesmo valor do header X-Request-Id), útil para rastrear nos logs',
    example: '3f1c2a9e-7b4d-4e8a-9c61-2d5f0b7e8a14',
  })
  requestId!: string;

  @ApiProperty({
    description: 'Momento do erro em ISO 8601 (UTC)',
    example: '2026-11-03T14:25:07.123Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Caminho da requisição que gerou o erro',
    example: '/api/v1/transfers',
  })
  path!: string;
}
