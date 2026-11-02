import { ValueTransformer } from 'typeorm';

export const bigintTransformer: ValueTransformer = {
    to: (value: bigint | null): string | null | undefined => {
        return value === null ? null : value.toString();
    },
    from: (value: string | null): number | null | undefined => {
        return value === null ? null : Number(value);
    }
}