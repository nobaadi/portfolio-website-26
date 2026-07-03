import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { InflationTrendPoint } from '../types';

interface Props {
  trend: InflationTrendPoint[];
  loading?: boolean;
  error?: string | null;
}

interface TooltipPayload {
  payload: InflationTrendPoint;
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs shadow-[0_10px_24px_rgba(0,0,0,0.08)]">
      <p className="font-semibold text-neutral-800">{row.period}</p>
      <p className="text-emerald-700">Your inflation: {row.personal_inflation.toFixed(2)}%</p>
      <p className="text-[#64748b]">National CPI: {row.national_cpi.toFixed(2)}%</p>
    </div>
  );
}

export default function InflationTrendChart({ trend, loading = false, error = null }: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[260px] animate-pulse">
        <div className="h-3 w-36 rounded bg-neutral-200 mb-3" />
        <div className="h-8 w-56 rounded bg-neutral-200 mb-4" />
        <div className="h-[180px] rounded bg-neutral-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-[20px] border border-red-200 p-4 min-h-[260px] flex flex-col justify-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-red-400 mb-1">Trend</p>
        <p className="text-sm font-sans font-semibold tracking-normal text-red-700 mb-2">Unable to load inflation trend</p>
        <p className="text-xs text-red-600">{error}</p>
      </div>
    );
  }

  if (!trend.length) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[260px] flex flex-col justify-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Trend</p>
        <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800 mb-2">Your inflation over time</p>
        <p className="text-xs text-neutral-500">Calculate your inflation to render a personal trend line against national CPI.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4 min-h-[260px] flex flex-col">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1">Trend</p>
      <p className="text-sm font-sans font-semibold tracking-normal text-neutral-800 mb-3">Your inflation over time</p>

      <div className="h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ left: 6, right: 10, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#737373' }} />
            <YAxis tick={{ fontSize: 11, fill: '#737373' }} tickFormatter={(v) => `${(v as number).toFixed(1)}%`} />
            <Tooltip content={<TrendTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="personal_inflation"
              name="Your inflation"
              stroke="#16a34a"
              strokeWidth={2.4}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="national_cpi"
              name="National CPI"
              stroke="#64748b"
              strokeWidth={2.1}
              dot={{ r: 2.2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-neutral-500 mt-2">
        Historical curve uses your current spending weights applied across stored CPI periods.
      </p>
    </div>
  );
}
