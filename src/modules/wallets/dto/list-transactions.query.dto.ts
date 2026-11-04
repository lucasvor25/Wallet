import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({
    description: 'Quantidade de itens por página (1 a 100)',
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de paginação. Omita na primeira página; nas seguintes, envie o nextCursor devolvido pela resposta anterior (null indica que não há mais páginas). Não monte nem altere o valor: cursor inválido gera 400 INVALID_CURSOR.',
    maxLength: 256,
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI2LTExLTAzVDE0OjI1OjA3LjEyMzQ1NloiLCJpZCI6IjVhOWQzZTJmIn0',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;
}
