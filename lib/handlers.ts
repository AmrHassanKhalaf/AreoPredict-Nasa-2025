import {
  ApiError,
  describeError,
  readJsonBody,
  readLanguage,
  readNumber,
  readString,
  sendError,
  type ApiRequestLike,
  type ApiResponseLike,
} from './http';
import {
  analyzeEnvironment,
  isTransientOverloadError,
  type AnalyzeEnvironmentInput,
} from './environment-service';
import { fetchWeatherAndAirQuality, searchCities } from './weather-service';

export type ApiHandler = (req: ApiRequestLike, res: ApiResponseLike) => Promise<void>;

function noStore(res: ApiResponseLike): void {
  try {
    res.setHeader?.('Cache-Control', 'no-store, max-age=0');
  } catch {
    // Header setting is optional (e.g. some runtimes expose read-only headers)
  }
}

export const citiesHandler: ApiHandler = async (req, res) => {
  noStore(res);
  try {
    const query = readString(req.query?.q) ?? '';
    const lang = readLanguage(req.query?.lang);
    const suggestions = await searchCities(query, lang);
    res.status(200).json({ suggestions });
  } catch (err) {
    console.error('[api/cities]', err);
    sendError(res, 500, describeError(err, 'Failed to search cities'));
  }
};

export const weatherHandler: ApiHandler = async (req, res) => {
  noStore(res);
  const lang = readLanguage(req.query?.lang);
  try {
    const city = readString(req.query?.city);
    const lat = readNumber(req.query?.lat);
    const lon = readNumber(req.query?.lon);
    const days = readNumber(req.query?.days) ?? 5;

    const data = await fetchWeatherAndAirQuality({
      city,
      lat,
      lon,
      days,
      lang,
    });
    res.status(200).json(data);
  } catch (err) {
    sendError(res, 400, describeError(err, 'Weather lookup failed'));
  }
};

export const analyzeHandler: ApiHandler = async (req, res) => {
  noStore(res);
  const body = readJsonBody<AnalyzeEnvironmentInput>(req.body);
  const lang = body.lang === 'en' ? 'en' : 'ar';

  try {
    const result = await analyzeEnvironment({ ...body, lang });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      sendError(res, err.status, err.message);
      return;
    }
    if (isTransientOverloadError(err)) {
      sendError(
        res,
        503,
        lang === 'en'
          ? 'The AI model is temporarily experiencing high demand. Please retry in a few seconds.'
          : 'يشهد نموذج الذكاء الاصطناعي ضغطاً مؤقتاً حالياً. يرجى المحاولة مرة أخرى بعد ثوانٍ.'
      );
      return;
    }
    console.error('[api/analyze-environment]', err);
    sendError(res, 500, describeError(err, 'Failed to analyze city environmental data.'));
  }
};
