import type { ApiRequestLike, ApiResponseLike } from '../lib/http.js';
import { analyzeHandler } from '../lib/handlers.js';

/**
 * POST /api/analyze-environment
 * Body: { cityName?, weatherData?, userFocus?, lang?: 'ar' | 'en' }
 * Vercel Serverless Function entry point.
 */
export default async function handler(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void> {
  if (req.method && req.method.toUpperCase() !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  await analyzeHandler(req, res);
}
