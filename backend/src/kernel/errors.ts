/**
 * Errors are thrown as AppError(code, details) with a code from shared/constants/errors.ts and are the only way a
 * request fails (ADR-004). The HTTP status is fixed per code. Unknown errors become INTERNAL_ERROR (logged with the
 * stack; the client gets a generic message).
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ERROR_CODES, type ErrorCode } from '@shared/constants/errors';
import type { ApiError } from '@shared/types/api';
import { log } from './http';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  /** `message` overrides the canonical text only when a more specific one helps; the code stays authoritative. */
  constructor(code: ErrorCode, details?: Record<string, unknown>, message?: string) {
    super(message ?? ERROR_CODES[code].message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    if (details !== undefined) this.details = details;
  }

  toBody(): ApiError {
    const error: ApiError['error'] = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return { success: false, error };
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;

/** Unknown route -> NOT_FOUND in the standard envelope. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND'));
};

interface BodyParserError {
  type?: string;
  status?: number;
}

/** Last middleware. Express recognises it by its 4 parameters. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  let appError: AppError;
  if (isAppError(err)) {
    appError = err;
  } else if ((err as BodyParserError)?.type === 'entity.parse.failed') {
    appError = new AppError('VALIDATION_ERROR', { fields: { body: 'Malformed JSON.' } });
  } else if ((err as BodyParserError)?.type === 'entity.too.large') {
    appError = new AppError('VALIDATION_ERROR', { fields: { body: 'Request body is too large.' } });
  } else {
    const e = err instanceof Error ? err : new Error(String(err));
    log('error', 'unhandled error', { request_id: req.id, method: req.method, path: req.path, error: e.message, stack: e.stack });
    appError = new AppError('INTERNAL_ERROR');
  }

  if (appError.status >= 500 && isAppError(err)) {
    log('error', 'server error', { request_id: req.id, code: appError.code, stack: appError.stack });
  }
  res.status(appError.status).json(appError.toBody());
};
