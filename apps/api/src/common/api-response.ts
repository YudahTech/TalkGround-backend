import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

export class MessageDto {
  @ApiProperty({ example: 'Done' })
  message: string;
}

export class PageMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 42 }) total: number;
  @ApiProperty({ example: 3 }) totalPages: number;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'BAD_REQUEST' }) code: string;
  @ApiProperty({ example: 'Validation failed' }) message: string;
}

export class ErrorDto {
  @ApiProperty({ type: ErrorBodyDto }) error: ErrorBodyDto;
}

type Opts = { status?: number; description?: string };

/** `{ data: Model }` (or `{ data: Model[] }` with isArray). */
export function ApiData(
  model: Type<unknown>,
  opts: Opts & { isArray?: boolean } = {},
) {
  const ref = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: opts.status ?? 200,
      description: opts.description ?? 'Success',
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: opts.isArray ? { type: 'array', items: ref } : ref,
        },
      },
    }),
  );
}

/** `{ data: A | B | … }` discriminated by a `kind` field. */
export function ApiDataOneOf(models: Type<unknown>[], opts: Opts = {}) {
  return applyDecorators(
    ApiExtraModels(...models),
    ApiResponse({
      status: opts.status ?? 200,
      description: opts.description ?? 'Success',
      schema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { oneOf: models.map((m) => ({ $ref: getSchemaPath(m) })) },
        },
      },
    }),
  );
}

/** `{ data: Model[], meta: PageMeta }`. */
export function ApiPaged(model: Type<unknown>, opts: Opts = {}) {
  return applyDecorators(
    ApiExtraModels(model, PageMetaDto),
    ApiResponse({
      status: opts.status ?? 200,
      description: opts.description ?? 'Paginated list',
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMetaDto) },
        },
      },
    }),
  );
}

/** `{ data: { message } }`. */
export function ApiMessage(opts: Opts = {}) {
  return ApiData(MessageDto, opts);
}

/** Standard error responses so every route documents them (PRD §0.3). */
export function ApiErrors(...statuses: number[]) {
  const text: Record<number, string> = {
    400: 'Validation failed or a rule was broken',
    401: 'Not signed in or session expired',
    403: 'Not allowed (permission, membership or verification)',
    404: 'Not found',
    409: 'Conflict with existing data',
    410: 'Gone',
    429: 'Too many requests',
    503: 'Dependency not configured',
  };
  return applyDecorators(
    ApiExtraModels(ErrorDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: text[status] ?? 'Error',
        schema: { $ref: getSchemaPath(ErrorDto) },
      }),
    ),
  );
}
