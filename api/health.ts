import type { ApiRequestLike, ApiResponseLike } from '../lib/http.js';

/**
 * GET /api/health
 *
 * Diagnostic endpoint. It intentionally has **no static imports** so that it
 * keeps working even when another module fails to load, and it reports the
 * real error message of each part of the stack instead of a generic 500.
 */

interface CheckResult {
  ok: boolean;
  error?: string;
  code?: string;
}

async function check(loader: () => Promise<unknown>): Promise<CheckResult> {
  try {
    await loader();
    return { ok: true };
  } catch (err) {
    const e = err as { name?: string; message?: string; code?: string };
    return {
      ok: false,
      error: `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`,
      ...(e?.code ? { code: e.code } : {}),
    };
  }
}

export default async function handler(
  _req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void> {
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');

  const [handlers, weatherService, environmentService, genai] = await Promise.all([
    check(() => import('../lib/handlers.js')),
    check(() => import('../lib/weather-service.js')),
    check(() => import('../lib/environment-service.js')),
    check(() => import('@google/genai')),
  ]);

  const geminiKey = process.env.GEMINI_API_KEY;
  const allOk = handlers.ok && weatherService.ok && environmentService.ok;

  res.status(allOk ? 200 : 500).json({
    ok: allOk,
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    node: process.version,
    region: process.env.VERCEL_REGION ?? null,
    geminiConfigured: Boolean(geminiKey && geminiKey !== 'PLACEHOLDER_API_KEY'),
    weatherApiKey: process.env.WEATHER_API_KEY?.trim() ? 'env' : 'default',
    modules: {
      handlers,
      weatherService,
      environmentService,
      genai,
    },
  });
}
