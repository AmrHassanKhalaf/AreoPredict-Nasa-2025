import type {
  AirQualityData,
  CitySuggestion,
  ForecastDay,
  HourForecast,
  Language,
  WeatherData,
} from '../src/types/weather';

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

/**
 * WeatherAPI key used for the optional `current.json` cross-check.
 * It can be overridden with the WEATHER_API_KEY environment variable.
 */
const FALLBACK_WEATHER_API_KEY = 'c45e044b6afd432cb5b201539250210';

export function getWeatherApiKey(): string {
  const fromEnv = process.env.WEATHER_API_KEY?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : FALLBACK_WEATHER_API_KEY;
}

export function hasCustomWeatherApiKey(): boolean {
  return Boolean(process.env.WEATHER_API_KEY?.trim());
}

export async function searchCities(query: string, lang: Language): Promise<CitySuggestion[]> {
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

export async function reverseGeocode(
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

export async function fetchWeatherApiCurrent(
  cityName: string,
  lang: Language
): Promise<WeatherApiCurrentResponse | null> {
  const apiKey = getWeatherApiKey();

  const tryFetch = async (query: string): Promise<WeatherApiCurrentResponse | null> => {
    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(
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

export async function fetchWeatherAndAirQuality(params: {
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

export type { WeatherApiCurrentResponse };
