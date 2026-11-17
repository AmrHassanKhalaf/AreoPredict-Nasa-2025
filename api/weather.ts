import type { ApiRequestLike, ApiResponseLike } from '../lib/http.js';
import { weatherHandler } from '../lib/handlers.js';

/**
 * GET /api/weather?city=... | ?lat=...&lon=...&days=5&lang=ar|en
 * Vercel Serverless Function entry point.
 */
export default async function handler(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void> {
  if (req.method && req.method.toUpperCase() !== 'GET') {
    res.setHeader?.('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  await weatherHandler(req, res);
}
