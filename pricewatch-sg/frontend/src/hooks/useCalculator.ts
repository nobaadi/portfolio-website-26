/**
 * useCalculator – manages the spending form state and calls the
 * /api/calculate/personal-inflation endpoint.
 */
import { useState, useCallback } from 'react';
import type { InflationResult, SpendingFormValues } from '../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface UseCalculatorResult {
  spending: SpendingFormValues;
  setSpending: React.Dispatch<React.SetStateAction<SpendingFormValues>>;
  result: InflationResult | null;
  calculating: boolean;
  calcError: string | null;
  calculate: () => Promise<void>;
  clearResult: () => void;
  reset: () => void;
}

export function useCalculator(defaultCategories: string[]): UseCalculatorResult {
  // Initialise form with empty strings; Singapore median default hints shown
  // as placeholder text in the UI, not pre-filled values.
  const [spending, setSpending] = useState<SpendingFormValues>(() =>
    Object.fromEntries(defaultCategories.map((c) => [c, '']))
  );
  const [result, setResult] = useState<InflationResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const calculate = useCallback(async () => {
    setCalcError(null);
    setCalculating(true);
    try {
      // Parse and filter to positive numbers only
      const parsed: Record<string, number> = {};
      for (const [key, val] of Object.entries(spending)) {
        const n = parseFloat(val);
        if (!isNaN(n) && n > 0) parsed[key] = n;
      }
      if (Object.keys(parsed).length === 0) {
        setCalcError('Please enter at least one spending amount.');
        return;
      }

      const res = await fetch(`${API}/api/calculate/personal-inflation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spending: parsed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      const data: InflationResult = await res.json();
      setResult(data);
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  }, [spending]);

  const reset = useCallback(() => {
    setSpending(Object.fromEntries(defaultCategories.map((c) => [c, ''])));
    setResult(null);
    setCalcError(null);
  }, [defaultCategories]);

  const clearResult = useCallback(() => {
    setResult(null);
    setCalcError(null);
  }, []);

  return {
    spending,
    setSpending,
    result,
    calculating,
    calcError,
    calculate,
    clearResult,
    reset,
  };
}
