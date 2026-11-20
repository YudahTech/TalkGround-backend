import type { TransformFnParams } from 'class-transformer';

/** Accept enum values in any case ("receipt" → "RECEIPT"). */
export function toUpperCase({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.toUpperCase() : value;
}
