import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Every error is `{ error: { code, message, details? } }`. `details` carries structured context
 * (e.g. duplicateCandidates on a 409, the existing reviewId) when an exception provides it.
 * Unexpected errors never leak internals.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message: string | string[] = 'Error';
      let details: Record<string, unknown> | undefined;
      if (typeof res === 'string') {
        message = res;
      } else {
        const {
          message: m,
          statusCode: _s,
          error: _e,
          ...rest
        } = res as Record<string, unknown>;
        message = (m as string | string[] | undefined) ?? 'Error';
        if (Object.keys(rest).length) details = rest;
      }
      response.status(status).json({
        error: {
          code: HttpStatus[status],
          message: Array.isArray(message) ? message.join(', ') : message,
          ...(details ? { details } : {}),
        },
      });
      return;
    }

    this.logger.error(exception);
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
