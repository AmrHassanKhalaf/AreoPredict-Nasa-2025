import React, { useState } from 'react';
import { ForecastDay, Language, TempUnit } from '../types/weather';
import { translations } from '../i18n/translations';

interface HourlyChartProps {
  day: ForecastDay;
  unit: TempUnit;
  lang: Language;
}

const convertTemp = (c: number, unit: TempUnit) =>
  unit === 'F' ? Math.round((c * 9) / 5 + 32) : Math.round(c);

export const HourlyChart: React.FC<HourlyChartProps> = ({ day, unit, lang }) => {
  const t = translations[lang];
  const hours = day.hours;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!hours || hours.length === 0) return null;

  const width = 800;
  const height = 220;
  const padLeft = 42;
  const padRight = 24;
  const padTop = 28;
  const padBottom = 34;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const temps = hours.map((h) => convertTemp(h.tempC, unit));
  const minT = Math.min(...temps) - 2;
  const maxT = Math.max(...temps) + 2;
  const rangeT = Math.max(1, maxT - minT);

  const getX = (idx: number) =>
    padLeft + (idx / Math.max(1, hours.length - 1)) * chartW;
  const getY = (temp: number) =>
    padTop + chartH - ((temp - minT) / rangeT) * chartH;

  const points = hours.map((h, i) => ({
    x: getX(i),
    y: getY(temps[i]),
    temp: temps[i],
    rain: h.chanceOfRain,
    wind: Math.round(h.windKph),
    label: h.time.slice(11, 16),
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} ` +
    `L ${points[0].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;

  const formattedDay = new Date(day.date + 'T12:00:00').toLocaleDateString(
    lang === 'ar' ? 'ar-EG' : 'en-US',
    { weekday: 'long', month: 'short', day: 'numeric' }
  );

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <section
      id="hourly-section"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t.hourlyTrendTitle}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t.selectedDayLabel} {formattedDay}
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-blue-600 inline-block" aria-hidden="true" />
            {t.temperature} (°{unit})
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-sky-400/40 border border-sky-500/60 rounded-xs inline-block" aria-hidden="true" />
            {t.rainChance} (%)
          </span>
        </div>
      </div>

      {activePoint ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300 font-mono-tabular">
          <span className="font-semibold text-slate-900 dark:text-white">{activePoint.label}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t.temperature}: <strong>{activePoint.temp}°{unit}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.rainChance}: <strong>{activePoint.rain}%</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.wind}: <strong>{activePoint.wind} {t.kph}</strong>
          </span>
        </div>
      ) : (
        <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {lang === 'ar'
            ? 'مرّر المؤشر فوق المنحنى لاستعراض بيانات كل ساعة بدقة'
            : 'Hover over the curve to inspect hour-by-hour readings'}
        </div>
      )}

      <div className="w-full overflow-x-auto" dir="ltr">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[540px] h-52 select-none"
          role="img"
          aria-label={t.hourlyTrendTitle}
        >
          <defs>
            <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines */}
          {[0, 0.5, 1].map((ratio) => {
            const val = Math.round(minT + ratio * rangeT);
            const y = padTop + chartH - ratio * chartH;
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[11px] font-mono"
                >
                  {val}°
                </text>
              </g>
            );
          })}

          {/* Rain Probability Bars */}
          {points.map((p, idx) => {
            const barH = (p.rain / 100) * (chartH * 0.65);
            const barW = Math.max(8, chartW / points.length - 6);
            return (
              <rect
                key={`rain-${idx}`}
                x={p.x - barW / 2}
                y={padTop + chartH - barH}
                width={barW}
                height={barH}
                rx={2}
                className="fill-sky-400/30 dark:fill-sky-500/25"
              />
            );
          })}

          {/* Area & Line */}
          <path d={areaPath} fill="url(#tempFill)" />
          <path
            d={linePath}
            fill="none"
            stroke="#2563EB"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X-axis Labels (every 3 hours) */}
          {points.map((p, idx) =>
            idx % 3 === 0 ? (
              <text
                key={`lbl-${idx}`}
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[11px] font-mono"
              >
                {p.label}
              </text>
            ) : null
          )}

          {/* Active Hover Marker */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={padTop + chartH}
                className="stroke-slate-400 dark:stroke-slate-600"
                strokeDasharray="2 2"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="5"
                className="fill-blue-600 stroke-white dark:stroke-slate-900"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Interactive Hit Targets */}
          {points.map((p, idx) => {
            const sliceW = chartW / Math.max(1, points.length - 1);
            return (
              <rect
                key={`hit-${idx}`}
                x={p.x - sliceW / 2}
                y={padTop}
                width={sliceW}
                height={chartH + 10}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-crosshair"
              />
            );
          })}
        </svg>
      </div>
    </section>
  );
};
