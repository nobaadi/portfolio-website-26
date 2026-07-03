import { useState } from 'react';
import type { CacheConfig, CacheLevelConfig, ArchitecturePreset } from '../types';
import './CacheConfigPanel.css';

interface Props {
  config: CacheConfig;
  onChange: (config: CacheConfig) => void;
  presets: ArchitecturePreset[];
}

const POLICIES = ['LRU', 'FIFO', 'Random'] as const;
const BLOCK_SIZES = [16, 32, 64, 128, 256, 512];
const ASSOC_OPTIONS = [
  { value: 1, label: '1-way (Direct)' },
  { value: 2, label: '2-way' },
  { value: 4, label: '4-way' },
  { value: 8, label: '8-way' },
  { value: 16, label: '16-way' },
  { value: 0, label: 'Fully Assoc.' },
];

function LevelPanel({
  label,
  color,
  cfg,
  onChange,
  maxSizeKb,
}: {
  label: string;
  color: string;
  cfg: CacheLevelConfig;
  onChange: (c: CacheLevelConfig) => void;
  maxSizeKb: number;
}) {
  return (
    <div className="level-panel">
      <div className="level-header" style={{ borderLeft: `3px solid ${color}` }}>
        <span className="level-badge" style={{ background: color + '22', color }}>
          {label}
        </span>
        <span className="level-stats">
          {cfg.size_kb >= 1024 ? `${cfg.size_kb / 1024} MB` : `${cfg.size_kb} KB`}
          &nbsp;·&nbsp;{cfg.policy}
        </span>
      </div>
      <div className="level-fields">
        <label className="field field-size">
          <span>Cache Size</span>
          <div className="slider-row">
            <input
              type="range"
              min={1}
              max={maxSizeKb}
              step={maxSizeKb >= 1024 ? 256 : 8}
              value={cfg.size_kb}
              onChange={(e) => onChange({ ...cfg, size_kb: Number(e.target.value) })}
            />
            <span className="slider-val">
              {cfg.size_kb >= 1024 ? `${cfg.size_kb / 1024} MB` : `${cfg.size_kb} KB`}
            </span>
          </div>
        </label>

        <label className="field">
          <span>Block Size</span>
          <select
            value={cfg.block_size}
            onChange={(e) => onChange({ ...cfg, block_size: Number(e.target.value) })}
          >
            {BLOCK_SIZES.map((b) => (
              <option key={b} value={b}>{b} B</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Associativity</span>
          <select
            value={cfg.associativity}
            onChange={(e) => onChange({ ...cfg, associativity: Number(e.target.value) })}
          >
            {ASSOC_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Replacement Policy</span>
          <div className="policy-group">
            {POLICIES.map((p) => (
              <button
                key={p}
                className={`policy-btn ${cfg.policy === p ? 'active' : ''}`}
                onClick={() => onChange({ ...cfg, policy: p })}
                type="button"
              >
                {p}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Write Policy</span>
          <div className="policy-group">
            {(['write-back', 'write-through'] as const).map((wp) => (
              <button
                key={wp}
                className={`policy-btn ${cfg.write_policy === wp ? 'active' : ''}`}
                onClick={() => onChange({ ...cfg, write_policy: wp })}
                type="button"
              >
                {wp === 'write-back' ? 'WB' : 'WT'}
              </button>
            ))}
          </div>
        </label>
      </div>
      {(() => {
        const ways = cfg.associativity === 0 ? (cfg.size_kb * 1024 / cfg.block_size) : cfg.associativity;
        const num_sets = cfg.associativity === 0 ? 1 : (cfg.size_kb * 1024 / cfg.block_size) / cfg.associativity;
        const setsLabel = num_sets >= 1024 ? `${num_sets / 1024}K sets` : `${num_sets} sets`;
        return (
          <div className="cache-geometry">
            {setsLabel} × {ways} ways × {cfg.block_size}B blocks
          </div>
        );
      })()}
    </div>
  );
}

export default function CacheConfigPanel({ config, onChange, presets }: Props) {
  const [showPresets, setShowPresets] = useState(false);

  const warnings: string[] = [];
  if (config.L1.size_kb >= config.L2.size_kb) {
    warnings.push(`L1 (${config.L1.size_kb} KB) ≥ L2 (${config.L2.size_kb} KB) — real CPUs always have L1 < L2.`);
  }
  if (config.L2.size_kb >= config.L3.size_kb) {
    warnings.push(`L2 (${config.L2.size_kb} KB) ≥ L3 (${config.L3.size_kb} KB) — real CPUs always have L2 < L3.`);
  }

  return (
    <div className="config-panel card">
      <div className="panel-header">
        <h2>Cache Configuration</h2>
        <button
          className="btn-secondary"
          onClick={() => setShowPresets((s) => !s)}
          type="button"
        >
          {showPresets ? '▲ Hide Presets' : '▼ Load Preset'}
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="config-warnings">
          {warnings.map((w) => (
            <p key={w} className="config-warning">⚠ {w}</p>
          ))}
        </div>
      )}

      {showPresets && (
        <div className="presets-grid">
          {presets.map((p) => (
            <button
              key={p.name}
              className="preset-card"
              onClick={() => { onChange(p.config); setShowPresets(false); }}
              type="button"
            >
              <span className="preset-name">{p.name}</span>
              <span className="preset-desc">{p.description}</span>
            </button>
          ))}
        </div>
      )}

      <div className="levels">
        <LevelPanel
          label="L1"
          color="var(--accent-green)"
          cfg={config.L1}
          onChange={(c) => onChange({ ...config, L1: c })}
          maxSizeKb={256}
        />
        <LevelPanel
          label="L2"
          color="var(--accent-orange)"
          cfg={config.L2}
          onChange={(c) => onChange({ ...config, L2: c })}
          maxSizeKb={2048}
        />
        <LevelPanel
          label="L3"
          color="var(--accent-red)"
          cfg={config.L3}
          onChange={(c) => onChange({ ...config, L3: c })}
          maxSizeKb={65536}
        />
      </div>
    </div>
  );
}
