import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { simulate, getWorkloads, getPresets } from '../api';
import type { CacheConfig, SimulateResponse } from '../types';
import { DEFAULT_CACHE_CONFIG } from '../types';
import CacheConfigPanel from '../components/CacheConfigPanel';
import ResultsDashboard from '../components/ResultsDashboard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import './ComparePage.css';

const COMPARE_A_COLOR = '#334155';
const COMPARE_B_COLOR = '#b45309';

function buildCompareData(a: SimulateResponse, b: SimulateResponse, labelA: string, labelB: string) {
  return [
    { metric: 'L1 Hit %', [labelA]: a.l1_hit_rate, [labelB]: b.l1_hit_rate },
    { metric: 'L2 Hit %', [labelA]: a.l2_hit_rate, [labelB]: b.l2_hit_rate },
    { metric: 'L3 Hit %', [labelA]: a.l3_hit_rate, [labelB]: b.l3_hit_rate },
    { metric: 'Miss %',   [labelA]: a.overall_miss_rate, [labelB]: b.overall_miss_rate },
    { metric: 'Avg Cycles', [labelA]: a.avg_access_time, [labelB]: b.avg_access_time },
  ];
}

/** Delta analysis table — shows the numerical difference for every key metric */
function DeltaSection({ a, b }: { a: SimulateResponse; b: SimulateResponse }) {
  type Row = { label: string; aVal: number; bVal: number; unit: string; higherIsBetter: boolean };
  const rows: Row[] = [
    { label: 'L1 Hit Rate', aVal: a.l1_hit_rate, bVal: b.l1_hit_rate, unit: '%', higherIsBetter: true },
    { label: 'L2 Hit Rate', aVal: a.l2_hit_rate, bVal: b.l2_hit_rate, unit: '%', higherIsBetter: true },
    { label: 'L3 Hit Rate', aVal: a.l3_hit_rate, bVal: b.l3_hit_rate, unit: '%', higherIsBetter: true },
    { label: 'RAM Miss Rate', aVal: a.overall_miss_rate, bVal: b.overall_miss_rate, unit: '%', higherIsBetter: false },
    { label: 'Avg Access Time', aVal: a.avg_access_time, bVal: b.avg_access_time, unit: ' cycles', higherIsBetter: false },
    { label: 'Memory Traffic', aVal: a.memory_traffic, bVal: b.memory_traffic, unit: ' B', higherIsBetter: false },
  ];

  return (
    <div className="card delta-section">
      <h3 className="delta-title">Δ Delta Analysis <span className="delta-sub">Config B vs Config A</span></h3>
      <div className="delta-table">
        {rows.map((row) => {
          const delta = row.bVal - row.aVal;
          const pct = row.aVal !== 0 ? (Math.abs(delta) / Math.abs(row.aVal)) * 100 : 0;
          const bWins = row.higherIsBetter ? delta > 0 : delta < 0;
          const aWins = row.higherIsBetter ? delta < 0 : delta > 0;
          const tied = Math.abs(delta) < 0.01;
          const winnerColor = tied ? 'var(--text-muted)' : bWins ? COMPARE_B_COLOR : COMPARE_A_COLOR;
          const arrow = tied ? '=' : bWins ? '▲' : '▼';
          const sign = delta > 0 ? '+' : '';
          return (
            <div key={row.label} className="delta-row">
              <span className="delta-label">{row.label}</span>
              <span className="delta-a">A: {row.aVal.toFixed(2)}{row.unit}</span>
              <span className="delta-arrow" style={{ color: winnerColor }}>{arrow}</span>
              <span className="delta-b">B: {row.bVal.toFixed(2)}{row.unit}</span>
              <span className="delta-diff" style={{ color: winnerColor }}>
                {sign}{delta.toFixed(2)}{row.unit}
                {!tied && <span className="delta-pct"> ({pct.toFixed(1)}%)</span>}
              </span>
              <span className="delta-winner" style={{ color: winnerColor }}>
                {tied ? 'Tie' : bWins ? 'B wins' : 'A wins'}
              </span>
            </div>
          );
        })}
      </div>
      {/* Headline verdict */}
      {(() => {
        const cycleDelta = b.avg_access_time - a.avg_access_time;
        if (Math.abs(cycleDelta) < 0.05) return null;
        const faster = cycleDelta < 0 ? 'Config B' : 'Config A';
        const fasterColor = cycleDelta < 0 ? COMPARE_B_COLOR : COMPARE_A_COLOR;
        const pctFaster = Math.abs(cycleDelta / (cycleDelta < 0 ? a.avg_access_time : b.avg_access_time)) * 100;
        return (
          <div className="delta-verdict" style={{ borderColor: fasterColor }}>
            <span style={{ color: fasterColor, fontWeight: 800 }}>{faster}</span>
            {' '}is{' '}
            <span style={{ color: fasterColor, fontWeight: 700 }}>{pctFaster.toFixed(1)}% faster</span>
            {' '}({Math.abs(cycleDelta).toFixed(2)} fewer avg cycles per access)
          </div>
        );
      })()}
    </div>
  );
}

function ConfigSlot({
  label,
  color,
  config,
  setConfig,
  workload,
  setWorkload,
  workloads,
  presets,
  result,
  onRun,
  pending,
}: {
  label: string;
  color: string;
  config: CacheConfig;
  setConfig: (c: CacheConfig) => void;
  workload: string;
  setWorkload: (w: string) => void;
  workloads: { id: string; name: string; description: string }[];
  presets: { name: string; description: string; config: CacheConfig }[];
  result: SimulateResponse | null;
  onRun: () => void;
  pending: boolean;
}) {
  return (
    <div className="slot">
      <div className="slot-header" style={{ borderBottom: `2px solid ${color}` }}>
        <span className="slot-label" style={{ color }}>{label}</span>
      </div>
      <CacheConfigPanel config={config} onChange={setConfig} presets={presets} />
      <div className="slot-workload card">
        <label className="field" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          Workload
          <select
            value={workload}
            onChange={(e) => setWorkload(e.target.value)}
            style={{ marginTop: 6 }}
          >
            {workloads.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <button className="btn-run-slot" style={{ background: color }} onClick={onRun} disabled={pending} type="button">
          {pending ? <><span className="spinner" /> Running…</> : '▶ Run'}
        </button>
      </div>
      {result && (
        <div className="card slot-result">
          <ResultsDashboard result={result} label={label} />
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [configA, setConfigA] = useState<CacheConfig>(DEFAULT_CACHE_CONFIG);
  const [configB, setConfigB] = useState<CacheConfig>({
    ...DEFAULT_CACHE_CONFIG,
    L1: { ...DEFAULT_CACHE_CONFIG.L1, size_kb: 64 },
  });
  const [workloadA, setWorkloadA] = useState('matrix_multiplication');
  const [workloadB, setWorkloadB] = useState('matrix_multiplication');
  const [resultA, setResultA] = useState<SimulateResponse | null>(null);
  const [resultB, setResultB] = useState<SimulateResponse | null>(null);
  const [workingSetKb, setWorkingSetKb] = useState(256);
  const [writeFraction, setWriteFraction] = useState(0.3);

  const { data: workloads = [] } = useQuery({ queryKey: ['workloads'], queryFn: getWorkloads });
  const { data: presets = [] } = useQuery({ queryKey: ['presets'], queryFn: getPresets });

  const mutA = useMutation({
    mutationFn: () => simulate({ cache_config: configA, workload: workloadA, name: 'Config A', working_set_kb: workingSetKb, write_fraction: writeFraction }),
    onSuccess: setResultA,
  });

  const mutB = useMutation({
    mutationFn: () => simulate({ cache_config: configB, workload: workloadB, name: 'Config B', working_set_kb: workingSetKb, write_fraction: writeFraction }),
    onSuccess: setResultB,
  });

  const compareData =
    resultA && resultB ? buildCompareData(resultA, resultB, 'Config A', 'Config B') : null;

  return (
    <div className="compare-page">
      <div className="compare-header">
        <div className="compare-header-top">
          <div>
            <h2>Side-by-side <span className="serif">Comparison</span></h2>
            <p className="compare-sub">Configure two cache setups side-by-side and compare their performance.</p>
          </div>
          <div className="compare-controls">
            <label className="ws-label">
              <span>Working Set</span>
              <div className="slider-row">
                <input type="range" min={16} max={2048} step={16}
                  value={workingSetKb} onChange={(e) => setWorkingSetKb(Number(e.target.value))} />
                <span className="slider-val">{workingSetKb >= 1024 ? `${(workingSetKb / 1024).toFixed(1)} MB` : `${workingSetKb} KB`}</span>
              </div>
            </label>
            <label className="ws-label">
              <span>Write Fraction</span>
              <div className="slider-row">
                <input type="range" min={0} max={100} step={5}
                  value={Math.round(writeFraction * 100)}
                  onChange={(e) => setWriteFraction(Number(e.target.value) / 100)} />
                <span className="slider-val">{Math.round(writeFraction * 100)}%</span>
              </div>
            </label>
            <button
              className="btn-run-both"
              onClick={() => { mutA.mutate(); mutB.mutate(); }}
              disabled={mutA.isPending || mutB.isPending}
              type="button"
            >
              {mutA.isPending || mutB.isPending
                ? <><span className="spinner" /> Running…</>
                : '▶▶ Run Both'}
            </button>
          </div>
        </div>
        {workloadA !== workloadB && (
          <div className="compare-workload-warning">
            ⚠ Config A is running <strong>{workloadA.replace(/_/g, ' ')}</strong> and Config B is running <strong>{workloadB.replace(/_/g, ' ')}</strong>. Delta metrics are only meaningful when both configs use the same workload.
          </div>
        )}
      </div>

      <div className="compare-scroll">
      <div className="slots">
        <ConfigSlot
          label="Config A"
          color={COMPARE_A_COLOR}
          config={configA}
          setConfig={setConfigA}
          workload={workloadA}
          setWorkload={setWorkloadA}
          workloads={workloads}
          presets={presets}
          result={resultA}
          onRun={() => mutA.mutate()}
          pending={mutA.isPending}
        />
        <ConfigSlot
          label="Config B"
          color={COMPARE_B_COLOR}
          config={configB}
          setConfig={setConfigB}
          workload={workloadB}
          setWorkload={setWorkloadB}
          workloads={workloads}
          presets={presets}
          result={resultB}
          onRun={() => mutB.mutate()}
          pending={mutB.isPending}
        />
      </div>

      {resultA && resultB && <DeltaSection a={resultA} b={resultB} />}

      {compareData && (
        <div className="card compare-chart">
          <h3>Side-by-Side Performance Comparison</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={compareData} margin={{ top: 5, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="metric" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Config A" fill={COMPARE_A_COLOR} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Config B" fill={COMPARE_B_COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      </div>
    </div>
  );
}
