import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { simulate, sweep, getWorkloads, getPresets, simulateFromTrace } from '../api';
import type { CacheConfig, SimulateResponse, SweepResponse } from '../types';
import { DEFAULT_CACHE_CONFIG } from '../types';
import CacheConfigPanel from '../components/CacheConfigPanel';
import ResultsDashboard from '../components/ResultsDashboard';
import InsightPanel from '../components/InsightPanel';
import ConceptExplainer from '../components/ConceptExplainer';
import SweepPanel from '../components/SweepPanel';
import './SimulatorPage.css';

function getErrorMessage(error: Error): string {
  if (error.message === 'Network Error' || error.message.includes('ERR_CONNECTION_REFUSED')) {
    return 'Backend offline. Start FastAPI on port 8001.';
  }
  return error.message;
}

export default function SimulatorPage() {
  const [config, setConfig] = useState<CacheConfig>(DEFAULT_CACHE_CONFIG);
  const [workload, setWorkload] = useState('matrix_multiplication');
  const [name, setName] = useState('');
  const [traceFile, setTraceFile] = useState<File | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [workingSetKb, setWorkingSetKb] = useState(256);
  const [writeFraction, setWriteFraction] = useState(0.3);
  const [sweepLevel, setSweepLevel] = useState<'L1' | 'L2' | 'L3'>('L1');
  const [sweepResult, setSweepResult] = useState<SweepResponse | null>(null);

  const { data: workloads = [] } = useQuery({ queryKey: ['workloads'], queryFn: getWorkloads });
  const { data: presets = [] } = useQuery({ queryKey: ['presets'], queryFn: getPresets });

  const mutation = useMutation({
    mutationFn: () => simulate({
      cache_config: config,
      workload,
      name: name || undefined,
      working_set_kb: workingSetKb,
      write_fraction: writeFraction,
    }),
    onSuccess: (data) => setResult(data),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!traceFile) throw new Error('Choose a trace file first.');
      return simulateFromTrace({ file: traceFile, l1SizeKb: config.L1.size_kb, l2SizeKb: config.L2.size_kb, l3SizeKb: config.L3.size_kb });
    },
    onSuccess: (data) => setResult(data),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !mutation.isPending) {
        mutation.mutate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mutation]);

  const sweepMutation = useMutation({
    mutationFn: () => sweep({
      cache_config: config,
      workload,
      working_set_kb: workingSetKb,
      write_fraction: writeFraction,
      sweep_level: sweepLevel,
      sizes: sweepLevel === 'L1' ? [4, 8, 16, 32, 64, 128, 256] :
             sweepLevel === 'L2' ? [64, 128, 256, 512, 1024, 2048, 4096] :
             [512, 1024, 2048, 4096, 8192, 16384, 32768],
    }),
    onSuccess: setSweepResult,
  });

  return (
    <div className="simulator-page">

      {/* LEFT PANEL — config + workload */}
      <div className="sim-left">

        <CacheConfigPanel config={config} onChange={setConfig} presets={presets} />

        <div className="card workload-panel">
          <h2 className="section-label">Workload</h2>
          <div className="workload-list">
            {workloads.map((w) => (
              <button
                key={w.id}
                className={`workload-btn ${workload === w.id ? 'active' : ''}`}
                onClick={() => setWorkload(w.id)}
                type="button"
              >
                <span className="wl-name">{w.name}</span>
                <span className="wl-desc">{w.description}</span>
              </button>
            ))}
          </div>

          <div className="ws-row">
            <label className="field">
              <span>Working Set</span>
              <div className="slider-row">
                <input type="range" min={16} max={2048} step={16}
                  value={workingSetKb} onChange={(e) => setWorkingSetKb(Number(e.target.value))} />
                <span className="slider-val">{workingSetKb >= 1024 ? `${(workingSetKb / 1024).toFixed(1)} MB` : `${workingSetKb} KB`}</span>
              </div>
              <span className="field-hint">Controls how much data the workload accesses</span>
            </label>
            <label className="field">
              <span>Write Fraction</span>
              <div className="slider-row">
                <input type="range" min={0} max={100} step={5}
                  value={Math.round(writeFraction * 100)}
                  onChange={(e) => setWriteFraction(Number(e.target.value) / 100)} />
                <span className="slider-val">{Math.round(writeFraction * 100)}%</span>
              </div>
              <span className="field-hint">Share of accesses that are writes (0% = read-only, 100% = write-only)</span>
            </label>
          </div>

          {workload === 'thrash_lru' && (
            <div className="workload-hint">
              💡 <strong>LRU Thrash tip:</strong> set Working Set just above your L1 or L2 size to expose the LRU worst-case. LRU will hit 0 %, Random will not.
            </div>
          )}

          <div className="run-row">
            <input
              className="name-input"
              placeholder="Name this experiment…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="btn-run"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              type="button"
            >
              {mutation.isPending
                ? <><span className="spinner" /> Running…</>
                : <><span className="run-arrow">▶</span> Run Simulation<span className="run-shortcut">⌘↵</span></>}
            </button>
          </div>

          {mutation.isError && (
            <p className="error-msg">⚠ {getErrorMessage(mutation.error as Error)}</p>
          )}

          <div className="sweep-controls">
            <div className="sweep-level-row">
              <span className="section-label" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Sweep level size</span>
              <div className="policy-group" style={{ marginTop: 4 }}>
                {(['L1', 'L2', 'L3'] as const).map((l) => (
                  <button key={l} className={`policy-btn ${sweepLevel === l ? 'active' : ''}`}
                    onClick={() => setSweepLevel(l)} type="button">{l}</button>
                ))}
              </div>
            </div>
            <button className="btn-sweep" onClick={() => sweepMutation.mutate()}
              disabled={sweepMutation.isPending} type="button">
              {sweepMutation.isPending ? <><span className="spinner" /> Sweeping…</> : '◈ Sweep'}
            </button>
          </div>

          <div className="trace-toggle-row">
            <button className="btn-secondary trace-toggle" onClick={() => setShowTrace(s => !s)} type="button">
              {showTrace ? '▲ Hide trace' : '▼ Custom trace'}
            </button>
          </div>

          {showTrace && (
            <div className="trace-section">
              <p className="upload-help">Hex/decimal addresses, one per line. Max 500k.</p>
              <input className="trace-input" type="file" accept=".txt,.trace,.csv"
                onChange={(e) => setTraceFile(e.target.files?.[0] ?? null)} />
              {traceFile && <p className="trace-selected"><strong>{traceFile.name}</strong></p>}
              <button className="btn-run" onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending || !traceFile} type="button">
                {uploadMutation.isPending ? <><span className="spinner" /> Running…</> : '⬆ Run Trace'}
              </button>
              {uploadMutation.isError && (
                <p className="error-msg">⚠ {getErrorMessage(uploadMutation.error as Error)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — results */}
      <div className="sim-right">
        <div className="latency-pipeline">
          {[
            { level: 'L1', cycles: 4, color: '#059669' },
            { level: 'L2', cycles: 12, color: '#d97706' },
            { level: 'L3', cycles: 40, color: '#e11d48' },
            { level: 'RAM', cycles: 200, color: '#8b8680' },
          ].map((tier, i) => (
            <div key={tier.level} className="pipeline-tier">
              {i > 0 && <span className="pipeline-arrow">→</span>}
              <div className="pipeline-box" style={{ borderColor: tier.color }}>
                <span className="pipeline-level" style={{ color: tier.color }}>{tier.level}</span>
                <span className="pipeline-cycles">{tier.cycles}c</span>
              </div>
            </div>
          ))}
          <span className="pipeline-label">access latency per level</span>
        </div>
        {result ? (
          <div className="card results-outer" key={result.id}>
            <div className="results-top animate-appear">
              <h2>Simulation <span className="serif">Results</span></h2>
              <span className="experiment-id">#{result.id}</span>
            </div>
            <ResultsDashboard result={result} />
            <InsightPanel result={result} workload={workload} />
          </div>
        ) : (
          <>
            <div className="empty-state card">
              <div className="empty-icon">⚡</div>
              <h3>Hit <span className="serif">Run</span></h3>
              <p>Configure the cache hierarchy, pick a workload, and fire.</p>
            </div>
            <ConceptExplainer />
          </>
        )}

        {sweepResult && (
          <SweepPanel
            data={sweepResult}
            sweepLevel={sweepLevel}
            config={config}
            onClose={() => setSweepResult(null)}
          />
        )}
      </div>

    </div>
  );
}
