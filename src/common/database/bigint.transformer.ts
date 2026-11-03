import { ValueTransformer } from 'typeorm';

// Falhar alto é preferível a gravar ou devolver um valor monetário com precisão perdida
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => {
    if (value == null) return value;
    if (!Number.isSafeInteger(value)) {
      throw new Error(`Valor monetário inválido: ${String(value)}`);
    }
    return value;
  },
  from: (value?: string | null): number | null | undefined => {
    if (value == null) return value;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`Valor do banco excede 2^53-1: ${value}`);
    }
    return parsed;
  },
};
