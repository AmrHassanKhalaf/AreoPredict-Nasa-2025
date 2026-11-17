import express from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeHandler, citiesHandler, weatherHandler } from './lib/handlers';
import { hasCustomWeatherApiKey } from './lib/weather-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

/**
 * Minimal .env loader used only by this local server.
 * On Vercel the variables come from the project settings, so nothing is read from disk.
 */
async function loadDotEnv(): Promise<void> {
  try {
    const raw = await readFile(path.resolve(__dirname, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional
  }
}

/**
 * Local / Node hosting server (Render, Railway, Fly.io, a VPS, ...).
 *
 * On Vercel this file is NOT used: `vite build` produces the static site and
 * each handler inside /api is deployed as its own Serverless Function.
 * Both paths share the very same logic from /lib.
 */
async function startServer() {
  await loadDotEnv();
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'PLACEHOLDER_API_KEY'
      ),
      weatherApiKey: hasCustomWeatherApiKey() ? 'env' : 'default',
    });
  });

  app.get('/api/cities', citiesHandler);
  app.get('/api/weather', weatherHandler);
  app.post('/api/analyze-environment', analyzeHandler);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
      } else {
        next();
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AeroPulse server running on http://0.0.0.0:${PORT}`);
    if (!hasCustomWeatherApiKey()) {
      console.warn('[config] WEATHER_API_KEY is not set — using the built-in fallback key.');
    }
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[config] GEMINI_API_KEY is not set — /api/analyze-environment will return 503.');
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
