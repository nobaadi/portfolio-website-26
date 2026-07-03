/**
 * InflationCard – hero card comparing personal vs national CPI inflation.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { InflationResult } from '../types';
import {
  diffSeverity,
  inflationSeverity,
  severityBgBorderClass,
  severityTextClass,
} from '../lib/inflationSemantics';
import { formatPeriodLabel } from '../lib/periodLabel';

interface Props {
  result: InflationResult;
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

function centeredRate(rate: number | null) {
  if (rate === null) return <span className="text-neutral-400">N/A</span>;
  const sign = rate >= 0 ? '+' : '-';
  const abs = Math.abs(rate).toFixed(2);
  return (
    <span className="inline-flex items-baseline justify-center">
      <span className="inline-block w-[0.72ch] text-center">{sign}</span>
      <span>{abs}%</span>
    </span>
  );
}

function rateColor(rate: number | null): string {
  return severityTextClass(inflationSeverity(rate));
}

export default function InflationCard({ result }: Props) {
  const [expanded, setExpanded] = useState(false);

  const {
    personal_inflation_rate,
    national_inflation_rate,
    total_monthly_spending,
    period,
    category_breakdown,
  } = result;

  const diff =
    personal_inflation_rate !== null && national_inflation_rate !== null
      ? personal_inflation_rate - national_inflation_rate
      : null;
  const diffTone = diffSeverity(diff);
  const diffLabel =
    diff !== null
      ? diff > 0
        ? 'higher pressure'
        : diff < 0
          ? 'lower pressure'
          : 'similar pressure'
      : 'N/A';
  const displayPeriod = formatPeriodLabel(period);

  const topWeightRows = category_breakdown
    .filter((row) => row.weight > 0 && row.inflation_rate !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const pressureSummary =
    diff !== null
      ? diff < 0
        ? 'Your basket has lower price pressure than national CPI — your largest spending shares are in slower-rising categories.'
        : diff > 0
          ? 'Your basket has higher price pressure than national CPI — your largest spending shares are in faster-rising categories.'
          : 'Your basket pressure is similar to national CPI.'
      : 'Unable to compute pressure comparison.';

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-2.5">
        Inflation Snapshot · {displayPeriod}
      </p>

      <div className="grid grid-cols-3 gap-1.5 items-stretch">
        {/* Personal */}
        <div className="rounded-xl border border-neutral-200 bg-[#f8f8f9] px-3 py-2 text-center flex flex-col justify-between min-h-[84px] animate-slide-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
          <p className="text-[9px] uppercase tracking-[0.08em] font-medium text-neutral-500 leading-none inline-flex items-center justify-center gap-1">
            Your rate
            <span
              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-300 text-[9px] text-neutral-500"
              title="Weighted average of category CPI rates using your spending shares."
            >
              i
            </span>
          </p>
          <p className={`w-full flex justify-center text-[1.85rem] font-semibold tabular-nums leading-none animate-pop-in ${rateColor(personal_inflation_rate)}`}>
            {centeredRate(personal_inflation_rate)}
          </p>
          <p className="text-[9px] text-neutral-400 leading-none">{formatSgdShort(total_monthly_spending)}/mo</p>
        </div>

        {/* National */}
        <div className="rounded-xl border border-[#dfe4f8] bg-[#ecf0ff] px-3 py-2 text-center flex flex-col justify-between min-h-[84px] animate-slide-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm" style={{ animationDelay: '60ms' }}>
          <p className="text-[9px] uppercase tracking-[0.08em] font-medium text-neutral-500 leading-none">National CPI</p>
          <p className={`w-full flex justify-center text-[1.85rem] font-semibold tabular-nums leading-none animate-pop-in ${rateColor(national_inflation_rate)}`} style={{ animationDelay: '60ms' }}>
            {centeredRate(national_inflation_rate)}
          </p>
          <p className="text-[9px] text-neutral-400 leading-none">All Items</p>
        </div>

        {/* Diff */}
        <div className={`rounded-xl px-3 py-2 text-center border flex flex-col justify-between min-h-[84px] animate-slide-up transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${severityBgBorderClass(diffTone)}`} style={{ animationDelay: '120ms' }}>
          <p className="text-[9px] uppercase tracking-[0.08em] font-medium text-neutral-500 leading-none">vs National</p>
          <p className={`w-full flex justify-center text-[1.85rem] font-semibold tabular-nums leading-none animate-pop-in ${severityTextClass(diffTone)}`} style={{ animationDelay: '120ms' }}>
            {centeredRate(diff)}
          </p>
          <p className={`text-[9px] leading-none ${severityTextClass(diffTone)}`}>{diffLabel}</p>
        </div>
      </div>

      {/* Expandable methodology */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2.5 w-full flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:bg-neutral-100 transition-colors duration-150 group"
      >
        <span className="text-[11px] font-medium text-neutral-600 group-hover:text-neutral-800 transition-colors duration-150">
          How to read this
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 space-y-2 text-[11px] text-neutral-600 leading-relaxed animate-slide-up">
          <p>
            <strong>Formula:</strong> Personal inflation = Σ(spending share × category CPI rate).
            Spending scale alone doesn't determine your rate — it's about <em>where</em> you spend.
          </p>
          <p>{pressureSummary}</p>
          {topWeightRows.length > 0 && (
            <p>
              <strong>Largest weights:</strong>{' '}
              {topWeightRows
                .map((row) => `${row.category} (${(row.weight * 100).toFixed(0)}% at ${(row.inflation_rate ?? 0).toFixed(1)}% CPI)`)
                .join(' · ')}
            </p>
          )}
          <p className="text-neutral-500">
            Switching the household benchmark (top-right) changes the CPI reference rates — not your spending amounts.
          </p>
        </div>
      )}
    </div>
  );
}
