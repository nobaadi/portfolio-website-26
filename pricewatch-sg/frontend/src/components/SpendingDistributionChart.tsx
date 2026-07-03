import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
} from 'recharts';
import type { CategoryBreakdown } from '../types';

interface Props {
  breakdown: CategoryBreakdown[];
}

const COLORS = [
  '#4f46e5',
  '#0284c7',
  '#16a34a',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#8b5cf6',
  '#f97316',
  '#6b7280',
];

interface Slice {
  category: string;
  spending: number;
  share: number;
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

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as Slice;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
      <p className="font-semibold text-neutral-800">{row.category}</p>
      <p className="text-neutral-600">Spend: {formatSgdShort(row.spending)}/mo</p>
      <p className="text-neutral-600">Share: {row.share.toFixed(1)}%</p>
    </div>
  );
}

export default function SpendingDistributionChart({ breakdown }: Props) {
  const rows = breakdown
    .filter((row) => Number.isFinite(row.spending) && row.spending > 0)
    .map((row) => ({
      category: row.category,
      spending: row.spending,
      share: row.weight * 100,
    }))
    .sort((a, b) => b.spending - a.spending);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[220px] flex flex-col justify-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Distribution</p>
        <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800 mb-2">Spending weights</p>
        <p className="text-xs text-neutral-500">Enter spending values to visualize category share.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[220px] flex flex-col">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Distribution</p>
      <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800 mb-3">Spending weights</p>
      <p className="text-[10px] text-neutral-500 mb-2">Budget share only (does not include category inflation rates).</p>

      <div className="h-[165px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="share"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={46}
              outerRadius={78}
              paddingAngle={2}
              stroke="none"
            >
              {rows.map((row, index) => (
                <Cell key={row.category} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
        {rows.slice(0, 6).map((row, index) => (
          <div key={row.category} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="truncate text-neutral-700" title={row.category}>{row.category}</span>
            </div>
            <span className="text-neutral-600 tabular-nums">{row.share.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
