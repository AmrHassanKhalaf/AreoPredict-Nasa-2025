export type Language = 'ar' | 'en';
export type TempUnit = 'C' | 'F';
export type SafetyLevel = 'safe' | 'low' | 'medium' | 'high';

export interface CitySuggestion {
  id: number;
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface HourForecast {
  time: string;
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  chanceOfRain: number;
  precipitationMm: number;
  weatherCode: number;
  uvIndex: number;
  solarRadiationWm2: number;
  isDay: boolean;
}

export interface ForecastDay {
  date: string;
  maxTempC: number;
  minTempC: number;
  weatherCode: number;
  sunrise: string;
  sunset: string;
  uvIndexMax: number;
  precipitationSumMm: number;
  maxChanceOfRain: number;
  maxWindKph: number;
  hours: HourForecast[];
}

export interface AirQualityData {
  europeanAqi: number | null;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  dust: number | null;
  uvIndex: number | null;
}

export interface WeatherData {
  location: {
    name: string;
    country: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone: string;
    localTime: string;
  };
  current: {
    tempC: number;
    feelsLikeC: number;
    humidity: number;
    windKph: number;
    windDirection: number;
    pressureMb: number;
    precipitationMm: number;
    cloudCover: number;
    weatherCode: number;
    isDay: boolean;
    uvIndex: number;
    solarRadiationWm2: number;
  };
  airQuality: AirQualityData;
  forecast: ForecastDay[];
}

export interface EnvironmentalAnalysis {
  city: string;
  country?: string;
  region?: string;
  localTime?: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  pollutionPercentage: number;
  predictedAqi: number;
  pm25: number;
  pm10: number;
  noiseLevelDb: number;
  solarRadiationWm2: number;
  precipitationMm: number;
  temperatureC: number;
  humidityPercent: number;
  windSpeedMs: number;
  visibilityKm?: number;
  windDir?: string;
  safetyLevel: SafetyLevel;
  dominantPollutant: string;
  analysisSummary: string;
  healthRecommendations: string[];
  measuredBaseline?: AirQualityData;
}
