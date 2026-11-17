/**
 * Shared HTTP helpers.
 *
 * The handler signatures below are intentionally structural: Express's
 * `Request`/`Response` and Vercel's serverless `req`/`res` both satisfy them,
 * so the exact same handler code can be mounted on Express (server.ts) or
 * exported from a Vercel Function inside /api.
 */

export interface ApiRequestLike {
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
}

export interface ApiResponseLike {
  status(code: number): ApiResponseLike;
  json(body: unknown): unknown;
  setHeader?(name: string, value: string): unknown;
}

/** Error that carries the HTTP status code it should be reported with. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Reads a query value that may be a string, an array or a parsed object. */
export function readString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return readString(value[0]);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readString(record[0]);
  }
  return undefined;
}

/** Reads a numeric query value; returns undefined when absent or invalid. */
export function readNumber(value: unknown): number | undefined {
  const raw = readString(value);
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readLanguage(value: unknown): 'ar' | 'en' {
  return readString(value) === 'en' ? 'en' : 'ar';
}

/** Body may already be parsed (Express/Vercel) or still be a raw JSON string. */
export function readJsonBody<T>(body: unknown): T {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as T;
    } catch {
      return {} as T;
    }
  }
  if (body && typeof body === 'object') {
    return body as T;
  }
  return {} as T;
}

export function sendError(res: ApiResponseLike, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
