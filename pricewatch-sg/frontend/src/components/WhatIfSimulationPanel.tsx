import { useEffect, useMemo, useState } from 'react';
import type { CategoryBreakdown } from '../types';
import { diffSeverity, severityBgBorderClass, severityTextClass } from '../lib/inflationSemantics';
import { primaryActionButtonClass, secondaryActionButtonClass } from '../lib/actionButtonStyles';

interface Props {
  breakdown: CategoryBreakdown[];
  basePersonalRate: number | null;
  onApplyScenario?: (nextSpending: Record<string, number>) => void;
}

const SHORT_LABELS: Record<string, string> = {
  'Food': 'Food',
  'Clothing & Footwear': 'Clothing',
  'Housing & Utilities': 'Housing',
  'Household Durables & Services': 'Household',
  'Health': 'Health',
  'Transport': 'Transport',
  'Information & Communication': 'Comms',
  'Recreation, Sport & Culture': 'Recreation',
  'Education': 'Education',
  'Miscellaneous Goods & Services': 'Misc.',
};

function formatSigned(value: number | null | undefined, suffix = '%'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}${suffix}`;
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

function formatSignedSgd(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatSgdShort(Math.abs(amount))}`;
}

export default function WhatIfSimulationPanel({
  breakdown,
  basePersonalRate,
  onApplyScenario,
}: Props) {
  const validRows = useMemo(
    () => breakdown.filter((row) => row.spending > 0 && row.inflation_rate !== null),
    [breakdown]
  );

  const adjustableRows = useMemo(
    () => [...validRows].sort((a, b) => b.spending - a.spending).slice(0, 8),
    [validRows]
  );

  const baseSpending = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of validRows) {
      map[row.category] = row.spending;
    }
    return map;
  }, [validRows]);

  const [deltas, setDeltas] = useState<Record<string, number>>({});

  useEffect(() => {
    setDeltas({});
  }, [adjustableRows.map((row) => `${row.category}:${row.spending}`).join('|')]);

  const simulatedSpending = useMemo(() => {
    const next: Record<string, number> = { ...baseSpending };
    for (const row of adjustableRows) {
      const delta = deltas[row.category] ?? 0;
      next[row.category] = Math.max(row.spending * (1 + delta), 0);
    }
    return next;
  }, [adjustableRows, baseSpending, deltas]);

  const simulation = useMemo(() => {
    const total = Object.values(simulatedSpending).reduce((sum, amount) => sum + amount, 0);
    if (total <= 0 || validRows.length === 0) {
      return { newPersonalRate: null, change: null };
    }
    const ranked = validRows.map((row) => {
      const nextSpend = simulatedSpending[row.category] ?? 0;
      const nextWeight = nextSpend / total;
      return nextWeight * (row.inflation_rate ?? 0);
    });
    const newRate = ranked.reduce((sum, v) => sum + v, 0);
    return {
      newPersonalRate: Number.isFinite(newRate) ? Number(newRate.toFixed(2)) : null,
      change:
        basePersonalRate !== null && Number.isFinite(newRate)
          ? Number((newRate - basePersonalRate).toFixed(2))
          : null,
    };
  }, [basePersonalRate, simulatedSpending, validRows]);

  const annualCostDelta = useMemo(() => {
    const baseTotal = Object.values(baseSpending).reduce((s, v) => s + v, 0);
    const simTotal = Object.values(simulatedSpending).reduce((s, v) => s + v, 0);
    if (basePersonalRate === null || simulation.newPersonalRate === null) return null;
    const baseAnnualExtra = baseTotal * 12 * (basePersonalRate / 100);
    const simAnnualExtra = simTotal * 12 * (simulation.newPersonalRate / 100);
    return simAnnualExtra - baseAnnualExtra;
  }, [baseSpending, simulatedSpending, basePersonalRate, simulation.newPersonalRate]);

  const changedCount = Object.values(deltas).filter((d) => Math.abs(d) > 0.001).length;
  const tone = diffSeverity(simulation.change);

  if (validRows.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[250px] flex flex-col justify-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Simulation</p>
        <p className="text-xl font-semibold text-neutral-900 tracking-tight mb-2">What if?</p>
        <p className="text-xs text-neutral-500">Add spending values to simulate lifestyle adjustments.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4 flex flex-col gap-2.5">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 leading-none mb-0.5">Simulation</p>
          <p className="text-base font-semibold text-neutral-900 tracking-tight leading-none">Lifestyle what-if</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setDeltas({})}
            className={`${secondaryActionButtonClass} !h-7 !px-2.5 !text-[11px]`}
          >
            Reset
          </button>
          {onApplyScenario && (
            <button
              type="button"
              onClick={() => onApplyScenario(simulatedSpending)}
              className={`${primaryActionButtonClass} !h-7 !px-2.5 !text-[11px]`}
            >
              Apply
            </button>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-center">
          <p className="text-[9px] text-neutral-500 leading-none mb-0.5">Base</p>
          <p className="text-xs font-semibold text-neutral-800 tabular-nums">{formatSigned(basePersonalRate)}</p>
        </div>
        <div className={`rounded-xl border px-2 py-1.5 text-center ${severityBgBorderClass(tone)}`}>
          <p className="text-[9px] text-neutral-500 leading-none mb-0.5">Scenario</p>
          <p className={`text-xs font-semibold tabular-nums ${severityTextClass(tone)}`}>{formatSigned(simulation.newPersonalRate)}</p>
        </div>
        <div className={`rounded-xl border px-2 py-1.5 text-center ${severityBgBorderClass(tone)}`}>
          <p className="text-[9px] text-neutral-500 leading-none mb-0.5">Change</p>
          <p className={`text-xs font-semibold tabular-nums ${severityTextClass(tone)}`}>{formatSigned(simulation.change)}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-center">
          <p className="text-[9px] text-neutral-500 leading-none mb-0.5">Annual diff</p>
          <p className={`text-xs font-semibold tabular-nums ${annualCostDelta !== null && annualCostDelta > 0 ? 'text-red-500' : annualCostDelta !== null && annualCostDelta < 0 ? 'text-emerald-600' : 'text-neutral-800'}`}>
            {annualCostDelta !== null ? formatSignedSgd(annualCostDelta) : '—'}
          </p>
        </div>
      </div>

      {/* ── 2-column slider grid ── */}
      <div className="grid grid-cols-2 gap-1.5">
        {adjustableRows.map((row) => {
          const value = Math.round((deltas[row.category] ?? 0) * 100);
          const nextAmount = simulatedSpending[row.category] ?? row.spending;
          const changed = Math.abs(value) > 0;
          const label = SHORT_LABELS[row.category] ?? row.category;

          return (
            <div
              key={row.category}
              className={`rounded-xl border px-2.5 py-2 transition-colors duration-200 ${changed ? 'border-indigo-200 bg-indigo-50/40' : 'border-neutral-200 bg-neutral-50'}`}
            >
              <div className="flex items-center justify-between text-[11px] mb-1">
                <p className={`font-medium truncate pr-1 ${changed ? 'text-indigo-800' : 'text-neutral-700'}`} title={row.category}>{label}</p>
                <span className={`tabular-nums font-medium flex-shrink-0 ${changed ? 'text-indigo-600' : 'text-neutral-400'}`}>
                  {value > 0 ? '+' : ''}{value}%
                </span>
              </div>
              <input
                type="range"
                min={-60}
                max={60}
                step={5}
                value={value}
                title={`${formatSgdShort(row.spending)} → ${formatSgdShort(nextAmount)}`}
                onChange={(event) => {
                  const pct = Number(event.target.value) / 100;
                  setDeltas((prev) => ({ ...prev, [row.category]: pct }));
                }}
                className="w-full accent-indigo-600"
              />
              <p className="text-[9px] text-neutral-400 tabular-nums mt-0.5 truncate">
                {formatSgdShort(row.spending)}{changed ? ` → ${formatSgdShort(nextAmount)}` : '/mo'}
              </p>
            </div>
          );
        })}
      </div>

      {changedCount > 0 && (
        <p className="text-[10px] text-neutral-400 text-center">
          {changedCount} categor{changedCount === 1 ? 'y' : 'ies'} adjusted
        </p>
      )}
    </div>
  );
}
