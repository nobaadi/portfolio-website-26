/**
 * TrustMethodCard - data freshness, source and plain-language methodology.
 */
import type { BenchmarkOption, IngestionStatus } from '../types';
import { formatPeriodLabel } from '../lib/periodLabel';

interface Props {
  status: IngestionStatus | null;
  benchmark: BenchmarkOption | null;
  latestPeriod: string | null;
}

function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TrustMethodCard({ status, benchmark, latestPeriod }: Props) {
  const tableId = benchmark?.table_id ?? status?.table_id ?? 'M214011';
  const benchmarkLabel = benchmark?.label ?? status?.benchmark_label ?? 'Middle 60% households';
  const sourceUrl = `https://tablebuilder.singstat.gov.sg/table/TS/${tableId}`;

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Transparency</p>
      <p className="text-sm font-display font-semibold tracking-[0.01em] text-neutral-900 mb-3">Data trust &amp; method</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <div className="bg-[#f7f7f8] border border-neutral-200 rounded-xl p-2.5">
          <p className="text-[10px] text-neutral-500 mb-0.5">Data freshness</p>
          <p className="text-xs text-neutral-800 font-medium">
            {status?.ingested_at ? formatDateTime(status.ingested_at) : 'Not yet available'}
          </p>
          {latestPeriod && <p className="text-[10px] text-neutral-500 mt-0.5">Latest: {formatPeriodLabel(latestPeriod)}</p>}
        </div>

        <div className="bg-[#f7f7f8] border border-neutral-200 rounded-xl p-2.5">
          <p className="text-[10px] text-neutral-500 mb-0.5">Source</p>
          <p className="text-xs text-neutral-800 font-medium">SingStat {tableId}</p>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-neutral-700 underline mt-0.5 inline-block"
          >
            Open official table
          </a>
        </div>

        <div className="bg-[#f7f7f8] border border-neutral-200 rounded-xl p-2.5">
          <p className="text-[10px] text-neutral-500 mb-0.5">Benchmark group</p>
          <p className="text-xs text-neutral-800 font-medium">{benchmarkLabel}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">Per Cent · half-yearly</p>
        </div>
      </div>

      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3">
        <p className="text-[10px] text-neutral-700 font-medium mb-1 uppercase tracking-wide">How personal inflation is calculated</p>
        <p className="text-xs text-neutral-700 break-normal">
          Your personal inflation is a weighted average of category inflation rates, where each weight
          is your spending share for that category.
        </p>
        <p className="text-[10px] text-neutral-600 mt-1.5 font-mono break-normal">
          personal_inflation = SUM((category_spending / total_spending) &times; category_rate)
        </p>
      </div>
    </div>
  );
}
