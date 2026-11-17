import type { ApiRequestLike, ApiResponseLike } from '../lib/http';

/**
 * GET /api/health
 * Small diagnostic endpoint: confirms which environment variables reached the
 * serverless function without exposing their values.
 */
export default function handler(req: ApiRequestLike, res: ApiResponseLike): void {
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    ok: true,
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'PLACEHOLDER_API_KEY'
    ),
    weatherApiKey: process.env.WEATHER_API_KEY?.trim() ? 'env' : 'default',
    methods: req.method ?? 'GET',
  });
}
