import type { SimulateResponse } from '../types';
import { useCountUp } from '../hooks/useCountUp';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import './ResultsDashboard.css';

interface Props {
  result: SimulateResponse;
  label?: string;
}

const COLORS = {
  L1:  '#059669',   /* emerald */
  L2:  '#d97706',   /* amber */
  L3:  '#e11d48',   /* rose */
  avg: '#4f46e5',   /* indigo */
};


function StatCard({ label, numericValue, suffix, sub, color }: {
  label: string;
  numericValue: number;
  suffix?: string;
  sub?: string;
  color: string;
}) {
  const animated = useCountUp(numericValue);
  const display = Number.isInteger(numericValue)
    ? Math.round(animated).toLocaleString()
    : animated.toFixed(numericValue < 1 ? 2 : 1);
  return (
    <div className="stat-card" style={{ borderTop: `2px solid ${color}` }}>
      <div className="stat-value" style={{ color }}>{display}{suffix}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}


export default function ResultsDashboard({ result, label }: Props) {
  const utilizationData = [
    { label: 'L1', value: result.l1_utilization, color: COLORS.L1 },
    { label: 'L2', value: result.l2_utilization, color: COLORS.L2 },
    { label: 'L3', value: result.l3_utilization, color: COLORS.L3 },
  ];

  return (
    <div className="results-dashboard">
      {label && <h3 className="results-label">{label}</h3>}

      {result.insight && (
        <div className="insight-card">
          <span className="insight-icon">◎</span>
          <span className="insight-text">{result.insight}</span>
        </div>
      )}

      {result.counterfactual && (
        <div className="counterfactual-card">
          <div className="cf-icon">⚡</div>
          <div className="cf-body">
            <span className="cf-title">Bottleneck: {result.counterfactual.bottleneck_level}</span>
            <span className="cf-suggestion">{result.counterfactual.suggestion} would reduce avg cycles from <strong>{result.counterfactual.original_avg_cycles}</strong> → <strong>{result.counterfactual.improved_avg_cycles}</strong></span>
          </div>
          <div className="cf-badge">−{result.counterfactual.improvement_pct}%</div>
        </div>
      )}

      {/* KPI row */}
      <div className="stats-row">
        <StatCard label="L1 Hit Rate" numericValue={result.l1_hit_rate} suffix="%" color={COLORS.L1} />
        <StatCard label="L2 Hit Rate" numericValue={result.l2_hit_rate} suffix="%" color={COLORS.L2} />
        <StatCard label="L3 Hit Rate" numericValue={result.l3_hit_rate} suffix="%" color={COLORS.L3} />
        <StatCard
          label="Avg Access Time"
          numericValue={result.avg_access_time}
          sub="cycles"
          color={COLORS.avg}
        />
        <StatCard
          label="RAM Miss Rate"
          numericValue={result.overall_miss_rate}
          suffix="%"
          sub="reached main memory"
          color="#f85149"
        />
        <StatCard
          label="Memory Traffic"
          numericValue={result.memory_traffic >= 1024
            ? result.memory_traffic / 1024
            : result.memory_traffic}
          suffix={result.memory_traffic >= 1024 ? ' KB' : ' B'}
          sub={`${result.total_accesses.toLocaleString()} accesses`}
          color="#bc8cff"
        />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        {/* Latency breakdown */}
        <div className="chart-card">
          <h4>Cycle Cost Breakdown</h4>
          {(() => {
            const total = result.l1_cycles + result.l2_cycles + result.l3_cycles + result.ram_cycles;
            if (total === 0) return <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>No data</p>;
            const bars = [
              { label: 'L1 hits', cycles: result.l1_cycles, color: '#059669' },
              { label: 'L2 hits', cycles: result.l2_cycles, color: '#d97706' },
              { label: 'L3 hits', cycles: result.l3_cycles, color: '#e11d48' },
              { label: 'RAM misses', cycles: result.ram_cycles, color: '#8b8680' },
            ];
            return (
              <div className="latency-bars">
                <div className="latency-track">
                  {bars.map((b) => (
                    <div key={b.label} className="latency-seg"
                      style={{ width: `${(b.cycles / total) * 100}%`, background: b.color }}
                      title={`${b.label}: ${((b.cycles / total) * 100).toFixed(1)}%`}
                    />
                  ))}
                </div>
                <div className="latency-legend">
                  {bars.map((b) => (
                    <div key={b.label} className="latency-leg-item">
                      <span className="latency-dot" style={{ background: b.color }} />
                      <span className="latency-leg-label">{b.label}</span>
                      <span className="latency-leg-pct">{((b.cycles / total) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Cache utilization — simple inline bars */}
        <div className="chart-card">
          <h4>Cache Utilization</h4>
          <div className="util-list">
            {utilizationData.map((u) => (
              <div key={u.label} className="util-row">
                <span className="util-label">{u.label}</span>
                <div className="util-track">
                  <div className="util-fill" style={{ width: `${u.value}%`, background: u.color }} />
                </div>
                <span className="util-pct" style={{ color: u.color }}>{u.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Hit-rate timeline */}
      {result.timeline && result.timeline.length > 1 && (
        <div className="chart-card timeline-chart">
          <h4>Hit Rate Over Time</h4>
          <p className="chart-sub">How cache warm-up progresses across the trace</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={result.timeline} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="index"
                stroke="var(--text-muted)"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <YAxis domain={[0, 100]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} unit="%" />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 11 }}
                formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`]}
                labelFormatter={(label) => `Access #${Number(label).toLocaleString()}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="l1_hit_rate" name="L1 Hit %" stroke={COLORS.L1} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="l2_hit_rate" name="L2 Hit %" stroke={COLORS.L2} dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="l3_hit_rate" name="L3 Hit %" stroke={COLORS.L3} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
