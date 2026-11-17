import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AirQualityData,
  CitySuggestion,
  EnvironmentalAnalysis,
  ForecastDay,
  HourForecast,
  Language,
  WeatherData,
} from './src/types/weather';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'c45e044b6afd432cb5b201539250210';

interface WeatherApiCurrentResponse {
  location: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
    tz_id: string;
    localtime_epoch: number;
    localtime: string;
  };
  current: {
    last_updated_epoch: number;
    last_updated: string;
    temp_c: number;
    temp_f: number;
    is_day: number;
    condition: {
      text: string;
      icon: string;
      code: number;
    };
    wind_mph: number;
    wind_kph: number;
    wind_degree: number;
    wind_dir: string;
    pressure_mb: number;
    pressure_in: number;
    precip_mm: number;
    precip_in: number;
    humidity: number;
    cloud: number;
    feelslike_c: number;
    feelslike_f: number;
    windchill_c?: number;
    windchill_f?: number;
    heatindex_c?: number;
    heatindex_f?: number;
    dewpoint_c?: number;
    dewpoint_f?: number;
    vis_km: number;
    vis_miles: number;
    uv: number;
    gust_mph: number;
    gust_kph: number;
    air_quality?: {
      co?: number;
      no2?: number;
      o3?: number;
      so2?: number;
      pm2_5?: number;
      pm10?: number;
      'us-epa-index'?: number;
      'gb-defra-index'?: number;
    };
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientOverloadError(err: unknown): boolean {
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
  ai: GoogleGenAI,
  contents: string,
  responseSchema: Record<string, unknown>
) {
  const attempts: Array<{ model: string; thinkingLevel?: ThinkingLevel; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayMs: 400 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayMs: 800 },
    { model: 'gemini-3.1-flash-lite', delayMs: 500 },
  ];
  let lastError: unknown;

  for (const step of attempts) {
    try {
      return await ai.models.generateContent({
        model: step.model,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
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

async function searchCities(query: string, lang: Language): Promise<CitySuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const fetchGeo = async (language: string) => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      trimmed
    )}&count=6&language=${language}&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: Array<{
        id: number;
        name: string;
        country?: string;
        admin1?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
      }>;
    };
    return (json.results || []).map((item) => ({
      id: item.id,
      name: item.name,
      country: item.country || '',
      admin1: item.admin1,
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone,
    }));
  };

  let results = await fetchGeo(lang);
  if (results.length === 0 && lang !== 'en') {
    results = await fetchGeo('en');
  }
  return results;
}

async function reverseGeocode(
  lat: number,
  lon: number,
  lang: Language
): Promise<{ name: string; country: string; admin1?: string }> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as {
        city?: string;
        locality?: string;
        principalSubdivision?: string;
        countryName?: string;
      };
      const name =
        data.city ||
        data.locality ||
        data.principalSubdivision ||
        `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      return {
        name,
        country: data.countryName || '',
        admin1: data.principalSubdivision,
      };
    }
  } catch {
    // Fallback to coordinate label below
  }
  return {
    name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
    country: lang === 'ar' ? 'إحداثيات الموقع' : 'Coordinates',
  };
}

async function fetchWeatherApiCurrent(
  cityName: string,
  lang: Language
): Promise<WeatherApiCurrentResponse | null> {
  const tryFetch = async (query: string): Promise<WeatherApiCurrentResponse | null> => {
    const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(
      query
    )}&aqi=yes`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as WeatherApiCurrentResponse & { error?: unknown };
    if (data && data.location && data.current) {
      return data;
    }
    return null;
  };

  // First try the exact city name supplied by the user after q=
  const direct = await tryFetch(cityName.trim());
  if (direct) return direct;

  // If the user typed an Arabic or localized city name WeatherAPI couldn't resolve directly,
  // geocode to lat,lon and pass coordinates to WeatherAPI q=
  const candidates = await searchCities(cityName, lang);
  if (candidates.length > 0) {
    const best = candidates[0];
    return await tryFetch(`${best.latitude},${best.longitude}`);
  }

  return null;
}

async function fetchWeatherAndAirQuality(params: {
  city?: string;
  lat?: number;
  lon?: number;
  days?: number;
  lang: Language;
}): Promise<WeatherData> {
  const days = Math.min(7, Math.max(1, Number(params.days) || 5));
  let latitude = params.lat;
  let longitude = params.lon;
  let cityName = params.city?.trim() || '';
  let countryName = '';
  let admin1: string | undefined;

  if (latitude === undefined || longitude === undefined) {
    if (!cityName) {
      throw new Error(params.lang === 'ar' ? 'يرجى إدخال اسم المدينة.' : 'Please enter a city name.');
    }
    const candidates = await searchCities(cityName, params.lang);
    if (candidates.length === 0) {
      throw new Error(
        params.lang === 'ar'
          ? `لم يتم العثور على مدينة باسم "${cityName}". تأكد من الإملاء وحاول مرة أخرى.`
          : `City "${cityName}" not found. Please check the spelling and try again.`
      );
    }
    const best = candidates[0];
    latitude = best.latitude;
    longitude = best.longitude;
    cityName = best.name;
    countryName = best.country;
    admin1 = best.admin1;
  } else {
    const geo = await reverseGeocode(latitude, longitude, params.lang);
    cityName = geo.name;
    countryName = geo.country;
    admin1 = geo.admin1;
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m` +
    `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index,shortwave_radiation,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
    `&timezone=auto&forecast_days=${days}`;

  const airQualityUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}` +
    `&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,dust,uv_index` +
    `&timezone=auto`;

  const [forecastRes, aqRes] = await Promise.all([fetch(forecastUrl), fetch(airQualityUrl)]);

  if (!forecastRes.ok) {
    throw new Error(
      params.lang === 'ar'
        ? 'تعذر جلب بيانات الطقس من المزود حالياً.'
        : 'Failed to retrieve forecast data from weather provider.'
    );
  }

  const forecastJson = (await forecastRes.json()) as {
    timezone: string;
    current: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      is_day: number;
      precipitation: number;
      weather_code: number;
      cloud_cover: number;
      surface_pressure: number;
      wind_speed_10m: number;
      wind_direction_10m: number;
    };
    hourly: {
      time: string[];
      temperature_2m: number[];
      relative_humidity_2m: number[];
      apparent_temperature: number[];
      precipitation_probability: number[];
      precipitation: number[];
      weather_code: number[];
      wind_speed_10m: number[];
      uv_index: number[];
      shortwave_radiation: number[];
      is_day: number[];
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      sunrise: string[];
      sunset: string[];
      uv_index_max: number[];
      precipitation_sum: number[];
      precipitation_probability_max: number[];
      wind_speed_10m_max: number[];
    };
  };

  let airQuality: AirQualityData = {
    europeanAqi: null,
    usAqi: null,
    pm25: null,
    pm10: null,
    no2: null,
    o3: null,
    so2: null,
    co: null,
    dust: null,
    uvIndex: null,
  };

  if (aqRes.ok) {
    const aqJson = (await aqRes.json()) as {
      current?: {
        european_aqi?: number;
        us_aqi?: number;
        pm10?: number;
        pm2_5?: number;
        carbon_monoxide?: number;
        nitrogen_dioxide?: number;
        sulphur_dioxide?: number;
        ozone?: number;
        dust?: number;
        uv_index?: number;
      };
    };
    if (aqJson.current) {
      airQuality = {
        europeanAqi: aqJson.current.european_aqi ?? null,
        usAqi: aqJson.current.us_aqi ?? null,
        pm25: aqJson.current.pm2_5 ?? null,
        pm10: aqJson.current.pm10 ?? null,
        no2: aqJson.current.nitrogen_dioxide ?? null,
        o3: aqJson.current.ozone ?? null,
        so2: aqJson.current.sulphur_dioxide ?? null,
        co: aqJson.current.carbon_monoxide ?? null,
        dust: aqJson.current.dust ?? null,
        uvIndex: aqJson.current.uv_index ?? null,
      };
    }
  }

  const hoursByDate = new Map<string, HourForecast[]>();
  const hourly = forecastJson.hourly;
  for (let i = 0; i < hourly.time.length; i++) {
    const timeStr = hourly.time[i];
    const dateKey = timeStr.slice(0, 10);
    const list = hoursByDate.get(dateKey) || [];
    list.push({
      time: timeStr,
      tempC: hourly.temperature_2m[i] ?? 0,
      feelsLikeC: hourly.apparent_temperature[i] ?? 0,
      humidity: hourly.relative_humidity_2m[i] ?? 0,
      windKph: hourly.wind_speed_10m[i] ?? 0,
      chanceOfRain: hourly.precipitation_probability[i] ?? 0,
      precipitationMm: hourly.precipitation[i] ?? 0,
      weatherCode: hourly.weather_code[i] ?? 0,
      uvIndex: hourly.uv_index[i] ?? 0,
      solarRadiationWm2: hourly.shortwave_radiation[i] ?? 0,
      isDay: Boolean(hourly.is_day[i]),
    });
    hoursByDate.set(dateKey, list);
  }

  const currentHourPrefix = forecastJson.current.time.slice(0, 13);
  const matchingHourIdx = hourly.time.findIndex((t) => t.startsWith(currentHourPrefix));
  const currentUv =
    (matchingHourIdx >= 0 ? hourly.uv_index[matchingHourIdx] : undefined) ??
    airQuality.uvIndex ??
    0;
  const currentSolar =
    (matchingHourIdx >= 0 ? hourly.shortwave_radiation[matchingHourIdx] : undefined) ?? 0;

  const forecast: ForecastDay[] = forecastJson.daily.time.map((date, idx) => ({
    date,
    maxTempC: forecastJson.daily.temperature_2m_max[idx] ?? 0,
    minTempC: forecastJson.daily.temperature_2m_min[idx] ?? 0,
    weatherCode: forecastJson.daily.weather_code[idx] ?? 0,
    sunrise: forecastJson.daily.sunrise[idx] ?? '',
    sunset: forecastJson.daily.sunset[idx] ?? '',
    uvIndexMax: forecastJson.daily.uv_index_max[idx] ?? 0,
    precipitationSumMm: forecastJson.daily.precipitation_sum[idx] ?? 0,
    maxChanceOfRain: forecastJson.daily.precipitation_probability_max[idx] ?? 0,
    maxWindKph: forecastJson.daily.wind_speed_10m_max[idx] ?? 0,
    hours: hoursByDate.get(date) || [],
  }));

  return {
    location: {
      name: cityName,
      country: countryName,
      admin1,
      latitude,
      longitude,
      timezone: forecastJson.timezone,
      localTime: forecastJson.current.time,
    },
    current: {
      tempC: forecastJson.current.temperature_2m,
      feelsLikeC: forecastJson.current.apparent_temperature,
      humidity: forecastJson.current.relative_humidity_2m,
      windKph: forecastJson.current.wind_speed_10m,
      windDirection: forecastJson.current.wind_direction_10m,
      pressureMb: forecastJson.current.surface_pressure,
      precipitationMm: forecastJson.current.precipitation,
      cloudCover: forecastJson.current.cloud_cover,
      weatherCode: forecastJson.current.weather_code,
      isDay: Boolean(forecastJson.current.is_day),
      uvIndex: currentUv,
      solarRadiationWm2: currentSolar,
    },
    airQuality,
    forecast,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/cities', async (req, res) => {
    try {
      const q = String(req.query.q || '');
      const lang: Language = req.query.lang === 'en' ? 'en' : 'ar';
      const suggestions = await searchCities(q, lang);
      res.json({ suggestions });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to search cities',
      });
    }
  });

  app.get('/api/weather', async (req, res) => {
    try {
      const city = req.query.city ? String(req.query.city) : undefined;
      const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
      const lon = req.query.lon !== undefined ? Number(req.query.lon) : undefined;
      const days = req.query.days !== undefined ? Number(req.query.days) : 5;
      const lang: Language = req.query.lang === 'en' ? 'en' : 'ar';

      const data = await fetchWeatherAndAirQuality({
        city,
        lat: Number.isFinite(lat) ? lat : undefined,
        lon: Number.isFinite(lon) ? lon : undefined,
        days,
        lang,
      });
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Weather lookup failed';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/analyze-environment', async (req, res) => {
    try {
      const {
        cityName,
        weatherData: clientWeather,
        userFocus,
        lang = 'ar',
      } = req.body as {
        cityName?: string;
        weatherData?: WeatherData;
        userFocus?: string;
        lang?: Language;
      };

      const language: Language = lang === 'en' ? 'en' : 'ar';
      const targetCity = (cityName || clientWeather?.location?.name || '').trim();

      if (!targetCity) {
        res.status(400).json({
          error:
            language === 'ar'
              ? 'يرجى إدخال اسم المدينة المطلوب تحليل نسبة التلوث فيها.'
              : 'Please specify the city name for pollution analysis.',
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            language === 'ar'
              ? 'مفتاح Gemini API غير مُعد على الخادم. يرجى إضافته في Settings > Secrets.'
              : 'Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      // Fetch live WeatherAPI current.json for the user-provided city (appended after q=),
      // and Open-Meteo telemetry in parallel so we always have complete readings.
      const [weatherApiCurrent, openMeteoWeather] = await Promise.all([
        fetchWeatherApiCurrent(targetCity, language),
        clientWeather &&
        clientWeather.location.name.toLowerCase().trim() === targetCity.toLowerCase()
          ? Promise.resolve(clientWeather)
          : fetchWeatherAndAirQuality({
              city: targetCity,
              days: 1,
              lang: language,
            }).catch(() => null),
      ]);

      if (!weatherApiCurrent && !openMeteoWeather) {
        res.status(404).json({
          error:
            language === 'ar'
              ? `لم يتم العثور على بيانات للمدينة "${targetCity}". تأكد من اسم المدينة وحاول مجدداً.`
              : `No weather data found for city "${targetCity}". Please check the city name and try again.`,
        });
        return;
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

      const responseSchema = {
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

      const response = await generateEnvironmentalWithRetry(ai, prompt, responseSchema);
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

      const result: EnvironmentalAnalysis = {
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

      res.json(result);
    } catch (err) {
      const overload = isTransientOverloadError(err);
      const message = overload
        ? req.body?.lang === 'en'
          ? 'The AI model is temporarily experiencing high demand. Please retry in a few seconds.'
          : 'يشهد نموذج الذكاء الاصطناعي ضغطاً مؤقتاً حالياً. يرجى المحاولة مرة أخرى بعد ثوانٍ.'
        : err instanceof Error
        ? err.message
        : 'Failed to analyze city environmental data.';
      res.status(overload ? 503 : 500).json({ error: message });
    }
  });

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
  });
}

startServer();
