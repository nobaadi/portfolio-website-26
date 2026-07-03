import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getExperiments, deleteExperiment, exportCsvUrl, getExperiment } from '../api';

function hitClass(rate: number) {
  if (rate >= 85) return 'hit-cell green';
  if (rate >= 60) return 'hit-cell orange';
  return 'hit-cell red';
}
import type { SimulateResponse } from '../types';
import ResultsDashboard from '../components/ResultsDashboard';
import './HistoryPage.css';

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: experiments = [], isLoading } = useQuery({
    queryKey: ['experiments'],
    queryFn: getExperiments,
  });

  const { data: detail, isFetching: detailLoading } = useQuery({
    queryKey: ['experiment', selectedId],
    queryFn: () => getExperiment(selectedId!),
    enabled: selectedId !== null,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExperiment,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] });
      if (selectedId === id) setSelectedId(null);
    },
  });

  // Cast ExperimentDetail to SimulateResponse shape for ResultsDashboard
  const detailAsResult: SimulateResponse | null = detail
    ? {
        id: detail.id,
        l1_hit_rate: detail.l1_hit_rate,
        l2_hit_rate: detail.l2_hit_rate,
        l3_hit_rate: detail.l3_hit_rate,
        overall_miss_rate: detail.overall_miss_rate,
        avg_access_time: detail.avg_access_time,
        memory_traffic: detail.memory_traffic,
        total_accesses: detail.total_accesses,
        l1_utilization: detail.l1_utilization,
        l2_utilization: detail.l2_utilization,
        l3_utilization: detail.l3_utilization,
        l1_cycles: detail.l1_cycles,
        l2_cycles: detail.l2_cycles,
        l3_cycles: detail.l3_cycles,
        ram_cycles: detail.ram_cycles,
        counterfactual: detail.counterfactual,
        timeline: detail.timeline,
      }
    : null;

  return (
    <div className="history-page">
      <div className="history-header">
        <h2>Experiment <span className="serif">History</span></h2>
        <a href={exportCsvUrl} className="btn-export" download>
          ⬇ Export CSV
        </a>
      </div>

      {isLoading ? (
        <div className="card table-wrapper skeleton-table">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton" style={{ width: 32, height: 14, animationDelay: `${i * 0.07}s` }} />
              <div className="skeleton" style={{ width: 90, height: 14, animationDelay: `${i * 0.07 + 0.03}s` }} />
              <div className="skeleton" style={{ width: 120, height: 14, animationDelay: `${i * 0.07 + 0.06}s` }} />
              <div className="skeleton" style={{ flex: 1, height: 14, animationDelay: `${i * 0.07 + 0.09}s` }} />
              <div className="skeleton" style={{ width: 60, height: 14, animationDelay: `${i * 0.07 + 0.12}s` }} />
            </div>
          ))}
        </div>
      ) : experiments.length === 0 ? (
        <div className="empty card">
          <p>No experiments yet. Run your first simulation!</p>
        </div>
      ) : (
        <div className="table-wrapper card">
          <p className="table-hint">Click any row to expand its full results dashboard.</p>
          <table className="exp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Workload</th>
                <th>Cache Sizes</th>
                <th>L1 Hit</th>
                <th>L2 Hit</th>
                <th>L3 Hit</th>
                <th>Miss Rate</th>
                <th>Avg Cycles</th>
                <th>Accesses</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((exp) => (
                <tr
                  key={exp.id}
                  className={`exp-row ${selectedId === exp.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(selectedId === exp.id ? null : exp.id)}
                >
                  <td className="id-cell">{exp.id}</td>
                  <td>{exp.name || <span className="muted">—</span>}</td>
                  <td><span className="workload-tag">{exp.workload.replace(/_/g, ' ')}</span></td>
                  <td className="cache-sizes-cell mono">
                    {exp.l1_size_kb != null ? (
                      <span className="sizes-badges">
                        <span className="size-badge l1">{exp.l1_size_kb}K</span>
                        <span className="size-badge l2">{exp.l2_size_kb != null ? (exp.l2_size_kb >= 1024 ? `${exp.l2_size_kb / 1024}M` : `${exp.l2_size_kb}K`) : '—'}</span>
                        <span className="size-badge l3">{exp.l3_size_kb != null ? (exp.l3_size_kb >= 1024 ? `${exp.l3_size_kb / 1024}M` : `${exp.l3_size_kb}K`) : '—'}</span>
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className={hitClass(exp.l1_hit_rate)}>{exp.l1_hit_rate.toFixed(1)}%</td>
                  <td className={hitClass(exp.l2_hit_rate)}>{exp.l2_hit_rate.toFixed(1)}%</td>
                  <td className={hitClass(exp.l3_hit_rate)}>{exp.l3_hit_rate.toFixed(1)}%</td>
                  <td className="miss-cell">{exp.overall_miss_rate.toFixed(2)}%</td>
                  <td className="mono">{exp.avg_access_time.toFixed(1)}</td>
                  <td className="mono">{exp.total_accesses.toLocaleString()}</td>
                  <td className="date-cell">
                    {new Date(exp.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <button
                      className="btn-delete"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(exp.id); }}
                      disabled={deleteMutation.isPending}
                      title="Delete"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId !== null && (
        <div className="card history-detail">
          <div className="history-detail-header">
            <h3>Experiment #{selectedId} — Full Results</h3>
            <button className="btn-close" onClick={() => setSelectedId(null)}>✕ Close</button>
          </div>
          {detailLoading && <p className="loading-text">Loading results…</p>}
          {detailAsResult && (
            <ResultsDashboard result={detailAsResult} />
          )}
        </div>
      )}
    </div>
  );
}
