import { useCallback, useEffect, useState } from 'react';
import type { MonthlyLogListResponse, MonthlySpendingLog } from '../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const SESSION_STORAGE_KEY = 'pit-session-id';

interface SaveMonthlyLogPayload {
  period: string; // YYYY-MM
  spending: Record<string, number>;
}

interface UseMonthlyLogsResult {
  sessionId: string | null;
  history: MonthlySpendingLog[];
  loadingHistory: boolean;
  saving: boolean;
  historyError: string | null;
  saveMonthlyLog: (payload: SaveMonthlyLogPayload) => Promise<boolean>;
  refreshHistory: () => Promise<void>;
}

function readStoredSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  return raw && raw.trim() ? raw : null;
}

function writeStoredSessionId(sessionId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

function parsePeriod(period: string): { year: number; month: number } {
  const [yearRaw, monthRaw] = period.split('-');
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error('Please choose a valid month.');
  }
  return { year, month };
}

export function useMonthlyLogs(): UseMonthlyLogsResult {
  const [sessionId, setSessionId] = useState<string | null>(() => readStoredSessionId());
  const [history, setHistory] = useState<MonthlySpendingLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!sessionId) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await fetch(`${API}/api/user/monthly-logs/${sessionId}?limit=24`);
      if (!res.ok) {
        throw new Error(`Unable to load history (${res.status}).`);
      }
      const body: MonthlyLogListResponse = await res.json();
      setHistory(body.logs ?? []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Unable to load history.');
    } finally {
      setLoadingHistory(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const saveMonthlyLog = useCallback(
    async ({ period, spending }: SaveMonthlyLogPayload): Promise<boolean> => {
      if (Object.keys(spending).length === 0) {
        setHistoryError('Enter at least one spending value before saving.');
        return false;
      }

      setSaving(true);
      setHistoryError(null);
      try {
        const { year, month } = parsePeriod(period);
        const res = await fetch(`${API}/api/user/monthly-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            year,
            month,
            spending,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.detail ?? `Unable to save monthly log (${res.status}).`);
        }

        const body = await res.json();
        const resolvedSessionId: string = body.session_id;
        if (resolvedSessionId && resolvedSessionId !== sessionId) {
          setSessionId(resolvedSessionId);
          writeStoredSessionId(resolvedSessionId);
        }

        // If session just got created in this call, fetch history directly for that id.
        const targetSession = resolvedSessionId || sessionId;
        if (targetSession) {
          const historyRes = await fetch(`${API}/api/user/monthly-logs/${targetSession}?limit=24`);
          if (historyRes.ok) {
            const historyBody: MonthlyLogListResponse = await historyRes.json();
            setHistory(historyBody.logs ?? []);
          }
        }

        return true;
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : 'Unable to save monthly log.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [sessionId]
  );

  return {
    sessionId,
    history,
    loadingHistory,
    saving,
    historyError,
    saveMonthlyLog,
    refreshHistory,
  };
}
