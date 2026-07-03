import type { InflationDriversResponse } from '../types';
import { diffSeverity, severityBgBorderClass, severityTextClass } from '../lib/inflationSemantics';
import { formatPeriodLabel } from '../lib/periodLabel';

interface Props {
  data: InflationDriversResponse | null;
  loading?: boolean;
}

function signed(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

export default function DriversCard({ data, loading = false }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[230px] animate-pulse">
        <div className="h-3 w-36 rounded bg-neutral-200 mb-3" />
        <div className="h-8 w-44 rounded bg-neutral-200 mb-4" />
        <div className="space-y-2">
          <div className="h-10 rounded bg-neutral-100" />
          <div className="h-10 rounded bg-neutral-100" />
          <div className="h-10 rounded bg-neutral-100" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[230px] flex flex-col justify-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Drivers</p>
        <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800 mb-2">Drivers of your inflation</p>
        <p className="text-xs text-neutral-500 break-normal">Run the calculator to see what categories are moving your inflation away from national CPI.</p>
      </div>
    );
  }

  const topDrivers = data.drivers.slice(0, 3);
  const diffTone = diffSeverity(data.difference);

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[230px] flex flex-col">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Drivers</p>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800">Why is your inflation different?</p>
          <p className="text-[11px] text-neutral-500">Period: {formatPeriodLabel(data.period)}</p>
        </div>
        <div className={`rounded-lg border px-2.5 py-1 text-right ${severityBgBorderClass(diffTone)}`}>
          <p className="text-[10px] text-neutral-500">Gap</p>
          <p className={`text-sm font-semibold tabular-nums ${severityTextClass(diffTone)}`}>
            {signed(data.difference, 2, ' pp')}
          </p>
        </div>
      </div>

      <div className="space-y-2 flex-1">
        {topDrivers.map((driver) => {
          const tone = diffSeverity(driver.contribution);
          return (
            <div key={driver.category} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-sm font-medium text-neutral-800 min-w-0 break-words">{driver.category}</p>
                <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${severityTextClass(tone)}`}>
                  {signed(driver.contribution, 2, ' pp')}
                </p>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed break-words">{driver.explanation}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
