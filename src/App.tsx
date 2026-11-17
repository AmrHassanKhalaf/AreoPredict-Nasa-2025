import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Compass,
  Droplets,
  Gauge,
  Loader2,
  MapPin,
  Moon,
  Search,
  Sun,
  Thermometer,
  Trash2,
  Wind,
} from 'lucide-react';
import {
  CitySuggestion,
  ForecastDay,
  Language,
  TempUnit,
  WeatherData,
} from './types/weather';
import { getWeatherConditionText, translations } from './i18n/translations';
import { WeatherIcon } from './components/WeatherIcon';
import { HourlyChart } from './components/HourlyChart';
import { ForecastDetailModal } from './components/ForecastDetailModal';
import { EnvironmentalPanel } from './components/EnvironmentalPanel';

const FAVORITES_KEY = 'aeropulse_favorite_cities_v1';
const THEME_KEY = 'aeropulse_theme_v1';
const LANG_KEY = 'aeropulse_lang_v1';

const QUICK_CITIES = [
  { ar: 'القاهرة', en: 'Cairo' },
  { ar: 'الإسكندرية', en: 'Alexandria' },
  { ar: 'الرياض', en: 'Riyadh' },
  { ar: 'دبي', en: 'Dubai' },
  { ar: 'لندن', en: 'London' },
];

const formatTemp = (c: number, unit: TempUnit) =>
  unit === 'F' ? Math.round((c * 9) / 5 + 32) : Math.round(c);

export const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === 'en' ? 'en' : 'ar';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [unit, setUnit] = useState<TempUnit>('C');
  const [cityInput, setCityInput] = useState<string>('Cairo');
  const [days, setDays] = useState<number>(5);

  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [activeChartDayIndex, setActiveChartDayIndex] = useState<number>(0);
  const [modalDay, setModalDay] = useState<ForecastDay | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const t = translations[lang];

  // Sync HTML dir/lang & dark mode class
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  // Close autocomplete on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchWrapperRef.current &&
        !searchWrapperRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchWeather = useCallback(
    async (opts: { city?: string; lat?: number; lon?: number; forecastDays?: number }) => {
      setLoading(true);
      setError(null);
      setShowSuggestions(false);

      const targetDays = opts.forecastDays ?? days;
      const params = new URLSearchParams({
        days: String(targetDays),
        lang,
      });

      if (opts.lat !== undefined && opts.lon !== undefined) {
        params.set('lat', String(opts.lat));
        params.set('lon', String(opts.lon));
      } else if (opts.city) {
        params.set('city', opts.city.trim());
      }

      try {
        const res = await fetch(`/api/weather?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load weather data.');
        }
        setWeatherData(data as WeatherData);
        setCityInput((data as WeatherData).location.name);
        setActiveChartDayIndex(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      } finally {
        setLoading(false);
      }
    },
    [days, lang]
  );

  // Initial load for Cairo
  useEffect(() => {
    fetchWeather({ city: 'Cairo', forecastDays: 5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced city autocomplete
  useEffect(() => {
    const q = cityInput.trim();
    if (q.length < 2 || weatherData?.location.name === q) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/cities?q=${encodeURIComponent(q)}&lang=${lang}`
        );
        if (res.ok) {
          const data = (await res.json()) as { suggestions: CitySuggestion[] };
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // Ignore autocomplete network errors silently
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [cityInput, lang, weatherData?.location.name]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    fetchWeather({ city: cityInput.trim(), forecastDays: days });
  };

  const handleDaysChange = (newDays: number) => {
    setDays(newDays);
    if (weatherData) {
      fetchWeather({
        lat: weatherData.location.latitude,
        lon: weatherData.location.longitude,
        forecastDays: newDays,
      });
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError(t.geoUnsupported);
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        fetchWeather({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          forecastDays: days,
        });
      },
      () => {
        setLocating(false);
        setError(t.geoDenied);
      },
      { timeout: 10000 }
    );
  };

  const toggleFavorite = (name: string) => {
    setFavorites((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [name, ...prev].slice(0, 8)
    );
  };

  const isCurrentFavorite = weatherData
    ? favorites.includes(weatherData.location.name)
    : false;

  const activeDay =
    weatherData?.forecast[activeChartDayIndex] || weatherData?.forecast[0] || null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Bar Contract: 3 zones only */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            {t.brand}
          </a>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            <a
              href="#current-section"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t.navCurrent}
            </a>
            <a
              href="#hourly-section"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t.navHourly}
            </a>
            <a
              href="#forecast-section"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t.navForecast}
            </a>
            <a
              href="#environment-section"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t.navEnvironment}
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating || loading}
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {locating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{locating ? t.locating : t.useMyLocation}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Workspace Search & Utility Toolbar */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Search input + autocomplete */}
            <div ref={searchWrapperRef} className="relative flex-1">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={cityInput}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setCityInput(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder={t.searchPlaceholder}
                    aria-label={t.searchPlaceholder}
                    className="w-full h-11 ps-10 pe-3.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !cityInput.trim()}
                  className="h-11 px-5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {t.searchButton}
                </button>
              </form>

              {showSuggestions && suggestions.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute z-20 mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden"
                >
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCityInput(s.name);
                          fetchWeather({
                            lat: s.latitude,
                            lon: s.longitude,
                            forecastDays: days,
                          });
                        }}
                        className="w-full px-4 py-2.5 text-start text-sm hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {s.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {[s.admin1, s.country].filter(Boolean).join(', ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Segmented Controls: Days, Unit, Language, Theme */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {[3, 5, 7].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDaysChange(d)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      days === d
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {d === 3 ? t.days3 : d === 5 ? t.days5 : t.days7}
                  </button>
                ))}
              </div>

              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['C', 'F'] as TempUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      unit === u
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    °{u}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
                className="h-9 px-3 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {lang === 'ar' ? 'EN' : 'العربية'}
              </button>

              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors shrink-0 cursor-pointer"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Quick Cities & Saved Favorites */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t.quickCities}</span>
              {QUICK_CITIES.map((qc) => (
                <button
                  key={qc.en}
                  type="button"
                  onClick={() => {
                    const label = qc[lang];
                    setCityInput(label);
                    fetchWeather({ city: qc.en, forecastDays: days });
                  }}
                  className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {qc[lang]}
                </button>
              ))}
            </div>

            {favorites.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">{t.favorites}:</span>
                {favorites.map((fav) => (
                  <span key={fav} className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 rounded-md px-2 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCityInput(fav);
                        fetchWeather({ city: fav, forecastDays: days });
                      }}
                      className="font-medium hover:underline whitespace-nowrap cursor-pointer"
                    >
                      {fav}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(fav)}
                      aria-label={`${t.removeFavorite} ${fav}`}
                      className="text-blue-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {loading && !weatherData && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" aria-hidden="true" />
            <span>{t.loadingWeather}</span>
          </div>
        )}

        {weatherData && (
          <>
            {/* Hero Current Weather & Full-Width 4-Column Telemetry Strip */}
            <section
              id="current-section"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
            >
              <div className="p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3">
                  {/* Unboxed clean metadata with typographic separators */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                    <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-sans font-medium">
                      <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      {[weatherData.location.name, weatherData.location.admin1, weatherData.location.country]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{weatherData.location.localTime.replace('T', ' ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {weatherData.location.latitude.toFixed(2)}°, {weatherData.location.longitude.toFixed(2)}°
                    </span>
                  </div>

                  <div className="flex items-baseline gap-4">
                    <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white font-mono-tabular">
                      {formatTemp(weatherData.current.tempC, unit)}°{unit}
                    </h1>
                    <div className="space-y-0.5">
                      <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
                        {getWeatherConditionText(weatherData.current.weatherCode, lang)}
                      </p>
                      {weatherData.forecast[0] && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                          {formatTemp(weatherData.forecast[0].maxTempC, unit)}° /{' '}
                          {formatTemp(weatherData.forecast[0].minTempC, unit)}°
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-5 self-start md:self-center">
                  <WeatherIcon
                    code={weatherData.current.weatherCode}
                    isDay={weatherData.current.isDay}
                    className="w-20 h-20"
                  />
                  <button
                    type="button"
                    onClick={() => toggleFavorite(weatherData.location.name)}
                    className={`h-9 px-3.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      isCurrentFavorite
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 ${isCurrentFavorite ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{isCurrentFavorite ? t.removeFavorite : t.saveFavorite}</span>
                  </button>
                </div>
              </div>

              {/* 4-column KPI strip separated by clean 1px hairlines */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800">
                {[
                  {
                    icon: <Thermometer className="w-4 h-4 text-slate-400" aria-hidden="true" />,
                    label: t.feelsLike,
                    value: `${formatTemp(weatherData.current.feelsLikeC, unit)}°${unit}`,
                  },
                  {
                    icon: <Droplets className="w-4 h-4 text-sky-500" aria-hidden="true" />,
                    label: t.humidity,
                    value: `${Math.round(weatherData.current.humidity)}%`,
                  },
                  {
                    icon: <Wind className="w-4 h-4 text-slate-400" aria-hidden="true" />,
                    label: t.wind,
                    value: `${Math.round(weatherData.current.windKph)} ${t.kph}`,
                  },
                  {
                    icon: <Gauge className="w-4 h-4 text-slate-400" aria-hidden="true" />,
                    label: `${t.pressure} · ${t.uvIndex}`,
                    value: `${Math.round(weatherData.current.pressureMb)} ${t.mb} · UV ${weatherData.current.uvIndex.toFixed(1)}`,
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white dark:bg-slate-900 px-6 py-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {kpi.icon}
                      <span>{kpi.label}</span>
                    </div>
                    <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono-tabular">
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Interactive Hourly Trend Chart */}
            {activeDay && <HourlyChart day={activeDay} unit={unit} lang={lang} />}

            {/* Multi-Day Forecast Grid */}
            <section id="forecast-section" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t.forecastSectionTitle} ({weatherData.forecast.length}{' '}
                  {lang === 'ar' ? 'أيام' : 'Days'})
                </h2>
              </div>

              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${
                  weatherData.forecast.length <= 3
                    ? 'lg:grid-cols-3'
                    : weatherData.forecast.length === 5
                    ? 'lg:grid-cols-5'
                    : 'lg:grid-cols-4 xl:grid-cols-7'
                }`}
              >
                {weatherData.forecast.map((day, idx) => {
                  const isSelected = idx === activeChartDayIndex;
                  const formatted = new Date(day.date + 'T12:00:00').toLocaleDateString(
                    lang === 'ar' ? 'ar-EG' : 'en-US',
                    { weekday: 'short', month: 'short', day: 'numeric' }
                  );
                  return (
                    <div
                      key={day.date}
                      className={`rounded-xl border p-4 flex flex-col justify-between transition-colors ${
                        isSelected
                          ? 'bg-white dark:bg-slate-900 border-blue-600 ring-1 ring-blue-600/20'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveChartDayIndex(idx)}
                        className="text-start w-full cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {formatted}
                          </span>
                          <WeatherIcon code={day.weatherCode} isDay className="w-7 h-7" />
                        </div>

                        <div className="mt-3 flex items-baseline gap-2 font-mono-tabular">
                          <span className="text-xl font-bold text-slate-900 dark:text-white">
                            {formatTemp(day.maxTempC, unit)}°
                          </span>
                          <span className="text-sm text-slate-400 dark:text-slate-500">
                            / {formatTemp(day.minTempC, unit)}°
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                          {getWeatherConditionText(day.weatherCode, lang)}
                        </p>

                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                          <span className="inline-flex items-center gap-1">
                            <Droplets className="w-3 h-3 text-sky-500" aria-hidden="true" />
                            {day.maxChanceOfRain}%
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Wind className="w-3 h-3 text-slate-400" aria-hidden="true" />
                            {Math.round(day.maxWindKph)} {t.kph}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalDay(day)}
                        className="mt-4 w-full h-8 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        {t.viewHourlyDetails}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* AI Environmental & Pollution Intelligence Panel */}
            <EnvironmentalPanel weatherData={weatherData} lang={lang} />
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-5 px-4 sm:px-6 text-center text-xs text-slate-500 dark:text-slate-400">
        {t.brand} · Open-Meteo Meteorological &amp; Air Quality Telemetry
      </footer>

      {modalDay && (
        <ForecastDetailModal
          day={modalDay}
          unit={unit}
          lang={lang}
          onClose={() => setModalDay(null)}
        />
      )}
    </div>
  );
};

export default App;
