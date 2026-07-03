export interface CacheLevelConfig {
  size_kb: number;
  block_size: number;
  associativity: number;
  policy: 'LRU' | 'FIFO' | 'Random';
  write_policy: 'write-back' | 'write-through';
}

export interface CacheConfig {
  L1: CacheLevelConfig;
  L2: CacheLevelConfig;
  L3: CacheLevelConfig;
}

export interface SimulateRequest {
  cache_config: CacheConfig;
  workload: string;
  custom_trace?: number[];
  name?: string;
  working_set_kb: number;
  write_fraction: number;
}

export interface TimelinePoint {
  index: number;
  l1_hit_rate: number;
  l2_hit_rate: number;
  l3_hit_rate: number;
  avg_access_time: number;
}

export interface CounterfactualResult {
  bottleneck_level: string;
  level_doubled: string;
  suggestion: string;
  original_avg_cycles: number;
  improved_avg_cycles: number;
  improvement_pct: number;
}

export interface SimulateResponse {
  id: number;
  l1_hit_rate: number;
  l2_hit_rate: number;
  l3_hit_rate: number;
  overall_miss_rate: number;
  avg_access_time: number;
  memory_traffic: number;
  total_accesses: number;
  l1_utilization: number;
  l2_utilization: number;
  l3_utilization: number;
  l1_cycles: number;
  l2_cycles: number;
  l3_cycles: number;
  ram_cycles: number;
  timeline: TimelinePoint[];
  counterfactual?: CounterfactualResult | null;
  insight?: string | null;
}

export interface SweepPoint {
  size_kb: number;
  l1_hit_rate: number;
  l2_hit_rate: number;
  l3_hit_rate: number;
  avg_access_time: number;
}

export interface SweepRequest {
  cache_config: CacheConfig;
  workload: string;
  working_set_kb: number;
  write_fraction: number;
  sweep_level: 'L1' | 'L2' | 'L3';
  sizes: number[];
}

export interface SweepResponse {
  sweep_level: string;
  workload: string;
  working_set_kb: number;
  points: SweepPoint[];
}

export interface ExperimentSummary {
  id: number;
  name: string | null;
  workload: string;
  l1_hit_rate: number;
  l2_hit_rate: number;
  l3_hit_rate: number;
  overall_miss_rate: number;
  avg_access_time: number;
  total_accesses: number;
  created_at: string;
  l1_size_kb?: number | null;
  l2_size_kb?: number | null;
  l3_size_kb?: number | null;
}

export interface ExperimentDetail {
  id: number;
  name: string | null;
  workload: string;
  cache_config: CacheConfig;
  l1_hit_rate: number;
  l2_hit_rate: number;
  l3_hit_rate: number;
  overall_miss_rate: number;
  avg_access_time: number;
  memory_traffic: number;
  total_accesses: number;
  l1_utilization: number;
  l2_utilization: number;
  l3_utilization: number;
  l1_cycles: number;
  l2_cycles: number;
  l3_cycles: number;
  ram_cycles: number;
  timeline: TimelinePoint[];
  counterfactual?: CounterfactualResult | null;
  created_at: string;
}

export interface WorkloadInfo {
  id: string;
  name: string;
  description: string;
}

export interface ArchitecturePreset {
  name: string;
  description: string;
  config: CacheConfig;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  L1: { size_kb: 32, block_size: 64, associativity: 4, policy: 'LRU', write_policy: 'write-back' },
  L2: { size_kb: 256, block_size: 64, associativity: 8, policy: 'LRU', write_policy: 'write-back' },
  L3: { size_kb: 8192, block_size: 64, associativity: 16, policy: 'LRU', write_policy: 'write-back' },
};
