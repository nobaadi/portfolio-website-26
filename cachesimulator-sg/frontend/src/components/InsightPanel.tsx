import type { SimulateResponse } from '../types';
import './InsightPanel.css';

interface Props {
  result: SimulateResponse;
  workload: string;
}

function generateInsights(result: SimulateResponse, workload: string): { text: string; type: 'good' | 'warn' | 'info' }[] {
  const insights: { text: string; type: 'good' | 'warn' | 'info' }[] = [];

  // Overall access time
  if (result.avg_access_time < 8) {
    insights.push({ text: `Near-optimal: avg access time is ${result.avg_access_time.toFixed(1)} cycles — the vast majority of requests are served from L1 at 4 cycles.`, type: 'good' });
  } else if (result.avg_access_time > 80) {
    insights.push({ text: `RAM-bound: avg ${result.avg_access_time.toFixed(1)} cycles per access. This configuration is severely under-cached — most requests are falling all the way to main memory.`, type: 'warn' });
  }

  // L1 hit rate
  if (result.l1_hit_rate > 90) {
    insights.push({ text: `Strong L1 hit rate (${result.l1_hit_rate.toFixed(1)}%) — excellent spatial and temporal locality.`, type: 'good' });
  } else if (result.l1_hit_rate < 50) {
    insights.push({ text: `Low L1 hit rate (${result.l1_hit_rate.toFixed(1)}%). Most accesses miss L1. Try increasing L1 size or associativity to reduce conflict misses.`, type: 'warn' });
  }

  // Workload-specific insights
  if (workload === 'matrix_multiplication') {
    if (result.l1_hit_rate < 70) {
      insights.push({ text: "Matrix B's column-major access strides through memory, defeating cache lines. In real code, loop tiling (cache blocking) fixes this by reusing each L1-loaded block across the inner loop.", type: 'info' });
    }
    if (result.overall_miss_rate > 5) {
      insights.push({ text: `High RAM miss rate (${result.overall_miss_rate.toFixed(1)}%) on matrix multiply. In practice, blocking the loop to fit sub-matrices in L2/L3 reduces this to near-zero.`, type: 'warn' });
    }
  } else if (workload === 'random_access') {
    insights.push({ text: "Random access is the pathological worst-case for any cache — low hit rates are expected. This benchmark measures raw miss-penalty tolerance, not cache effectiveness.", type: 'info' });
  } else if (workload === 'sorting') {
    if (result.l1_hit_rate > 80) {
      insights.push({ text: "Merge sort's sequential access pattern exploits spatial locality well — each cache line loaded covers multiple array elements.", type: 'good' });
    } else {
      insights.push({ text: "Merge sort's repeated re-reads during merge phases are missing the cache. A larger block size would load more elements per cache-line fetch.", type: 'info' });
    }
  } else if (workload === 'graph_traversal') {
    insights.push({ text: "BFS pointer-chasing has inherently poor spatial locality — each node dereference is an unpredictable jump. Hardware prefetchers struggle here. Graph compression or adjacency-sorted layouts help in practice.", type: 'info' });
  }

  // Utilization insight
  if (result.l1_utilization > 0 && result.l1_utilization < 40) {
    insights.push({ text: `L1 is only ${result.l1_utilization.toFixed(0)}% utilized. You could halve L1 size with no meaningful hit-rate impact, saving chip area and power.`, type: 'info' });
  }

  // Memory traffic
  if (result.memory_traffic > 512 * 1024) {
    insights.push({ text: `High memory bus traffic: ${(result.memory_traffic / 1024).toFixed(0)} KB fetched from RAM. In a real system this would stress DRAM bandwidth and increase power draw.`, type: 'warn' });
  }

  return insights;
}

export default function InsightPanel({ result, workload }: Props) {
  const insights = generateInsights(result, workload);
  if (insights.length === 0) return null;

  return (
    <div className="insight-panel">
      <h4 className="insight-title">💡 What This Means</h4>
      <ul className="insight-list">
        {insights.map((insight, i) => (
          <li key={i} className={`insight-item insight-${insight.type}`}>
            <span className="insight-icon">
              {insight.type === 'good' ? '✅' : insight.type === 'warn' ? '⚠️' : 'ℹ️'}
            </span>
            <span>{insight.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
