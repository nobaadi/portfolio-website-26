import type { CacheConfig, SweepResponse } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Label,
} from 'recharts';
import './SweepPanel.css';

interface Props {
  data: SweepResponse;
  sweepLevel: string;
  config: CacheConfig;
  onClose: () => void;
}

export default function SweepPanel({ data, sweepLevel, config, onClose }: Props) {
  const chartData = data.points.map((p) => ({
    ...p,
    label: p.size_kb >= 1024 ? `${p.size_kb / 1024}MB` : `${p.size_kb}KB`,
  }));

  const cliffIdx = data.points.reduce((bestIdx, _, i) => {
    if (i === 0) return bestIdx;
    const drop = data.points[i - 1].l1_hit_rate - data.points[i].l1_hit_rate;
    const bestDrop = bestIdx > 0
      ? data.points[bestIdx - 1].l1_hit_rate - data.points[bestIdx].l1_hit_rate
      : -Infinity;
    return drop > bestDrop ? i : bestIdx;
  }, 0);
  const cliffSizeKb = cliffIdx > 0 ? data.points[cliffIdx].size_kb : null;
  const maxDrop = cliffIdx > 0
    ? data.points[cliffIdx - 1].l1_hit_rate - data.points[cliffIdx].l1_hit_rate
    : 0;
  const showCliff = maxDrop > 5;

  // Determine which cache boundary (or working-set edge) the cliff is nearest to
  const cliffLabel = (() => {
    if (!cliffSizeKb) return '';
    const sizeStr = cliffSizeKb >= 1024 ? `${cliffSizeKb / 1024}MB` : `${cliffSizeKb}KB`;
    const candidates = [
      { name: 'L1', kb: config.L1.size_kb },
      { name: 'L2', kb: config.L2.size_kb },
      { name: 'L3', kb: config.L3.size_kb },
      { name: 'working set', kb: data.working_set_kb },
    ];
    const nearest = candidates.reduce((best, c) => {
      const da = Math.abs(Math.log2(c.kb + 1) - Math.log2(cliffSizeKb + 1));
      const db = Math.abs(Math.log2(best.kb + 1) - Math.log2(cliffSizeKb + 1));
      return da < db ? c : best;
    });
    const ratio = Math.max(cliffSizeKb, nearest.kb) / Math.min(cliffSizeKb, nearest.kb);
    const context = ratio <= 4 ? ` — ${nearest.name} boundary` : '';
    return `Cliff at ${sizeStr}${context}`;
  })();

  // Label goes left of line when cliff is in the right half of the data set
  const cliffLabelPos = cliffIdx > data.points.length / 2 ? 'insideTopLeft' : 'insideTopRight';

  return (
    <div className="card sweep-panel">
      <div className="sweep-header">
        <div>
          <h3>
            {sweepLevel} Size <span className="serif">Sweep</span>
          </h3>
          <p className="sweep-sub">
            Hit rate vs {sweepLevel} cache size — {data.workload.replace('_', ' ')} · {data.working_set_kb}KB working set
          </p>
        </div>
        <button className="btn-close" onClick={onClose} type="button">✕ Close</button>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} unit="%" />
          <Tooltip
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 12 }}
            formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="l1_hit_rate" name="L1 Hit %" stroke="#059669" dot={{ r: 3 }} strokeWidth={2} />
          <Line type="monotone" dataKey="l2_hit_rate" name="L2 Hit %" stroke="#d97706" dot={{ r: 3 }} strokeWidth={2} />
          <Line type="monotone" dataKey="l3_hit_rate" name="L3 Hit %" stroke="#e11d48" dot={{ r: 3 }} strokeWidth={2} />
          {showCliff && cliffSizeKb && (
            <ReferenceLine
              x={cliffSizeKb >= 1024 ? `${cliffSizeKb / 1024}MB` : `${cliffSizeKb}KB`}
              stroke="#f85149" strokeDasharray="4 3" strokeWidth={1.5}
            >
              <Label value={cliffLabel} position={cliffLabelPos} fontSize={10} fill="#f85149" />
            </ReferenceLine>
          )}
        </LineChart>
      </ResponsiveContainer>

      <div className="sweep-cycles-chart">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
            <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 12 }}
              formatter={(v: unknown) => [`${Number(v).toFixed(2)} cycles`]}
            />
            <Line type="monotone" dataKey="avg_access_time" name="Avg Cycles" stroke="#4f46e5" dot={{ r: 3 }} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
