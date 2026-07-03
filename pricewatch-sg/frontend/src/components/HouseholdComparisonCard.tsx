import type { HouseholdComparisonResponse } from '../types';
import { diffSeverity, severityBgBorderClass, severityTextClass } from '../lib/inflationSemantics';
import { formatPeriodLabel } from '../lib/periodLabel';

interface Props {
  comparison: HouseholdComparisonResponse | null;
  loading?: boolean;
}

function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatDiff(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} pp`;
}

export default function HouseholdComparisonCard({ comparison, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[220px] animate-pulse">
        <div className="h-3 w-28 rounded bg-neutral-200 mb-3" />
        <div className="h-8 w-56 rounded bg-neutral-200 mb-4" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="h-14 rounded bg-neutral-100" />
          <div className="h-14 rounded bg-neutral-100" />
          <div className="h-14 rounded bg-neutral-100" />
        </div>
        <div className="h-10 rounded bg-neutral-100" />
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[220px] flex items-center">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Comparison</p>
          <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800 mb-2">Household comparison</p>
          <p className="text-xs text-neutral-500 break-normal">No comparison available yet. Calculate your inflation to unlock this card.</p>
        </div>
      </div>
    );
  }

  const tone = diffSeverity(comparison.difference);

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[220px] flex flex-col">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Comparison</p>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800">Household comparison</p>
          <p className="text-[11px] text-neutral-500">Period: {formatPeriodLabel(comparison.period)}</p>
        </div>
        <div className={`rounded-lg border px-2.5 py-1 ${severityBgBorderClass(tone)}`}>
          <p className="text-[10px] text-neutral-500">Difference</p>
          <p className={`text-sm font-semibold tabular-nums ${severityTextClass(tone)}`}>
            {formatDiff(comparison.difference)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 mb-3">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-center min-h-[74px] flex flex-col items-center justify-center">
          <p className="text-[11px] leading-tight text-neutral-500 whitespace-nowrap">Your inflation</p>
          <p className="text-[1.55rem] leading-none font-semibold text-neutral-800 tabular-nums mt-1">{formatRate(comparison.your_inflation)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-center min-h-[74px] flex flex-col items-center justify-center">
          <p className="text-[11px] leading-tight text-neutral-500 whitespace-nowrap">National CPI</p>
          <p className="text-[1.55rem] leading-none font-semibold text-neutral-800 tabular-nums mt-1">{formatRate(comparison.national_cpi)}</p>
        </div>
        <div className={`rounded-xl border px-2.5 py-2 text-center min-h-[74px] flex flex-col items-center justify-center ${severityBgBorderClass(tone)}`}>
          <p className="text-[11px] leading-tight text-neutral-500 whitespace-nowrap">Gap</p>
          <p className={`text-sm leading-none font-semibold tabular-nums mt-1 ${severityTextClass(tone)}`}>{formatDiff(comparison.difference)}</p>
        </div>
      </div>

      <p className="text-xs text-neutral-700 mb-2 break-words leading-relaxed">{comparison.summary}</p>
      {comparison.reasons.length > 0 ? (
        <ul className="text-xs text-neutral-600 space-y-1.5">
          {comparison.reasons.map((reason) => (
            <li key={reason} className="break-words leading-relaxed flex gap-1.5"><span className="flex-shrink-0 text-neutral-400">•</span>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-500">No dominant category differences in this period.</p>
      )}
    </div>
  );
}
