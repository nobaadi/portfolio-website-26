/**
 * NationalOverview – small cards showing the national CPI rate plus
 * all user-facing categories at a glance. Includes trend direction arrows
 * and a mini bar to visualise magnitude at a glance.
 */
import type { LatestCPI } from '../types';
import { inflationSeverity, severityTextClass } from '../lib/inflationSemantics';
import { formatPeriodLabel } from '../lib/periodLabel';

interface Props {
  latest: LatestCPI;
  /** When true, renders without the outer white card wrapper (for use inside panel cards) */
  compact?: boolean;
}

function trendArrow(rate: number | null): string {
  if (rate === null) return '';
  if (rate > 0.3) return '↑';
  if (rate < -0.3) return '↓';
  return '→';
}

/** Cap at ±5% for bar width */
function barWidth(rate: number | null): number {
  if (rate === null) return 0;
  return Math.min(Math.abs(rate) / 5, 1) * 100;
}

function barColor(rate: number | null): string {
  const sev = inflationSeverity(rate);
  if (sev === 'bad') return 'bg-red-400';
  if (sev === 'caution') return 'bg-amber-400';
  if (sev === 'good') return 'bg-emerald-400';
  return 'bg-neutral-300';
}

function rateChip(rate: number | null) {
  if (rate === null) return <span className="text-gray-300">N/A</span>;
  const cls = severityTextClass(inflationSeverity(rate));
  const arrow = trendArrow(rate);
  return (
    <span className={`font-semibold tabular-nums ${cls}`}>
      {rate >= 0 ? '+' : ''}{rate.toFixed(1)}%
      {arrow && <span className="ml-0.5 text-[0.72em] opacity-75">{arrow}</span>}
    </span>
  );
}

export default function NationalOverview({ latest, compact }: Props) {
  const displayPeriod = formatPeriodLabel(latest.period);
  const inner = (
    <>
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-400">Singapore CPI</p>
          <h2 className="text-xl font-semibold text-neutral-900 mt-1 tracking-tight">Category pulse</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{displayPeriod} · SingStat</p>
        </div>
        {latest.national && (
          <div className="text-right rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400">All Items</p>
            <p className="text-2xl mt-1">{rateChip(latest.national.inflation_rate)}</p>
            <p className="text-[9px] uppercase tracking-[0.1em] text-neutral-400 mt-0.5">
              {trendArrow(latest.national.inflation_rate) === '↑' ? 'Rising' : trendArrow(latest.national.inflation_rate) === '↓' ? 'Falling' : 'Stable'}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stagger">
        {latest.categories.map((cat) => {
          const bw = barWidth(cat.inflation_rate);
          const bc = barColor(cat.inflation_rate);
          return (
            <div
              key={cat.id}
              className="bg-gradient-to-b from-white to-[#f7f7f8] border border-neutral-200 rounded-2xl p-3 text-center cursor-default transition-all duration-200 hover:scale-[1.04] hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)] hover:border-neutral-300 hover:from-white hover:to-neutral-50 group overflow-hidden"
              title={cat.series_name}
            >
              <p className="text-xs text-neutral-500 mb-1.5 leading-tight whitespace-normal break-normal min-h-[2.1rem] group-hover:text-neutral-700 transition-colors duration-200" title={cat.series_name}>
                {cat.series_name}
              </p>
              <p className="text-lg">{rateChip(cat.inflation_rate)}</p>
              {/* Mini magnitude bar */}
              <div className="mt-2 h-1 w-full rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${bc}`}
                  style={{ width: `${bw}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  if (compact) return <div>{inner}</div>;

  return (
    <div className="bg-white rounded-[26px] border border-neutral-200 p-6 sm:p-7">
      {inner}
    </div>
  );
}
