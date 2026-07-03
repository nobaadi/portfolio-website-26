import type { MonthlySpendingLog } from '../types';

interface Props {
  period: string;
  onPeriodChange: (next: string) => void;
  onSave: () => void;
  saving: boolean;
  history: MonthlySpendingLog[];
  loadingHistory: boolean;
  historyError: string | null;
  statusMessage: string | null;
  onLoadLog: (log: MonthlySpendingLog) => void;
}

function periodLabel(period: string): string {
  const [yearRaw, monthRaw] = period.split('-');
  const y = Number.parseInt(yearRaw, 10);
  const m = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return period;
  const d = new Date(y, Math.max(0, m - 1), 1);
  return d.toLocaleString('en-SG', { month: 'short', year: 'numeric' });
}

function formatSgdShort(amount: number): string {
  if (!Number.isFinite(amount)) return 'S$0';
  if (amount >= 1_000_000) {
    return `S${new Intl.NumberFormat('en-SG', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount)}`;
  }
  return `S$${new Intl.NumberFormat('en-SG', {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export default function MonthlyLogsCard({
  period,
  onPeriodChange,
  onSave,
  saving,
  history,
  loadingHistory,
  historyError,
  statusMessage,
  onLoadLog,
}: Props) {
  const previousMonthLog = history.length > 1 ? history[1] : null;

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1 leading-none">
            Monthly Logs
          </p>
          <p className="text-sm font-display font-semibold tracking-[0.01em] text-neutral-700 leading-tight">
            Save this month and compare with previous logs
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="month"
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="flex-1 min-w-0 rounded-full border border-neutral-200 px-3 py-2 text-sm bg-white text-neutral-700"
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-neutral-900 text-white text-sm font-medium px-4 py-2 hover:bg-black disabled:opacity-60 transition"
        >
          {saving ? 'Saving…' : 'Save Month'}
        </button>
      </div>

      {statusMessage && (
        <p className="mt-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl break-normal">
          {statusMessage}
        </p>
      )}

      {historyError && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl break-normal">
          {historyError}
        </p>
      )}

      {previousMonthLog && (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.08em] text-neutral-500 mb-1">Previous month</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-neutral-700 break-normal">
              {periodLabel(previousMonthLog.period)} · {formatSgdShort(previousMonthLog.total_monthly_spending)}/mo
            </p>
            <button
              onClick={() => onLoadLog(previousMonthLog)}
              className="text-xs text-neutral-700 underline hover:text-neutral-900"
            >
              Load
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-neutral-400 mb-2">History</p>
        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
          {loadingHistory ? (
            <p className="text-xs text-neutral-400">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-neutral-400">No monthly logs yet.</p>
          ) : (
            history.map((log, idx) => (
              <button
                key={`${log.period}-${idx}`}
                onClick={() => onLoadLog(log)}
                className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-[#f8f8f9] px-3 py-2 text-left hover:bg-white hover:border-neutral-300 transition"
              >
                <span className="text-xs text-neutral-700">{periodLabel(log.period)}</span>
                <span className="text-xs font-medium text-neutral-500 tabular-nums" title={formatSgdShort(log.total_monthly_spending)}>{formatSgdShort(log.total_monthly_spending)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
