import React, { useEffect } from 'react';
import { X, Sunrise, Sunset, Droplets, Wind } from 'lucide-react';
import { ForecastDay, Language, TempUnit } from '../types/weather';
import { getWeatherConditionText, translations } from '../i18n/translations';
import { WeatherIcon } from './WeatherIcon';

interface ForecastDetailModalProps {
  day: ForecastDay;
  unit: TempUnit;
  lang: Language;
  onClose: () => void;
}

const formatTemp = (c: number, unit: TempUnit) =>
  unit === 'F' ? Math.round((c * 9) / 5 + 32) : Math.round(c);

export const ForecastDetailModal: React.FC<ForecastDetailModalProps> = ({
  day,
  unit,
  lang,
  onClose,
}) => {
  const t = translations[lang];

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const formattedDate = new Date(day.date + 'T12:00:00').toLocaleDateString(
    lang === 'ar' ? 'ar-EG' : 'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.hourlyModalTitle}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t.hourlyModalTitle} {formattedDate}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
              <span className="inline-flex items-center gap-1">
                <Sunrise className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                {t.sunrise}: {day.sunrise ? day.sunrise.slice(11, 16) : '--:--'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Sunset className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
                {t.sunset}: {day.sunset ? day.sunset.slice(11, 16) : '--:--'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t.precipitation}: {day.precipitationSumMm.toFixed(1)} {t.mm}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {day.hours.map((hour) => (
            <div
              key={hour.time}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-col items-center text-center bg-slate-50/70 dark:bg-slate-800/40"
            >
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono-tabular">
                {hour.time.slice(11, 16)}
              </span>
              <div className="my-2">
                <WeatherIcon code={hour.weatherCode} isDay={hour.isDay} className="w-8 h-8" />
              </div>
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100 font-mono-tabular">
                {formatTemp(hour.tempC, unit)}°{unit}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                {getWeatherConditionText(hour.weatherCode, lang)}
              </span>
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/70 w-full flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                <span className="inline-flex items-center gap-0.5">
                  <Droplets className="w-3 h-3 text-sky-500" aria-hidden="true" />
                  {hour.chanceOfRain}%
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Wind className="w-3 h-3 text-slate-400" aria-hidden="true" />
                  {Math.round(hour.windKph)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
