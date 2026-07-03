/**
 * BreakdownChart – horizontal bar chart showing each category's
 * contribution to the user's personal inflation rate.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { CategoryBreakdown } from '../types';

interface Props {
  breakdown: CategoryBreakdown[];
  nationalRate: number | null;
}

// Shorter display labels (same map as SpendingInput for consistency)
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

function barColor(contribution: number | null): string {
  if (contribution === null) return '#d1d5db';
  if (contribution > 1.0) return '#ef4444';
  if (contribution > 0.5) return '#f97316';
  if (contribution > 0) return '#eab308';
  return '#22c55e';
}

interface TooltipPayload {
  payload: CategoryBreakdown & { chartValue: number; usingSpendingShare: boolean };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-3 text-sm shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
      <p className="font-semibold text-neutral-800">{d.category}</p>
      <p className="text-neutral-500">Spending: {formatSgdShort(d.spending)}/mo ({(d.weight * 100).toFixed(1)}%)</p>
      <p className="text-neutral-500">
        Category inflation: {d.inflation_rate !== null ? `${d.inflation_rate >= 0 ? '+' : ''}${d.inflation_rate.toFixed(2)}%` : 'N/A'}
      </p>
      {d.usingSpendingShare ? (
        <p className="font-medium text-[#3451ba]">Share proxy: {d.chartValue.toFixed(2)}%</p>
      ) : (
        <p className="font-medium text-[#3451ba]">
          Contribution: {d.contribution !== null ? `${d.contribution >= 0 ? '+' : ''}${d.contribution.toFixed(3)}%` : 'N/A'}
        </p>
      )}
    </div>
  );
}

export default function BreakdownChart({ breakdown, nationalRate }: Props) {
  if (!breakdown.length) return null;

  const data = breakdown
    .filter((b) => Number.isFinite(b.spending) && b.spending > 0)
    .map((b) => ({
      ...b,
      contribution: Number.isFinite(b.contribution) ? (b.contribution as number) : 0,
      name: SHORT_LABELS[b.category] ?? b.category,
    }));

  const hasVisibleContribution = data.some((d) => Math.abs(d.contribution ?? 0) > 0.0001);
  const usingSpendingShare = !hasVisibleContribution;

  const chartData = data.map((d) => ({
    ...d,
    chartValue: usingSpendingShare ? Number((d.weight * 100).toFixed(3)) : (d.contribution ?? 0),
    usingSpendingShare,
  }));

  const hasNegative = chartData.some((row) => row.chartValue < 0);
  const maxAbs = Math.max(...chartData.map((row) => Math.abs(row.chartValue)), 0);
  const paddedMax = Math.max(Number((maxAbs * 1.2).toFixed(3)), usingSpendingShare ? 1 : 0.2);
  const xAxisDomain: [number, number] = usingSpendingShare
    ? [0, paddedMax]
    : hasNegative
      ? [-paddedMax, paddedMax]
      : [0, paddedMax];

  if (!data.length) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[230px] flex flex-col">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1 leading-none">Breakdown</p>
        <p className="text-xs font-semibold tracking-[0.01em] text-neutral-700 mb-3 leading-tight">Contribution by category</p>
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50">
          <p className="text-xs text-neutral-500">No category contribution data yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[230px] flex flex-col">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1 leading-none">Breakdown</p>
      <p className="text-xs font-semibold tracking-[0.01em] text-neutral-700 mb-3 leading-tight">Contribution by category</p>
      <p className="text-[10px] text-neutral-500 mb-2">Weighted inflation contribution (separate from spending share).</p>

      <div className="h-[170px] sm:h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
            <XAxis
              type="number"
              domain={xAxisDomain}
              tickFormatter={(v) => `${(v as number).toFixed(usingSpendingShare ? 1 : 2)}%`}
              tick={{ fontSize: 11, fill: '#737373' }}
            />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#525252' }} width={84} />
            <Tooltip content={<CustomTooltip />} />
            {!usingSpendingShare && nationalRate !== null && (
              <ReferenceLine
                x={nationalRate / Math.max(chartData.length, 1)}
                stroke="#5a72c8"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: 'Nat/cat', position: 'insideTopRight', fontSize: 9, fill: '#5a72c8' }}
              />
            )}
            <Bar dataKey="chartValue" radius={[0, 4, 4, 0]} minPointSize={4}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.category}
                  fill={usingSpendingShare ? '#60a5fa' : barColor(entry.contribution)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      {usingSpendingShare ? (
        <p className="text-[10px] text-neutral-500 mt-2 text-center">
          Contributions are currently very small, so bars show spending share proxy.
        </p>
      ) : (
        <div className="flex gap-3 mt-2 justify-center flex-wrap text-[10px] text-neutral-500">
          {[
            { color: '#ef4444', label: '> 1.0%' },
            { color: '#f97316', label: '0.5–1.0%' },
            { color: '#eab308', label: '0–0.5%' },
            { color: '#22c55e', label: 'Lower pressure' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
