/**
 * The ONLY way to build responses (ADR-004): { success, data, message?, meta? }.
 * Failures are never built here — throw AppError (kernel/errors.ts).
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiSuccess, PageMeta } from '@shared/types/api';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id: echoed in the X-Request-Id header and on every log line. */
      id: string;
    }
  }
}

// ------------------------------------------------------------------ logging (request id on every line, never secrets)
export type LogLevel = 'info' | 'warn' | 'error';
export type LogSink = (line: string, level: LogLevel) => void;

const consoleSink: LogSink = (line, level) => (level === 'error' ? console.error(line) : console.log(line));
let sink: LogSink = consoleSink;

/** Test hook / future hook for a log shipper. Pass nothing to restore console output. */
export function setLogSink(next?: LogSink): void {
  sink = next ?? consoleSink;
}

export function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  sink(JSON.stringify({ level, time: new Date().toISOString(), message, ...fields }), level);
}

// ------------------------------------------------------------------ request id middleware
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

// ------------------------------------------------------------------ envelopes
export function ok<T>(res: Response, data: T, message?: string): void {
  const body: ApiSuccess<T> = message === undefined ? { success: true, data } : { success: true, data, message };
  res.status(200).json(body);
}

export function created<T>(res: Response, data: T, message?: string): void {
  const body: ApiSuccess<T> = message === undefined ? { success: true, data } : { success: true, data, message };
  res.status(201).json(body);
}

/** Paginated list: `meta` is present ONLY here. */
export function page<T>(res: Response, rows: T[], paging: { page: number; page_size: number; total: number }): void {
  const meta: PageMeta = {
    page: paging.page,
    page_size: paging.page_size,
    total: paging.total,
    total_pages: Math.ceil(paging.total / paging.page_size),
  };
  const body: ApiSuccess<T[]> = { success: true, data: rows, meta };
  res.status(200).json(body);
}

/** Wrap an async route handler so a rejection reaches the error middleware (Express 4 does not do this itself). */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// ------------------------------------------------------------------ CSV (reports.export is NOT a JSON envelope)
type CsvCell = string | number | boolean | null | undefined;

function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180: header row + data rows, CRLF line endings, quotes doubled. Money stays a string ("800.00"). */
export function toCsv(columns: string[], rows: CsvCell[][]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csv(res: Response, filename: string, content: string): void {
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(content);
}
