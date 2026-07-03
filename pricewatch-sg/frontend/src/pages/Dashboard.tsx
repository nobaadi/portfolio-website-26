/**
 * Dashboard – light editorial layout with horizontal panel cards.
 *
 * ┌───────────────────────────────────────────────────────┐
 * │  Header (soft glass pill)                             │
 * ├───────────────────────────────────────────────────────┤
 * │  Hero + large stat row + quick subtab switcher        │
 * ├───────────────────────────────────────────────────────┤
 * │  ← horizontal scroll panel strip →                   │
 * │  [Category Pulse]  [Your Calculator]  [Insights]      │
 * └───────────────────────────────────────────────────────┘
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BarChart2, Calculator, ShieldCheck, Info, ChevronDown, SlidersHorizontal, Copy, Check, TrendingUp, BookmarkPlus, Calendar } from 'lucide-react';
import type { CategoryBreakdown } from '../types';
import { useCPI } from '../hooks/useCPI';
import { useCalculator } from '../hooks/useCalculator';
import { useInsights } from '../hooks/useInsights';
import SpendingInput from '../components/SpendingInput';
import MonthlyLogsCard from '../components/MonthlyLogsCard';
import InflationCard from '../components/InflationCard';
import BreakdownChart from '../components/BreakdownChart';
import DriversCard from '../components/DriversCard';
import HouseholdComparisonCard from '../components/HouseholdComparisonCard';
import SpendingDistributionChart from '../components/SpendingDistributionChart';
import WhatIfSimulationPanel from '../components/WhatIfSimulationPanel';
import InflationTrendChart from '../components/InflationTrendChart';
import ProjectionPanel from '../components/ProjectionPanel';
import NationalOverview from '../components/NationalOverview';
import ActionRecommendations from '../components/ActionRecommendations';
import TrustMethodCard from '../components/TrustMethodCard';
import { inflationSeverity, severityTextClass } from '../lib/inflationSemantics';
import { useMonthlyLogs } from '../hooks/useMonthlyLogs';
import type { MonthlySpendingLog } from '../types';
import { formatPeriodLabel } from '../lib/periodLabel';

const MEDIAN_SPENDING: Record<string, number> = {
  'Food': 500,
  'Clothing & Footwear': 100,
  'Housing & Utilities': 1200,
  'Household Durables & Services': 150,
  'Health': 150,
  'Transport': 250,
  'Information & Communication': 80,
  'Recreation, Sport & Culture': 200,
  'Education': 200,
  'Miscellaneous Goods & Services': 120,
};

function currentPeriod(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

type PanelKey = 'pulse' | 'calculator' | 'simulation' | 'insights';
const PANEL_ORDER: PanelKey[] = ['calculator', 'simulation', 'pulse', 'insights'];

export default function Dashboard() {
  const {
    categories,
    latest,
    status,
    benchmark,
    benchmarkOptions,
    loading,
    switchingBenchmark,
    error: loadError,
    switchBenchmark,
  } = useCPI();

  const categoryNames = categories.map((c) => c.series_name);
  const { spending, setSpending, result, calculating, calcError, calculate, clearResult, reset } =
    useCalculator(categoryNames);
  const {
    sessionId,
    history: monthlyHistory,
    loadingHistory: loadingMonthlyHistory,
    saving: savingMonthlyLog,
    historyError: monthlyHistoryError,
    saveMonthlyLog,
  } = useMonthlyLogs();
  const [monthlyLogStatus, setMonthlyLogStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logPeriod, setLogPeriod] = useState(currentPeriod);
  const [showMonthlyLogsPanel, setShowMonthlyLogsPanel] = useState(false);
  const [benchmarkMenuOpen, setBenchmarkMenuOpen] = useState(false);
  const [showTrustCard, setShowTrustCard] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKey>('calculator');
  const [interactingPanel, setInteractingPanel] = useState<PanelKey | null>(null);
  const [edgePadding, setEdgePadding] = useState(12);
  const activePanelRef = useRef<PanelKey>('calculator');
  const panelWheelCooldownRef = useRef(0);
  const benchmarkMenuRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const pulseRef = useRef<HTMLDivElement | null>(null);
  const calculatorRef = useRef<HTMLDivElement | null>(null);
  const simulationRef = useRef<HTMLDivElement | null>(null);
  const insightsRef = useRef<HTMLDivElement | null>(null);

  const TICKER_TEXT = 'Track Inflation at Wallet Scale';

  const calculatedSpending = useMemo(() => {
    if (!result) return null;
    const mapped: Record<string, number> = {};
    for (const row of result.category_breakdown) {
      if (row.spending > 0) {
        mapped[row.category] = row.spending;
      }
    }
    return mapped;
  }, [result]);

  const defaultSimBreakdown = useMemo((): CategoryBreakdown[] | null => {
    if (!categories.length || result) return null;
    const total = categories.reduce((sum, c) => sum + (MEDIAN_SPENDING[c.series_name] ?? 0), 0);
    if (total === 0) return null;
    return categories
      .filter((c) => c.latest_inflation_rate !== null)
      .map((c) => {
        const spending = MEDIAN_SPENDING[c.series_name] ?? 0;
        const weight = spending / total;
        const contribution = weight * (c.latest_inflation_rate ?? 0);
        return { category: c.series_name, spending, inflation_rate: c.latest_inflation_rate, weight, contribution };
      });
  }, [categories, result]);

  const defaultSimRate = useMemo(() => {
    if (!defaultSimBreakdown) return null;
    return Number(defaultSimBreakdown.reduce((sum, r) => sum + (r.contribution ?? 0), 0).toFixed(2));
  }, [defaultSimBreakdown]);

  const topPressureCategory = useMemo(() => {
    if (!latest?.categories?.length) return null;
    return [...latest.categories]
      .filter((c) => c.inflation_rate !== null)
      .sort((a, b) => (b.inflation_rate ?? 0) - (a.inflation_rate ?? 0))[0] ?? null;
  }, [latest]);

  const {
    drivers,
    comparison,
    trend,
    loading: loadingInsights,
    error: insightsError,
  } = useInsights({
    spending: calculatedSpending,
    sessionId,
    enabled: Boolean(result),
  });

  const formatRate = (rate?: number | null) => {
    if (rate === null || rate === undefined) return 'N/A';
    return `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`;
  };

  const renderBlockedPanelState = (message: string) => (
    <div className="flex-1 flex items-center justify-center rounded-[20px] border border-dashed border-neutral-300 bg-white/70 px-6">
      <p className="text-neutral-400 text-sm text-center max-w-sm">{message}</p>
    </div>
  );

  // When category list loads, re-initialise spending keys to match
  useEffect(() => {
    if (categoryNames.length > 0) {
      setSpending((prev) => {
        const updated: Record<string, string> = {};
        for (const name of categoryNames) {
          updated[name] = prev[name] ?? '';
        }
        return updated;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryNames.join(',')]);

  const handleChange = (name: string, value: string) => {
    setSpending((prev) => ({ ...prev, [name]: value }));
  };

  const handleBenchmarkChange = async (nextBenchmarkKey: string) => {
    setBenchmarkMenuOpen(false);
    if (!nextBenchmarkKey || nextBenchmarkKey === benchmark?.key) return;
    clearResult();
    await switchBenchmark(nextBenchmarkKey);
  };

  useEffect(() => {
    const handleDocumentPointerDown = (event: MouseEvent) => {
      if (!benchmarkMenuRef.current) return;
      const target = event.target as Node;
      if (!benchmarkMenuRef.current.contains(target)) {
        setBenchmarkMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBenchmarkMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (switchingBenchmark) {
      setBenchmarkMenuOpen(false);
    }
  }, [switchingBenchmark]);

  const handleSaveMonthlyLog = async () => {
    setMonthlyLogStatus(null);

    const parsed: Record<string, number> = {};
    for (const [key, val] of Object.entries(spending)) {
      const amount = Number.parseFloat(val);
      if (Number.isFinite(amount) && amount > 0) parsed[key] = amount;
    }

    const ok = await saveMonthlyLog({ period: logPeriod, spending: parsed });
    if (ok) {
      setMonthlyLogStatus(`Saved monthly log for ${logPeriod}.`);
    }
  };

  const handleLoadMonthlyLog = (log: MonthlySpendingLog) => {
    setSpending(() => {
      const next: Record<string, string> = {};
      for (const name of categoryNames) {
        const amount = log.spending[name];
        next[name] = amount !== undefined ? String(amount) : '';
      }
      return next;
    });
    setLogPeriod(log.period);
    clearResult();
    setMonthlyLogStatus(`Loaded ${log.period} into the calculator.`);
  };

  const handleApplySimulation = (nextSpending: Record<string, number>) => {
    setSpending(() => {
      const next: Record<string, string> = {};
      for (const name of categoryNames) {
        const value = nextSpending[name];
        next[name] = value !== undefined ? String(Math.round(value)) : '';
      }
      return next;
    });
    clearResult();
    setMonthlyLogStatus('Scenario applied to input fields. Click Calculate to refresh all result cards.');
  };

  const handleFillSample = () => {
    setSpending(() => {
      const next: Record<string, string> = {};
      for (const name of categoryNames) {
        next[name] = String(MEDIAN_SPENDING[name] ?? 0);
      }
      return next;
    });
    clearResult();
  };

  const handleCopySummary = async () => {
    if (!result) return;
    const topDriver = result.category_breakdown
      .filter((b) => b.contribution !== null && (b.contribution ?? 0) > 0)
      .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))[0];
    const diff =
      result.personal_inflation_rate !== null && result.national_inflation_rate !== null
        ? result.personal_inflation_rate - result.national_inflation_rate
        : null;
    const lines = [
      'PriceWatch SG: Personal Inflation Summary',
      `Period: ${result.period}`,
      `Personal Rate: ${result.personal_inflation_rate !== null ? (result.personal_inflation_rate >= 0 ? '+' : '') + result.personal_inflation_rate.toFixed(2) + '%' : 'N/A'}`,
      `National CPI: ${result.national_inflation_rate !== null ? (result.national_inflation_rate >= 0 ? '+' : '') + result.national_inflation_rate.toFixed(2) + '%' : 'N/A'}`,
      diff !== null ? `vs National: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}% (${diff > 0 ? 'higher pressure' : diff < 0 ? 'lower pressure' : 'similar'})` : '',
      `Monthly Spending: S$${Math.round(result.total_monthly_spending).toLocaleString('en-SG')}`,
      topDriver ? `Top Driver: ${topDriver.category} (+${(topDriver.contribution ?? 0).toFixed(2)} pp)` : '',
      '',
      'Source: SingStat · PriceWatch SG',
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const centerPanelInStrip = (
    panelEl: HTMLDivElement | null,
    behavior: ScrollBehavior = 'smooth'
  ) => {
    const strip = stripRef.current;
    if (!strip || !panelEl) return;

    const targetLeft = panelEl.offsetLeft + panelEl.offsetWidth / 2 - strip.clientWidth / 2;
    const maxLeft = Math.max(strip.scrollWidth - strip.clientWidth, 0);
    const clampedLeft = Math.min(Math.max(targetLeft, 0), maxLeft);
    strip.scrollTo({ left: clampedLeft, behavior });
  };

  const updateEdgePadding = () => {
    const strip = stripRef.current;
    const firstCard = pulseRef.current;
    if (!strip || !firstCard) return;
    const nextPadding = Math.max((strip.clientWidth - firstCard.clientWidth) / 2, 12);
    setEdgePadding(nextPadding);
  };

  const scrollToPanel = (panel: PanelKey, behavior: ScrollBehavior = 'smooth') => {
    setActivePanel(panel);
    const panelMap = {
      pulse: pulseRef,
      calculator: calculatorRef,
      simulation: simulationRef,
      insights: insightsRef,
    } as const;
    centerPanelInStrip(panelMap[panel].current, behavior);
  };

  const handleStripScroll = () => {
    const strip = stripRef.current;
    if (!strip) return;

    const stripRect = strip.getBoundingClientRect();
    const stripCenter = stripRect.left + stripRect.width / 2;
    const candidates: Array<{
      key: PanelKey;
      ref: RefObject<HTMLDivElement | null>;
    }> = [
      { key: 'pulse', ref: pulseRef },
      { key: 'calculator', ref: calculatorRef },
      { key: 'simulation', ref: simulationRef },
      { key: 'insights', ref: insightsRef },
    ];

    let nearest: PanelKey = 'pulse';
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      if (!c.ref.current) continue;
      const panelRect = c.ref.current.getBoundingClientRect();
      const panelCenter = panelRect.left + panelRect.width / 2;
      const d = Math.abs(panelCenter - stripCenter);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = c.key;
      }
    }

    setActivePanel((prev) => (prev === nearest ? prev : nearest));
  };

  const handleGlobalWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (showMonthlyLogsPanel || benchmarkMenuOpen) return;

    const horizontalIntent =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0;

    if (Math.abs(horizontalIntent) < 14) return;

    const now = performance.now();
    if (now < panelWheelCooldownRef.current) {
      return;
    }

    const direction: -1 | 1 = horizontalIntent > 0 ? 1 : -1;

    const currentIndex = PANEL_ORDER.indexOf(activePanelRef.current);
    if (currentIndex < 0) return;

    const nextIndex = direction > 0
      ? Math.min(currentIndex + 1, PANEL_ORDER.length - 1)
      : Math.max(currentIndex - 1, 0);

    if (nextIndex !== currentIndex) {
      // Wheel navigation should feel decisive: one gesture, one panel step.
      event.preventDefault();
      panelWheelCooldownRef.current = now + 320;
      scrollToPanel(PANEL_ORDER[nextIndex], 'auto');
    }
  };

  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);

  useEffect(() => {
    if (categories.length === 0) return;

    const onResize = () => {
      updateEdgePadding();
      const panelMap = {
        pulse: pulseRef,
        calculator: calculatorRef,
        simulation: simulationRef,
        insights: insightsRef,
      } as const;
      centerPanelInStrip(panelMap[activePanelRef.current].current, 'auto');
    };

    const rafId = window.requestAnimationFrame(() => {
      updateEdgePadding();
      setActivePanel('calculator');
      centerPanelInStrip(calculatorRef.current, 'auto');
    });

    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);

  // ---------- Loading / Error states ----------

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#ececf0]">
        <div className="h-6 w-44 rounded-full bg-neutral-300 animate-pulse" />
        <div className="h-3 w-28 rounded-full bg-neutral-300/70 animate-pulse" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 w-32 rounded-2xl bg-neutral-300 animate-pulse"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (loadError && categories.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <p className="text-red-500 font-semibold text-lg mb-2">Failed to load CPI data</p>
          <p className="text-gray-500 text-sm">{loadError}</p>
          <p className="text-gray-400 text-xs mt-3">
            Make sure the backend is running at{' '}
            <code className="bg-gray-100 px-1 rounded">
              {import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    // API accessible but no CPI data yet (ingestion may be in progress)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <p className="text-amber-500 font-semibold text-lg mb-2">CPI data not yet available</p>
          <p className="text-gray-500 text-sm">
            The backend is fetching data from SingStat. This may take a few seconds.
          </p>
          {status && !status.success && (
            <p className="text-red-400 text-xs mt-3 bg-red-50 p-2 rounded">
              Last ingestion error: {status.error_message}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------- Main content ----------

  const statColor = (r?: number | null) => severityTextClass(inflationSeverity(r));
  const latestPeriodLabel = formatPeriodLabel(latest?.period ?? null);
  const topControlTextClass = 'text-sm font-medium tracking-[0.01em] leading-none text-neutral-700';
  const topControlShellClass = 'h-10 rounded-full px-4 inline-flex items-center bg-transparent ring-0 shadow-none transition-all duration-200';

  return (
    <div
      onWheelCapture={handleGlobalWheel}
      className="relative h-screen overflow-hidden bg-gradient-to-b from-[#efeff2] via-[#ececf0] to-[#e6e7eb] text-neutral-900 flex flex-col"
    >

      {switchingBenchmark && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-white/28 backdrop-blur-[1.5px]">
          <div className="rounded-2xl border border-emerald-200 bg-white/95 px-5 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.14)] min-w-[270px]">
            <div className="flex items-center gap-3">
              <span className="h-5 w-5 rounded-full border-2 border-emerald-200 border-t-emerald-500 animate-spin" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-neutral-800">Refreshing benchmark data...</p>
                <p className="text-xs text-neutral-500 mt-0.5">Updating CPI snapshot and categories</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex-shrink-0 pt-3 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="rounded-full border border-neutral-200 bg-white/90 backdrop-blur-md px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-[0_10px_28px_rgba(16,24,40,0.08)]">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2.5 min-w-0 text-left group"
              title="Refresh dashboard"
            >
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-[0_4px_12px_rgba(99,102,241,0.35)] group-hover:shadow-[0_6px_18px_rgba(99,102,241,0.45)] transition-shadow duration-200">
                <BarChart2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[0.92rem] font-semibold text-neutral-900 leading-none tracking-tight">
                  PriceWatch <span className="text-neutral-400 font-normal">SG</span>
                </p>
                <p className="text-[9px] uppercase tracking-[0.14em] text-neutral-400 mt-0.5 leading-none">Personal Inflation</p>
              </div>
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowMonthlyLogsPanel(true)}
                className={`${topControlShellClass} ${topControlTextClass} hover:bg-white/90 hover:ring-1 hover:ring-neutral-300 hover:shadow-[0_6px_14px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Monthly Logs
              </button>
              {latest?.period && (
                <div className={`hidden lg:flex ${topControlShellClass} ${topControlTextClass} hover:bg-white/90 hover:ring-1 hover:ring-neutral-300`}>
                  Data: {latestPeriodLabel}
                </div>
              )}
              <div ref={benchmarkMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setBenchmarkMenuOpen((v) => !v)}
                  disabled={switchingBenchmark}
                  className={`group h-10 min-w-[208px] sm:min-w-[250px] rounded-full px-4 sm:px-5 flex items-center justify-between ${topControlTextClass} transition-all duration-250 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-65 disabled:cursor-not-allowed ${
                    benchmarkMenuOpen
                      ? 'bg-white ring-1 ring-neutral-300 shadow-[0_10px_20px_rgba(17,24,39,0.12)]'
                      : 'bg-transparent ring-0 shadow-none hover:bg-white/90 hover:ring-1 hover:ring-neutral-300 hover:shadow-[0_8px_18px_rgba(17,24,39,0.1)]'
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={benchmarkMenuOpen}
                  title="Choose household benchmark"
                >
                  <div className="min-w-0 flex items-center gap-2 text-left">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${switchingBenchmark ? 'bg-neutral-400 animate-pulse' : 'bg-emerald-500'}`}
                      aria-hidden
                    />
                    <p className={`${topControlTextClass} truncate`}>
                      {benchmark?.label ?? 'Middle 60% households'}
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-neutral-500 transition-all duration-200 ${benchmarkMenuOpen ? 'rotate-180' : 'rotate-0'} group-hover:translate-y-[1px]`} />
                </button>

                <div
                  className={`absolute right-0 top-[calc(100%+10px)] z-[90] w-[286px] origin-top-right rounded-2xl border border-neutral-200 bg-white shadow-[0_20px_42px_rgba(17,24,39,0.16)] transition-all duration-200 ease-out ${
                    benchmarkMenuOpen
                      ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
                      : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
                  }`}
                  role="listbox"
                >
                  <div className="p-2 space-y-1.5">
                    {benchmarkOptions.map((o) => {
                      const selected = o.key === benchmark?.key;
                      return (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() => void handleBenchmarkChange(o.key)}
                          disabled={switchingBenchmark}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed ${
                            selected
                              ? 'border-neutral-300 bg-neutral-100 text-neutral-900'
                              : 'border-transparent bg-white text-neutral-700 hover:bg-neutral-50'
                          }`}
                          role="option"
                          aria-selected={selected}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block text-[0.95rem] font-semibold leading-tight truncate">{o.label}</span>
                              <span className="block text-[10px] uppercase tracking-[0.08em] text-neutral-500 mt-1">SingStat table {o.table_id}</span>
                            </span>
                            <span
                              className={`mt-1 h-1.5 w-1.5 rounded-full ${selected ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                              aria-hidden
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Toasts ──────────────────────────────────────────────── */}
      {loadError && categories.length > 0 && (
        <div className="flex-shrink-0 px-4 sm:px-6 pt-2 space-y-1.5 max-w-7xl mx-auto w-full">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2">
            <p className="text-xs text-red-400">{loadError}</p>
          </div>
        </div>
      )}

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 relative flex flex-col items-center justify-center pt-3 pb-0 overflow-hidden">
        {/* Background glow orbs */}
        <div className="absolute -left-32 top-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-indigo-300/45 blur-[80px] animate-float pointer-events-none" />
        <div className="absolute -right-24 top-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-sky-300/35 blur-[60px] animate-float pointer-events-none" style={{ animationDelay: '2s' }} />

        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 animate-fade-in relative">Personal CPI · Singapore · SingStat Data</p>
        <div className="mt-1 w-full max-w-[1200px] overflow-hidden border-y border-neutral-300/70 py-1.5 animate-slide-up bg-[linear-gradient(90deg,rgba(148,163,184,0)_0%,rgba(148,163,184,0.12)_50%,rgba(148,163,184,0)_100%)]">
          <div className="w-max flex animate-marquee whitespace-nowrap">
            <p className="font-editorial px-6 text-[clamp(1.2rem,2.4vw,1.8rem)] italic tracking-[0.02em] text-neutral-700/85">
              {`${TICKER_TEXT} • ${TICKER_TEXT} • ${TICKER_TEXT} • ${TICKER_TEXT} • `}
            </p>
            <p aria-hidden="true" className="font-editorial px-6 text-[clamp(1.2rem,2.4vw,1.8rem)] italic tracking-[0.02em] text-neutral-700/80">
              {`${TICKER_TEXT} • ${TICKER_TEXT} • ${TICKER_TEXT} • ${TICKER_TEXT} • `}
            </p>
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-2 w-full max-w-[1160px] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-300/80 animate-slide-up relative" style={{ animationDelay: '200ms' }}>
          <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center flex flex-col items-center">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-500">National CPI</p>
            <p className="min-h-[2.4rem] mt-1 text-[11px] leading-snug text-neutral-500 flex items-center text-center">
              All-items household CPI.
            </p>
            <p className={`mt-1 text-[clamp(2.7rem,4.3vw,3.6rem)] leading-[0.94] font-semibold tabular-nums ${statColor(latest?.national?.inflation_rate)}`}>
              {formatRate(latest?.national?.inflation_rate)}
            </p>
          </div>

          <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center flex flex-col items-center">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-500">Your Rate</p>
            <p className="min-h-[2.4rem] mt-1 text-[11px] leading-snug text-neutral-500 flex items-center text-center">
              {result ? 'Your personal basket inflation.' : 'Enter spending → click Calculate to unlock.'}
            </p>
            <p className={`mt-1 text-[clamp(2.7rem,4.3vw,3.6rem)] leading-[0.94] font-semibold tabular-nums ${result ? 'text-neutral-900' : 'text-neutral-300'}`}>
              {result ? formatRate(result.personal_inflation_rate) : '—'}
            </p>
          </div>

          <div className="px-3 sm:px-4 py-2.5 sm:py-3 text-center flex flex-col items-center">
            <div className="flex items-center justify-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-neutral-400" />
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] leading-tight text-neutral-500">Top Pressure Category</p>
            </div>
            <p className="min-h-[2.4rem] mt-1 text-[11px] leading-snug text-neutral-500 flex items-center text-center">
              {topPressureCategory ? topPressureCategory.series_name : 'Loading…'}
            </p>
            {topPressureCategory ? (
              <p className={`mt-1 text-[clamp(2.7rem,4.3vw,3.6rem)] leading-[0.94] font-semibold tabular-nums ${statColor(topPressureCategory.inflation_rate)}`}>
                {topPressureCategory.inflation_rate !== null
                  ? `${topPressureCategory.inflation_rate >= 0 ? '+' : ''}${topPressureCategory.inflation_rate.toFixed(1)}%`
                  : 'N/A'}
              </p>
            ) : (
              <p className="mt-1 text-[clamp(2.7rem,4.3vw,3.6rem)] leading-[0.94] font-semibold text-neutral-300">—</p>
            )}
          </div>
        </div>

        {/* Quick subtab switcher */}
        <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-neutral-200/90 bg-white/78 p-1.5 shadow-[0_14px_32px_rgba(15,23,42,0.08)] backdrop-blur-md animate-slide-up" style={{ animationDelay: '280ms' }}>
          {([
            { key: 'pulse', label: 'Category Pulse' },
            { key: 'calculator', label: 'Your Calculator' },
            { key: 'simulation', label: 'Simulation' },
            { key: 'insights', label: 'Insights' },
          ] as const).map((item) => (
            (() => {
              const palette = {
                pulse: {
                  dot: 'bg-sky-500',
                  active: 'ring-1 ring-sky-100/90',
                },
                calculator: {
                  dot: 'bg-rose-500',
                  active: 'ring-1 ring-rose-100/90',
                },
                simulation: {
                  dot: 'bg-emerald-500',
                  active: 'ring-1 ring-emerald-100/90',
                },
                insights: {
                  dot: 'bg-violet-500',
                  active: 'ring-1 ring-violet-100/90',
                },
              } as const;

              const theme = palette[item.key];
              const isActive = activePanel === item.key;

              return (
            <button
              key={item.key}
              onClick={() => scrollToPanel(item.key)}
              className={`group h-11 sm:h-12 rounded-full border px-3 sm:px-4 inline-flex items-center gap-2 text-[0.92rem] sm:text-[0.95rem] font-sans font-medium leading-none tracking-normal transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 ${
                isActive
                  ? `border-white/90 bg-white text-neutral-900 shadow-[0_8px_18px_rgba(15,23,42,0.10)] ${theme.active}`
                  : 'border-transparent bg-transparent text-neutral-600 hover:bg-white/80 hover:text-neutral-900'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${theme.dot} ${
                  isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-85'
                }`}
                aria-hidden
              />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
              );
            })()
          ))}
        </div>

        {/* Panel progress dots */}
        <div className="mt-1.5 inline-flex gap-1 animate-fade-in">
          {(['pulse','calculator','simulation','insights'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => scrollToPanel(p)}
              className={`h-1.5 rounded-full transition-all duration-300 ${activePanel === p ? 'w-5 bg-neutral-500' : 'w-1.5 bg-neutral-300 hover:bg-neutral-400'}`}
              aria-label={`Go to ${p}`}
            />
          ))}
        </div>
      </div>

      {/* ── Horizontal Panel Strip ──────────────────────────────── */}
      <div
        ref={stripRef}
        onScroll={handleStripScroll}
        className="-mt-3 flex-1 min-h-0 flex gap-3 overflow-x-auto px-4 sm:px-6 pb-3 [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', overflowY: 'clip' }}
      >
        <div aria-hidden className="flex-shrink-0" style={{ width: edgePadding }} />

        {/* ── Card 1: Your Calculator ─────────────────────────── */}
        <div
          ref={calculatorRef}
          className={`flex-shrink-0 h-full w-[min(900px,92vw)] rounded-[28px] bg-white border border-neutral-200 overflow-hidden flex flex-col animate-slide-up relative transition-[transform,box-shadow] duration-300 ease-out ${interactingPanel === 'calculator' ? 'scale-[1.015] shadow-[0_22px_52px_rgba(17,24,39,0.14)] z-10' : 'shadow-[0_12px_30px_rgba(17,24,39,0.08)]'}`}
          style={{ scrollSnapAlign: 'center', animationDelay: '280ms' }}
          onFocusCapture={() => setInteractingPanel('calculator')}
          onBlurCapture={(e) => { if (!calculatorRef.current?.contains(e.relatedTarget as Node)) setInteractingPanel(null); }}
        >
          <div className="h-[3px] bg-gradient-to-r from-rose-400 to-pink-500 flex-shrink-0" />
          <div className="flex-shrink-0 px-6 pt-4 pb-2 flex items-center justify-between border-b border-neutral-200/60">
            <div className="flex items-center gap-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-400">01</p>
              <p className="text-sm font-semibold text-neutral-700">Your Calculator</p>
            </div>
            <Calculator className="h-4 w-4 text-rose-400" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-3 px-4 pb-3 pt-3">
            <div className="overflow-visible pr-1">
              <SpendingInput
                categories={categories}
                spending={spending}
                onChange={handleChange}
                onSubmit={calculate}
                onReset={reset}
                calculating={calculating}
                error={calcError}
              />
            </div>
            <div className="overflow-visible grid grid-cols-1 lg:grid-cols-2 auto-rows-min content-start gap-2.5">
              {result ? (
                <>
                  <div className="lg:col-span-2 flex items-center justify-between px-1 -mb-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-400 font-mono">Results</p>
                    <button
                      type="button"
                      onClick={() => void handleCopySummary()}
                      className="h-7 px-3 rounded-full inline-flex items-center gap-1.5 text-[11px] font-medium border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 hover:shadow-sm"
                      style={copied
                        ? { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }
                        : { background: '#f5f5f6', borderColor: '#e5e5e7', color: '#525252' }
                      }
                    >
                      {copied
                        ? <><Check className="h-3 w-3" /> Copied!</>
                        : <><Copy className="h-3 w-3" /> Copy summary</>
                      }
                    </button>
                  </div>
                  <div className="lg:col-span-2"><InflationCard result={result} /></div>

                  <div className="min-h-[210px]">
                    <ActionRecommendations result={result} />
                  </div>
                  <div className="min-h-[210px]">
                    <BreakdownChart breakdown={result.category_breakdown} nationalRate={result.national_inflation_rate} />
                  </div>

                  <div className="lg:col-span-2">
                    <DriversCard data={drivers} loading={loadingInsights} />
                  </div>

                  <div>
                    <HouseholdComparisonCard comparison={comparison} loading={loadingInsights} />
                  </div>
                  <div>
                    <SpendingDistributionChart breakdown={result.category_breakdown} />
                  </div>

                  {insightsError && (
                    <div className="lg:col-span-2 bg-red-50 border border-red-100 rounded-xl px-4 py-2">
                      <p className="text-xs text-red-600">Unable to load one or more insight cards: {insightsError}</p>
                    </div>
                  )}

                  {result.warnings.length > 0 && (
                    <div className="lg:col-span-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
                      {result.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">⚠ {w}</p>)}
                    </div>
                  )}
                </>
              ) : (
                <div className="lg:col-span-2 min-h-[220px] lg:h-full flex items-center justify-center rounded-[20px] border border-dashed border-neutral-300 bg-gradient-to-b from-white/80 to-white/50">
                  <div className="text-center px-6 max-w-sm">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 shadow-[0_4px_14px_rgba(99,102,241,0.12)]">
                      <Calculator className="h-5 w-5 text-indigo-500" />
                    </div>
                    <p className="text-neutral-700 text-sm font-medium leading-snug">Fill in your monthly spending to see your personal inflation rate</p>
                    <p className="text-neutral-400 text-xs mt-1.5">Or start with median Singapore household values</p>
                    <button
                      type="button"
                      onClick={handleFillSample}
                      className="mt-4 h-9 px-5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-100 hover:border-indigo-200 transition-all duration-200 shadow-[0_2px_8px_rgba(99,102,241,0.1)]"
                    >
                      Try sample inputs
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Card 2: Simulation ──────────────────────────────── */}
        <div
          ref={simulationRef}
          className={`flex-shrink-0 h-full w-[min(900px,92vw)] rounded-[28px] bg-white border border-neutral-200 overflow-hidden flex flex-col animate-slide-up relative transition-[transform,box-shadow] duration-300 ease-out ${interactingPanel === 'simulation' ? 'scale-[1.015] shadow-[0_22px_52px_rgba(17,24,39,0.14)] z-10' : 'shadow-[0_12px_30px_rgba(17,24,39,0.08)]'}`}
          style={{ scrollSnapAlign: 'center', animationDelay: '360ms' }}
          onFocusCapture={() => setInteractingPanel('simulation')}
          onBlurCapture={(e) => { if (!simulationRef.current?.contains(e.relatedTarget as Node)) setInteractingPanel(null); }}
        >
          <div className="h-[3px] bg-gradient-to-r from-emerald-400 to-teal-500 flex-shrink-0" />
          <div className="flex-shrink-0 px-6 pt-4 pb-2 flex items-center justify-between border-b border-neutral-200/60">
            <div className="flex items-center gap-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-400">02</p>
              <p className="text-sm font-semibold text-neutral-700">Simulation Lab</p>
            </div>
            <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 pt-3 flex flex-col gap-2.5">
            {!result && defaultSimBreakdown && (
              <div className="flex-shrink-0 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-indigo-700 leading-relaxed">
                  Showing <strong>median SG household values</strong>. Enter your spending in <em>Your Calculator</em> and run it to personalise.
                </p>
              </div>
            )}
            <WhatIfSimulationPanel
              breakdown={result?.category_breakdown ?? defaultSimBreakdown ?? []}
              basePersonalRate={result?.personal_inflation_rate ?? defaultSimRate}
              onApplyScenario={result ? handleApplySimulation : undefined}
            />
          </div>
        </div>

        {/* ── Card 3: Category Pulse ──────────────────────────── */}
        <div
          ref={pulseRef}
          className={`flex-shrink-0 h-full w-[min(900px,92vw)] rounded-[28px] bg-white border border-neutral-200 overflow-hidden flex flex-col animate-slide-up relative transition-[transform,box-shadow] duration-300 ease-out ${interactingPanel === 'pulse' ? 'scale-[1.015] shadow-[0_22px_52px_rgba(17,24,39,0.14)] z-10' : 'shadow-[0_12px_30px_rgba(17,24,39,0.08)]'}`}
          style={{ scrollSnapAlign: 'center', animationDelay: '440ms' }}
          onFocusCapture={() => setInteractingPanel('pulse')}
          onBlurCapture={(e) => { if (!pulseRef.current?.contains(e.relatedTarget as Node)) setInteractingPanel(null); }}
        >
          <div className="h-[3px] bg-gradient-to-r from-sky-400 to-sky-500 flex-shrink-0" />
          <div className="flex-shrink-0 px-6 pt-4 pb-2 flex items-center justify-between border-b border-neutral-200/60">
            <div className="flex items-center gap-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-400">03</p>
              <p className="text-sm font-semibold text-neutral-700">Category Pulse</p>
            </div>
            <BarChart2 className="h-4 w-4 text-sky-400" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
            {latest && <NationalOverview latest={latest} compact />}
          </div>
        </div>

        {/* ── Card 4: Insights ────────────────────────────────── */}
        <div
          ref={insightsRef}
          className={`flex-shrink-0 h-full w-[min(900px,92vw)] rounded-[28px] bg-white border border-neutral-200 overflow-hidden flex flex-col animate-slide-up relative transition-[transform,box-shadow] duration-300 ease-out ${interactingPanel === 'insights' ? 'scale-[1.015] shadow-[0_22px_52px_rgba(17,24,39,0.14)] z-10' : 'shadow-[0_12px_30px_rgba(17,24,39,0.08)]'}`}
          style={{ scrollSnapAlign: 'center', animationDelay: '520ms' }}
          onFocusCapture={() => setInteractingPanel('insights')}
          onBlurCapture={(e) => { if (!insightsRef.current?.contains(e.relatedTarget as Node)) setInteractingPanel(null); }}
        >
          <div className="h-[3px] bg-gradient-to-r from-violet-400 to-purple-500 flex-shrink-0" />
          <div className="flex-shrink-0 px-6 pt-4 pb-2 flex items-center justify-between border-b border-neutral-200/60">
            <div className="flex items-center gap-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-neutral-400">04</p>
              <p className="text-sm font-semibold text-neutral-700">Insights</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-violet-400" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 pt-3 flex flex-col gap-2.5">
            {result ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  <ProjectionPanel result={result} benchmarkLabel={benchmark?.label} tableId={benchmark?.table_id} />
                  <InflationTrendChart trend={trend} loading={loadingInsights} error={insightsError} />
                </div>
                <div className="flex-shrink-0 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-800">Save this month's snapshot</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5 truncate">Log spending for {logPeriod} to track over time</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveMonthlyLog()}
                    disabled={savingMonthlyLog}
                    className="flex-shrink-0 h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-xs font-medium bg-neutral-900 text-white hover:bg-black disabled:opacity-60 transition-all duration-200 shadow-[0_4px_12px_rgba(15,23,42,0.15)]"
                  >
                    <BookmarkPlus className="h-3 w-3" />
                    {savingMonthlyLog ? 'Saving…' : 'Save Month'}
                  </button>
                </div>
                {monthlyLogStatus && (
                  <p className="flex-shrink-0 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl break-normal -mt-1">
                    {monthlyLogStatus}
                  </p>
                )}

                <div className="flex-shrink-0 pb-1">
                  <button
                    onClick={() => setShowTrustCard((v) => !v)}
                    className="flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors duration-200 mx-auto select-none"
                  >
                    <Info className="h-3 w-3" />
                    About the data &amp; method
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showTrustCard ? 'rotate-180' : ''}`} />
                  </button>
                  {showTrustCard && (
                    <div className="mt-3 animate-slide-up">
                      <TrustMethodCard status={status} benchmark={benchmark} latestPeriod={latest?.period ?? null} />
                      <p className="text-xs text-neutral-400 mt-2 text-center">
                        <a
                          href={`https://tablebuilder.singstat.gov.sg/table/TS/${benchmark?.table_id ?? 'M214011'}`}
                          target="_blank" rel="noopener noreferrer"
                          className="underline hover:text-neutral-600"
                        >SingStat {benchmark?.table_id ?? 'M214011'}</a>{' '}
                        · {benchmark?.label ?? 'Middle 60% households'} · half-yearly
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              renderBlockedPanelState('Run the calculator first to unlock projections and trend insights')
            )}
          </div>
        </div>

        <div aria-hidden className="flex-shrink-0" style={{ width: edgePadding }} />

      </div>

      {showMonthlyLogsPanel && (
        <div
          className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-[1px] flex items-start justify-end p-3 sm:p-5"
          onClick={() => setShowMonthlyLogsPanel(false)}
        >
          <div
            className="w-full max-w-[440px] h-[min(86vh,760px)] rounded-[26px] border border-neutral-200 bg-[#f4f7ff] shadow-[0_24px_60px_rgba(15,23,42,0.2)] flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/80">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Monthly Logs</p>
                <p className="text-sm font-semibold text-neutral-800">Save and compare previous months</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMonthlyLogsPanel(false)}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <MonthlyLogsCard
                period={logPeriod}
                onPeriodChange={setLogPeriod}
                onSave={() => void handleSaveMonthlyLog()}
                saving={savingMonthlyLog}
                history={monthlyHistory}
                loadingHistory={loadingMonthlyHistory}
                historyError={monthlyHistoryError}
                statusMessage={monthlyLogStatus}
                onLoadLog={handleLoadMonthlyLog}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
