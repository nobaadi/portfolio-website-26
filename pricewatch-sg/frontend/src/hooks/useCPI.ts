/**
 * useCPI – fetches CPI categories and the latest inflation snapshot
 * from the backend on mount.
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  BenchmarkOption,
  BenchmarkResponse,
  CPICategory,
  IngestionStatus,
  LatestCPI,
} from '../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json();
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `API ${path} returned ${res.status}`);
  }
  return res.json();
}

interface UseCPIResult {
  categories: CPICategory[];
  latest: LatestCPI | null;
  status: IngestionStatus | null;
  benchmark: BenchmarkOption | null;
  benchmarkOptions: BenchmarkOption[];
  loading: boolean;
  switchingBenchmark: boolean;
  error: string | null;
  switchBenchmark: (benchmarkKey: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useCPI(): UseCPIResult {
  const [categories, setCategories] = useState<CPICategory[]>([]);
  const [latest, setLatest] = useState<LatestCPI | null>(null);
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkOption | null>(null);
  const [benchmarkOptions, setBenchmarkOptions] = useState<BenchmarkOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingBenchmark, setSwitchingBenchmark] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    const [catData, latestData, statusData, benchmarkData] = await Promise.all([
      get<{ categories: CPICategory[] }>('/api/cpi/categories'),
      get<LatestCPI>('/api/cpi/latest'),
      get<IngestionStatus>('/api/cpi/status'),
      get<BenchmarkResponse>('/api/cpi/benchmarks'),
    ]);

    return {
      categories: catData.categories,
      latest: latestData,
      status: statusData,
      benchmark: benchmarkData.current,
      benchmarkOptions: benchmarkData.options,
    };
  }, []);

  const applyData = useCallback((data: {
    categories: CPICategory[];
    latest: LatestCPI;
    status: IngestionStatus;
    benchmark: BenchmarkOption;
    benchmarkOptions: BenchmarkOption[];
  }) => {
    setCategories(data.categories);
    setLatest(data.latest);
    setStatus(data.status);
    setBenchmark(data.benchmark);
    setBenchmarkOptions(data.benchmarkOptions);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const data = await fetchAllData();
    applyData(data);
  }, [applyData, fetchAllData]);

  const switchBenchmark = useCallback(
    async (benchmarkKey: string) => {
      setError(null);
      setSwitchingBenchmark(true);

      const previousBenchmark = benchmark;
      const optimisticBenchmark =
        benchmarkOptions.find((option) => option.key === benchmarkKey) ?? null;
      if (optimisticBenchmark) {
        // Optimistic UI: reflect selected benchmark instantly while ingestion runs.
        setBenchmark(optimisticBenchmark);
      }

      try {
        const response = await post<{
          benchmark?: BenchmarkOption;
          ingestion?: {
            ingested_at?: string | null;
            table_id?: string | null;
            series_fetched?: number;
            records_stored?: number;
            success?: boolean;
            error_message?: string | null;
          };
        }>(`/api/cpi/benchmark/${benchmarkKey}`);

        if (response.ingestion && response.ingestion.success === false) {
          throw new Error(response.ingestion.error_message ?? 'Benchmark switch failed');
        }

        if (response.benchmark) {
          setBenchmark(response.benchmark);
        }

        if (response.ingestion) {
          setStatus((prev) => ({
            ...(prev ?? {}),
            ingested_at: response.ingestion?.ingested_at ?? prev?.ingested_at,
            table_id: response.ingestion?.table_id ?? response.benchmark?.table_id ?? prev?.table_id,
            benchmark_key: response.benchmark?.key ?? prev?.benchmark_key,
            benchmark_label: response.benchmark?.label ?? prev?.benchmark_label,
            series_fetched: response.ingestion?.series_fetched ?? prev?.series_fetched,
            records_stored: response.ingestion?.records_stored ?? prev?.records_stored,
            success: response.ingestion?.success ?? prev?.success,
            error_message: response.ingestion?.error_message ?? prev?.error_message,
          }));
        }

        // Only refresh datasets that visibly change after benchmark switch.
        const [catData, latestData] = await Promise.all([
          get<{ categories: CPICategory[] }>('/api/cpi/categories'),
          get<LatestCPI>('/api/cpi/latest'),
        ]);
        setCategories(catData.categories);
        setLatest(latestData);

        return true;
      } catch (err) {
        // Roll back optimistic benchmark on failure.
        setBenchmark(previousBenchmark);
        setError(err instanceof Error ? err.message : 'Failed to switch benchmark');
        return false;
      } finally {
        setSwitchingBenchmark(false);
      }
    },
    [benchmark, benchmarkOptions]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAllData();
        if (cancelled) return;
        applyData(data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load CPI data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [applyData, fetchAllData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (switchingBenchmark) return;
      refresh().catch(() => {
        // Keep polling resilient to transient network hiccups.
      });
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [refresh, switchingBenchmark]);

  return {
    categories,
    latest,
    status,
    benchmark,
    benchmarkOptions,
    loading,
    switchingBenchmark,
    error,
    switchBenchmark,
    refresh,
  };
}
