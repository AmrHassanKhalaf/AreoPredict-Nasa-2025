import type { EnvironmentalAnalysis, Language, WeatherData } from '../src/types/weather';
import { ApiError } from './http.js';
import { fetchWeatherAndAirQuality, fetchWeatherApiCurrent } from './weather-service.js';

export interface AnalyzeEnvironmentInput {
  cityName?: string;
  weatherData?: WeatherData;
  userFocus?: string;
  lang?: Language;
}

/**
 * The Gemini SDK is loaded lazily with a dynamic import:
 * - the weather/cities functions never pay for it (faster cold starts),
 * - if the SDK cannot be loaded, only this route fails (and reports why)
 *   instead of crashing every Serverless Function at startup.
 */
type GenAIModule = typeof import('@google/genai');
type GoogleGenAIClient = InstanceType<GenAIModule['GoogleGenAI']>;
type GenerateContentRequest = Parameters<GoogleGenAIClient['models']['generateContent']>[0];
type ResponseSchema = NonNullable<GenerateContentRequest['config']>['responseSchema'];
type ThinkingLevelValue = GenAIModule['ThinkingLevel'][keyof GenAIModule['ThinkingLevel']];

async function loadGenAI(): Promise<{
  genai: GenAIModule;
  client: GoogleGenAIClient;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    return null;
  }
  const genai = await import('@google/genai');
  const client = new genai.GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return { genai, client };
}


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientOverloadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

async function generateEnvironmentalWithRetry(
  ai: GoogleGenAIClient,
  genai: GenAIModule,
  request: GenerateContentRequest
) {
  const attempts: Array<{ model: string; thinkingLevel?: ThinkingLevelValue; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: genai.ThinkingLevel.LOW, delayMs: 400 },
    { model: 'gemini-4-hydrogen', thinkingLevel: genai.ThinkingLevel.LOW, delayMs: 800 },
    { model: 'gemini-3.1-flash-lite', delayMs: 500 },
  ];
  let lastError: unknown;

  for (const step of attempts) {
    try {
      return await ai.models.generateContent({
        ...request,
        model: step.model,
        config: {
          ...request.config,
          ...(step.thinkingLevel
            ? { thinkingConfig: { thinkingLevel: step.thinkingLevel } }
            : {}),
        },
      });
    } catch (err) {
      lastError = err;
      if (!isTransientOverloadError(err)) {
        throw err;
      }
      await sleep(step.delayMs);
    }
  }

  throw lastError;
}

export async function analyzeEnvironment(
  input: AnalyzeEnvironmentInput
): Promise<EnvironmentalAnalysis> {
  const language: Language = input.lang === 'en' ? 'en' : 'ar';
  const clientWeather = input.weatherData;
  const userFocus = input.userFocus;
  const targetCity = (input.cityName || clientWeather?.location?.name || '').trim();

  if (!targetCity) {
    throw new ApiError(
      400,
      language === 'ar'
        ? 'يرجى إدخال اسم المدينة المطلوب تحليل نسبة التلوث فيها.'
        : 'Please specify the city name for pollution analysis.'
    );
  }

  const genaiClient = await loadGenAI();
  if (!genaiClient) {
    throw new ApiError(
      503,
      language === 'ar'
        ? 'مفتاح Gemini API غير مُعد على الخادم. أضف المتغير GEMINI_API_KEY في إعدادات المشروع.'
        : 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in the project environment variables.'
    );
  }
  const { genai, client: ai } = genaiClient;
  const { Type } = genai;

  // Fetch live WeatherAPI current.json for the user-provided city (appended after q=),
  // and Open-Meteo telemetry in parallel so we always have complete readings.
  const [weatherApiCurrent, openMeteoWeather] = await Promise.all([
    fetchWeatherApiCurrent(targetCity, language),
    clientWeather && clientWeather.location.name.toLowerCase().trim() === targetCity.toLowerCase()
      ? Promise.resolve(clientWeather)
      : fetchWeatherAndAirQuality({
          city: targetCity,
          days: 1,
          lang: language,
        }).catch(() => null),
  ]);

  if (!weatherApiCurrent && !openMeteoWeather) {
    throw new ApiError(
      404,
      language === 'ar'
        ? `لم يتم العثور على بيانات للمدينة "${targetCity}". تأكد من اسم المدينة وحاول مجدداً.`
        : `No weather data found for city "${targetCity}". Please check the city name and try again.`
    );
  }

  const resolvedCityName =
    weatherApiCurrent?.location.name || openMeteoWeather?.location.name || targetCity;
  const resolvedCountry =
    weatherApiCurrent?.location.country || openMeteoWeather?.location.country || '';
  const resolvedRegion =
    weatherApiCurrent?.location.region || openMeteoWeather?.location.admin1 || '';
  const resolvedLocalTime =
    weatherApiCurrent?.location.localtime || openMeteoWeather?.location.localTime || '';

  // Parse Year / Month / Day / Hour from localtime ("YYYY-MM-DD HH:mm" or ISO)
  const dtMatch = resolvedLocalTime.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2})/);
  const nowFallback = new Date();
  const parsedYear = dtMatch ? Number(dtMatch[1]) : nowFallback.getFullYear();
  const parsedMonth = dtMatch ? Number(dtMatch[2]) : nowFallback.getMonth() + 1;
  const parsedDay = dtMatch ? Number(dtMatch[3]) : nowFallback.getDate();
  const parsedHour = dtMatch ? Number(dtMatch[4]) : nowFallback.getHours();

  const languageInstruction =
    language === 'ar'
      ? 'Write analysisSummary, dominantPollutant, and healthRecommendations in clear, natural Arabic.'
      : 'Write analysisSummary, dominantPollutant, and healthRecommendations in clear, concise English.';

  const focusNote = userFocus?.trim()
    ? `User's specific inquiry or activity context for ${resolvedCityName}: "${userFocus.trim()}"`
    : 'User wants the current pollution percentage, air quality parameters, and safety level for this city.';

  const weatherApiJsonBlock = weatherApiCurrent
    ? JSON.stringify(
        {
          location: weatherApiCurrent.location,
          current: weatherApiCurrent.current,
        },
        null,
        2
      )
    : 'Unavailable';

  const openMeteoAqBlock = openMeteoWeather
    ? JSON.stringify(
        {
          airQuality: openMeteoWeather.airQuality,
          solarRadiationWm2: openMeteoWeather.current.solarRadiationWm2,
        },
        null,
        2
      )
    : 'Unavailable';

  const prompt = `Based on the live WeatherAPI current.json response and environmental telemetry for the city "${targetCity}" (${resolvedCityName}, ${resolvedCountry}), generate an accurate set of environmental parameters and pollution percentage indicators.

${focusNote}

WeatherAPI Current JSON (fetched for q=${targetCity}):
${weatherApiJsonBlock}

Supplementary Air Quality & Solar Radiation Telemetry:
${openMeteoAqBlock}

Instructions:
1. Use the exact timestamp values from location.localtime: year=${parsedYear}, month=${parsedMonth}, day=${parsedDay}, hour=${parsedHour}.
2. Keep temperatureC, humidityPercent, precipitationMm, and windSpeedMs (wind_kph / 3.6) consistent with the live WeatherAPI "current" JSON above.
3. Ground pm25, pm10, predictedAqi, and pollutionPercentage (0-100) in the live air quality telemetry (from WeatherAPI current.air_quality or Open-Meteo airQuality when available) alongside the city's weather dispersion factors (wind_kph, humidity, pressure_mb, cloud, vis_km, uv).
4. Classify safetyLevel strictly as one of: "safe", "low", "medium", or "high".
5. ${languageInstruction}
6. Provide 3 to 4 practical healthRecommendations tailored to ${resolvedCityName} and any user context.`;

  const responseSchema: ResponseSchema = {
    type: Type.OBJECT,
    properties: {
      year: { type: Type.INTEGER, description: '4-digit year from localtime.' },
      month: { type: Type.INTEGER, description: 'Month 1-12 from localtime.' },
      day: { type: Type.INTEGER, description: 'Day 1-31 from localtime.' },
      hour: { type: Type.INTEGER, description: 'Hour 0-23 from localtime.' },
      temperatureC: { type: Type.NUMBER, description: 'Temperature in °C.' },
      humidityPercent: { type: Type.NUMBER, description: 'Humidity percentage.' },
      windSpeedMs: { type: Type.NUMBER, description: 'Wind speed in m/s (wind_kph / 3.6).' },
      noiseLevelDb: { type: Type.NUMBER, description: 'Estimated ambient noise level in dB.' },
      precipitationMm: { type: Type.NUMBER, description: 'Precipitation in mm.' },
      solarRadiationWm2: { type: Type.NUMBER, description: 'Solar radiation in W/m².' },
      pollutionPercentage: { type: Type.NUMBER, description: 'Overall pollution percentage 0-100.' },
      predictedAqi: { type: Type.NUMBER, description: 'Predicted or measured AQI.' },
      pm25: { type: Type.NUMBER, description: 'PM2.5 in µg/m³.' },
      pm10: { type: Type.NUMBER, description: 'PM10 in µg/m³.' },
      safetyLevel: { type: Type.STRING, description: 'One of: safe, low, medium, high.' },
      dominantPollutant: { type: Type.STRING, description: 'Primary pollutant in the city.' },
      analysisSummary: {
        type: Type.STRING,
        description: 'Concise 2-3 sentence summary of the city pollution rate and weather impact.',
      },
      healthRecommendations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '3 to 4 practical health and outdoor activity tips.',
      },
    },
    required: [
      'year',
      'month',
      'day',
      'hour',
      'temperatureC',
      'humidityPercent',
      'windSpeedMs',
      'noiseLevelDb',
      'precipitationMm',
      'solarRadiationWm2',
      'pollutionPercentage',
      'predictedAqi',
      'pm25',
      'pm10',
      'safetyLevel',
      'dominantPollutant',
      'analysisSummary',
      'healthRecommendations',
    ],
  };

  const response = await generateEnvironmentalWithRetry(ai, genai, {
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });
  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Omit<
    EnvironmentalAnalysis,
    'city' | 'country' | 'region' | 'localTime' | 'visibilityKm' | 'windDir' | 'measuredBaseline'
  >;

  const normalizedSafety = ['safe', 'low', 'medium', 'high'].includes(
    String(parsed.safetyLevel).toLowerCase()
  )
    ? (String(parsed.safetyLevel).toLowerCase() as EnvironmentalAnalysis['safetyLevel'])
    : 'low';

  return {
    ...parsed,
    safetyLevel: normalizedSafety,
    city: resolvedCityName,
    country: resolvedCountry,
    region: resolvedRegion,
    localTime: resolvedLocalTime,
    visibilityKm: weatherApiCurrent?.current.vis_km,
    windDir: weatherApiCurrent?.current.wind_dir,
    measuredBaseline: openMeteoWeather?.airQuality,
  };
}
