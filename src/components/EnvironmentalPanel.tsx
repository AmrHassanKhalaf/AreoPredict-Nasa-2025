import React, { FormEvent, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Wind,
} from 'lucide-react';
import {
  EnvironmentalAnalysis,
  Language,
  SafetyLevel,
  WeatherData,
} from '../types/weather';
import { translations } from '../i18n/translations';

interface EnvironmentalPanelProps {
  weatherData: WeatherData;
  lang: Language;
}

export const EnvironmentalPanel: React.FC<EnvironmentalPanelProps> = ({
  weatherData,
  lang,
}) => {
  const t = translations[lang];
  const [targetCity, setTargetCity] = useState<string>(weatherData.location.name);
  const [userFocus, setUserFocus] = useState<string>('');
  const [analysis, setAnalysis] = useState<EnvironmentalAnalysis | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTargetCity(weatherData.location.name);
    setAnalysis(null);
    setError(null);
  }, [weatherData.location.name]);

  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedCity = targetCity.trim();
    if (!trimmedCity) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze-environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityName: trimmedCity,
          weatherData,
          userFocus: userFocus.trim(),
          lang,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze city environment.');
      }

      setAnalysis(data as EnvironmentalAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const getSafetyPresentation = (level: SafetyLevel) => {
    switch (level) {
      case 'safe':
        return {
          container:
            'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200',
          icon: <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
        };
      case 'low':
        return {
          container:
            'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/80 text-sky-900 dark:text-sky-200',
          icon: <CheckCircle2 className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />,
        };
      case 'medium':
        return {
          container:
            'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
        };
      case 'high':
        return {
          container:
            'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/80 text-red-900 dark:text-red-200',
          icon: <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />,
        };
    }
  };

  const aq = weatherData.airQuality;

  return (
    <section
      id="environment-section"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t.envTitle}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            {t.envSubtitle}
          </p>
        </div>
      </div>

      {/* Live Measured Baseline Telemetry */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            {t.liveAirQualityTitle}
            <span className="text-slate-400 dark:text-slate-500 font-normal">
              · {weatherData.location.name}
            </span>
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          {[
            { label: 'US AQI', value: aq.usAqi !== null ? `${Math.round(aq.usAqi)}` : '—' },
            { label: 'EU AQI', value: aq.europeanAqi !== null ? `${Math.round(aq.europeanAqi)}` : '—' },
            { label: 'PM2.5', value: aq.pm25 !== null ? `${aq.pm25.toFixed(1)} µg/m³` : '—' },
            { label: 'PM10', value: aq.pm10 !== null ? `${aq.pm10.toFixed(1)} µg/m³` : '—' },
            { label: 'O₃', value: aq.o3 !== null ? `${aq.o3.toFixed(1)} µg/m³` : '—' },
            { label: 'NO₂', value: aq.no2 !== null ? `${aq.no2.toFixed(1)} µg/m³` : '—' },
          ].map((metric) => (
            <div key={metric.label} className="bg-slate-50 dark:bg-slate-900/90 p-3.5">
              <div className="text-xs text-slate-500 dark:text-slate-400">{metric.label}</div>
              <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono-tabular">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prompt Input Taking User City Name & Optional Context */}
      <form
        onSubmit={handleAnalyze}
        className="flex flex-col md:flex-row gap-3 items-stretch md:items-end pt-2"
      >
        <div className="md:w-64 shrink-0">
          <label
            htmlFor="env-city-input"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {t.envCityLabel}
          </label>
          <input
            id="env-city-input"
            type="text"
            value={targetCity}
            onChange={(e) => setTargetCity(e.target.value)}
            placeholder={t.envCityPlaceholder}
            required
            className="w-full h-11 px-3.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
          />
        </div>

        <div className="flex-1 min-w-0">
          <label
            htmlFor="env-focus-input"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {t.envFocusLabel}
          </label>
          <input
            id="env-focus-input"
            type="text"
            value={userFocus}
            onChange={(e) => setUserFocus(e.target.value)}
            placeholder={t.envFocusPlaceholder}
            className="w-full h-11 px-3.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
          />
        </div>

        <div className="shrink-0">
          <button
            type="submit"
            disabled={loading || !targetCity.trim()}
            className="w-full md:w-auto h-11 px-5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{t.envAnalyzing}</span>
              </>
            ) : (
              <>
                <Wind className="w-4 h-4" aria-hidden="true" />
                <span>{t.envAnalyzeBtn}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {analysis && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t.aiAssessmentTitle} · {analysis.city}
                {analysis.region ? `, ${analysis.region}` : ''}
                {analysis.country ? `, ${analysis.country}` : ''}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono-tabular">
                {t.localTimestamp}: {analysis.year}-{String(analysis.month).padStart(2, '0')}-
                {String(analysis.day).padStart(2, '0')} {String(analysis.hour).padStart(2, '0')}:00
                {analysis.visibilityKm !== undefined
                  ? ` · ${t.visibility}: ${analysis.visibilityKm} km`
                  : ''}
                {analysis.windDir ? ` · ${analysis.windDir}` : ''}
              </p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t.dominantPollutant}:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {analysis.dominantPollutant}
              </strong>
            </span>
          </div>

          {/* Explicit Status Banner with Icon + Text (Never color-only) */}
          {(() => {
            const safety = getSafetyPresentation(analysis.safetyLevel);
            return (
              <div
                className={`flex items-center gap-3 p-4 rounded-lg border text-sm font-medium ${safety.container}`}
              >
                {safety.icon}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold">[{t.safetyLabels[analysis.safetyLevel]}]</span>
                  <span>{t.safetyDescriptions[analysis.safetyLevel]}</span>
                </div>
              </div>
            );
          })()}

          {/* Structured AI Metrics Table */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              {
                label: t.pollutionPercentage,
                value: `${Math.round(analysis.pollutionPercentage)}%`,
              },
              {
                label: t.predictedAqi,
                value: `${Math.round(analysis.predictedAqi)}`,
              },
              {
                label: t.pm25,
                value: `${analysis.pm25.toFixed(1)} µg/m³`,
              },
              {
                label: t.pm10,
                value: `${analysis.pm10.toFixed(1)} µg/m³`,
              },
              {
                label: t.noiseLevel,
                value: `${Math.round(analysis.noiseLevelDb)} dB`,
              },
              {
                label: t.solarRadiation,
                value: `${Math.round(analysis.solarRadiationWm2)} ${t.wm2}`,
              },
              {
                label: t.temperature,
                value: `${analysis.temperatureC.toFixed(1)}°C`,
              },
              {
                label: t.humidity,
                value: `${Math.round(analysis.humidityPercent)}%`,
              },
              {
                label: t.wind,
                value: `${analysis.windSpeedMs.toFixed(1)} ${t.ms}`,
              },
              {
                label: t.precipitation,
                value: `${analysis.precipitationMm.toFixed(1)} ${t.mm}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
                <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100 font-mono-tabular">
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Summary & Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {lang === 'ar' ? 'ملخص الحالة البيئية' : 'Environmental Summary'}
              </h4>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {analysis.analysisSummary}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {t.recommendationsTitle}
              </h4>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {analysis.healthRecommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-mono-tabular text-xs mt-1">
                      0{i + 1}.
                    </span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
