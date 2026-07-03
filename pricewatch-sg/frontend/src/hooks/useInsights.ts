import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  HouseholdComparisonResponse,
  InflationDriversResponse,
  InflationTrendPoint,
} from '../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface UseInsightsOptions {
  spending: Record<string, number> | null;
  sessionId?: string | null;
  enabled: boolean;
}

interface UseInsightsResult {
  drivers: InflationDriversResponse | null;
  comparison: HouseholdComparisonResponse | null;
  trend: InflationTrendPoint[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function buildQuery(spending: Record<string, number> | null, sessionId?: string | null): string {
  const params = new URLSearchParams();

  if (spending && Object.keys(spending).length > 0) {
    params.set('spending_json', JSON.stringify(spending));
  } else if (sessionId) {
    params.set('session_id', sessionId);
  }

  return params.toString();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `API ${path} returned ${res.status}`);
  }
  return res.json();
}

export function useInsights({ spending, sessionId, enabled }: UseInsightsOptions): UseInsightsResult {
  const [drivers, setDrivers] = useState<InflationDriversResponse | null>(null);
  const [comparison, setComparison] = useState<HouseholdComparisonResponse | null>(null);
  const [trend, setTrend] = useState<InflationTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => buildQuery(spending, sessionId), [spending, sessionId]);

  const refresh = useCallback(async () => {
    if (!enabled || !query) {
      setDrivers(null);
      setComparison(null);
      setTrend([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [driversRes, comparisonRes, trendRes] = await Promise.all([
        get<InflationDriversResponse>(`/api/analysis/inflation-drivers?${query}`),
        get<HouseholdComparisonResponse>(`/api/analysis/household-comparison?${query}`),
        get<InflationTrendPoint[]>(`/api/analysis/inflation-trend?limit=16&${query}`),
      ]);

      setDrivers(driversRes);
      setComparison(comparisonRes);
      setTrend(Array.isArray(trendRes) ? trendRes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load analysis insights.');
      setDrivers(null);
      setComparison(null);
      setTrend([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    drivers,
    comparison,
    trend,
    loading,
    error,
    refresh,
  };
}
