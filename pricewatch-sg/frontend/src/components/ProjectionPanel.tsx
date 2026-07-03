/**
 * ProjectionPanel – projects next-year spending if the current personal
 * inflation rate continues, with a per-category breakdown.
 */
import type { InflationResult } from '../types';
import { useState } from 'react';
import {
  severityBgBorderClass,
  severityTextClass,
  type Severity,
} from '../lib/inflationSemantics';

interface Props {
  result: InflationResult;
  benchmarkLabel?: string;
  tableId?: string;
}

function formatSgdShort(amount: number): string {
  if (!Number.isFinite(amount)) return 'S$0';
  if (amount >= 1_000_000) {
    return `S${new Intl.NumberFormat('en-SG', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount)}`;
  }
  return `S$${new Intl.NumberFormat('en-SG', {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatSgdFull(amount: number): string {
  if (!Number.isFinite(amount)) return 'S$0';
  return `S$${new Intl.NumberFormat('en-SG', {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatSignedSgdShort(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatSgdShort(Math.abs(amount))}`;
}

function annualCostSeverity(extraCost: number | null): Severity {
  if (extraCost === null) return 'neutral';
  if (extraCost > 1200) return 'bad';
  if (extraCost > 0) return 'caution';
  if (extraCost < 0) return 'good';
  return 'neutral';
}

function monthlyDeltaSeverity(delta: number): Severity {
  if (delta > 40) return 'bad';
  if (delta > 0) return 'caution';
  return 'good';
}

export default function ProjectionPanel({ result, benchmarkLabel, tableId }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const {
    personal_inflation_rate,
    total_monthly_spending,
    projected_annual_spending,
    category_breakdown,
    period,
  } = result;

  if (personal_inflation_rate === null) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Projection</p>
        <p className="text-xs text-neutral-500 mt-2">Insufficient data to compute a projection.</p>
      </div>
    );
  }

  const currentAnnual = total_monthly_spending * 12;
  const inflationMultiplier = 1 + personal_inflation_rate / 100;
  const extraCost = projected_annual_spending
    ? projected_annual_spending - currentAnnual
    : null;
  const extraCostTone = annualCostSeverity(extraCost);
  const extraCostLabel =
    extraCost === null
      ? 'Cost change'
      : extraCost > 0
        ? 'Extra cost'
        : extraCost < 0
          ? 'Estimated savings'
          : 'No change';

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Projection</p>
      <p className="text-xl font-semibold text-neutral-900 tracking-tight mb-3">
        12-month outlook <span className="text-neutral-400 font-normal text-sm">· {period}</span>
      </p>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-[#f7f7f8] border border-neutral-200 rounded-xl p-3 text-center min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-500 mb-0.5">Current annual</p>
          <p className="text-sm sm:text-base font-semibold text-neutral-800 tabular-nums truncate" title={formatSgdFull(currentAnnual)}>
            {formatSgdShort(currentAnnual)}
          </p>
        </div>
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-500 mb-0.5">Projected annual</p>
          <p className="text-sm sm:text-base font-semibold text-neutral-800 tabular-nums truncate" title={projected_annual_spending !== null ? formatSgdFull(projected_annual_spending) : 'N/A'}>
            {projected_annual_spending !== null ? formatSgdShort(projected_annual_spending) : '—'}
          </p>
        </div>
        <div
          className={`rounded-xl p-3 text-center border min-w-0 ${severityBgBorderClass(extraCostTone)}`}
        >
          <p className={`text-[10px] font-mono uppercase tracking-[0.08em] mb-0.5 ${severityTextClass(extraCostTone)}`}>
            {extraCostLabel}
          </p>
          <p className={`text-sm sm:text-base font-semibold tabular-nums truncate ${severityTextClass(extraCostTone)}`} title={extraCost !== null ? formatSgdFull(Math.abs(extraCost)) : 'N/A'}>
            {extraCost !== null ? formatSgdShort(Math.abs(extraCost)) : '—'}
          </p>
        </div>
      </div>

      {/* Per-category projections */}
      <h3 className="text-[10px] font-mono uppercase tracking-[0.1em] text-neutral-600 mb-2">Category projections</h3>
      <div className="max-h-[200px] overflow-y-auto space-y-1.5">
        {category_breakdown
          .filter((b) => b.inflation_rate !== null)
          .map((b, i) => {
            const projectedMonthly = b.spending * (1 + (b.inflation_rate ?? 0) / 100);
            const delta = projectedMonthly - b.spending;
            const isExpanded = expandedCategory === b.category;
            const deltaTone = monthlyDeltaSeverity(delta);

            return (
              <div
                key={b.category}
                className="flex items-start justify-between text-xs rounded-lg bg-[#f7f7f8] border border-neutral-200 px-2.5 py-1.5 animate-slide-up"
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedCategory((prev) => (prev === b.category ? null : b.category))}
                  className={`text-neutral-700 flex-1 min-w-0 mr-2 text-left ${isExpanded ? 'whitespace-normal break-normal' : 'truncate'}`}
                  title={isExpanded ? 'Click to collapse' : `Click to expand: ${b.category}`}
                >
                  {b.category}
                </button>
                <span
                  className="text-neutral-400 tabular-nums mr-2 flex-shrink-0 max-w-[50%] truncate"
                  title={`${formatSgdFull(b.spending)} to ${formatSgdFull(projectedMonthly)} per month`}
                >
                  {formatSgdShort(b.spending)} {'->'} {formatSgdShort(projectedMonthly)}/mo
                </span>
                <span
                  className={`tabular-nums font-medium flex-shrink-0 max-w-[30%] truncate text-right ${severityTextClass(deltaTone)}`}
                  title={formatSignedSgdShort(delta)}
                >
                  {formatSignedSgdShort(delta)}
                </span>
              </div>
            );
          })}
      </div>

      <p className="mt-4 text-xs text-neutral-500 italic">
        * Projection assumes the {period} year-over-year inflation rate continues for 12 months.
        Inflation rates are sourced from SingStat {tableId ?? 'M214011'} (CPI percent change,
        {` ${benchmarkLabel ?? 'Middle 60% households'}`}).
      </p>
    </div>
  );
}
