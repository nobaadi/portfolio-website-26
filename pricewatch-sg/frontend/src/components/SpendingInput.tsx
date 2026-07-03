/**
 * SpendingInput – 2-column compact grid of monthly spending inputs.
 * Placeholder hints show Singapore median per category.
 */
import type { CPICategory, SpendingFormValues } from '../types';
import { inflationSeverity, severityTextClass } from '../lib/inflationSemantics';
import { primaryActionButtonClass, secondaryActionButtonClass } from '../lib/actionButtonStyles';

const PLACEHOLDER_HINTS: Record<string, string> = {
  'Food': '500',
  'Clothing & Footwear': '100',
  'Housing & Utilities': '1200',
  'Household Durables & Services': '150',
  'Health': '150',
  'Transport': '250',
  'Information & Communication': '80',
  'Recreation, Sport & Culture': '200',
  'Education': '200',
  'Miscellaneous Goods & Services': '120',
};

const DISPLAY_LABELS: Record<string, string> = {
  'Food': 'Food',
  'Clothing & Footwear': 'Clothing',
  'Housing & Utilities': 'Housing',
  'Household Durables & Services': 'Household',
  'Health': 'Health',
  'Transport': 'Transport',
  'Information & Communication': 'Info & Comms',
  'Recreation, Sport & Culture': 'Recreation',
  'Education': 'Education',
  'Miscellaneous Goods & Services': 'Misc.',
};

interface Props {
  categories: CPICategory[];
  spending: SpendingFormValues;
  onChange: (name: string, value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  calculating: boolean;
  error: string | null;
}

function formatSgdCompact(amount: number): string {
  if (!Number.isFinite(amount)) return 'S$0';
  return `S${new Intl.NumberFormat('en-SG', {
    notation: 'compact',
    maximumFractionDigits: amount >= 1_000_000 ? 1 : 0,
  }).format(amount)}`;
}

function formatSgdFull(amount: number): string {
  if (!Number.isFinite(amount)) return 'S$0';
  return `S$${new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 }).format(amount)}`;
}

function sanitizeSpendingInput(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
  const [integerRaw, ...fractionParts] = cleaned.split('.');
  const integerPart = integerRaw.replace(/^0+(?=\d)/, '');
  if (fractionParts.length === 0) return integerPart;
  const fraction = fractionParts.join('').slice(0, 2);
  return fraction.length > 0 ? `${integerPart || '0'}.${fraction}` : (integerPart || '0');
}

export default function SpendingInput({
  categories,
  spending,
  onChange,
  onSubmit,
  onReset,
  calculating,
  error,
}: Props) {
  const totalEntered = Object.values(spending)
    .map((v) => Number.parseFloat(v.replace(/,/g, '')) || 0)
    .reduce((a, b) => a + b, 0);

  return (
    <div className="bg-white rounded-[26px] border border-neutral-200 px-5 pt-4 pb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-400">Monthly Spending</p>
          <h2 className="text-lg font-semibold text-neutral-900 mt-0.5 tracking-tight">Your basket</h2>
        </div>
        {totalEntered > 0 && (
          <span
            className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 tabular-nums"
            title={`Total: ${formatSgdFull(totalEntered)}`}
          >
            {formatSgdCompact(totalEntered)}/mo
          </span>
        )}
      </div>

      {/* 2-column input grid */}
      <div className="grid grid-cols-2 gap-2">
        {categories.map((cat) => {
          const label = DISPLAY_LABELS[cat.series_name] ?? cat.series_name;
          const hint = PLACEHOLDER_HINTS[cat.series_name] ?? '0';
          const rate = cat.latest_inflation_rate;
          const hasValue = Boolean(spending[cat.series_name]);

          return (
            <div
              key={cat.id}
              className={`rounded-xl border px-3 py-2 flex flex-col gap-1.5 transition-colors duration-200 ${hasValue ? 'border-indigo-100 bg-indigo-50/40' : 'border-neutral-100 bg-[#f7f7f8]'}`}
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <label
                  htmlFor={`cat-${cat.id}`}
                  className="text-xs font-medium text-neutral-700 leading-none truncate"
                  title={cat.series_name}
                >
                  {label}
                </label>
                {rate !== null && (
                  <span className={`text-[10px] font-mono tabular-nums flex-shrink-0 ${severityTextClass(inflationSeverity(rate))}`}>
                    {rate >= 0 ? '+' : ''}{rate.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none">S$</span>
                <input
                  id={`cat-${cat.id}`}
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.]?[0-9]*"
                  maxLength={10}
                  value={spending[cat.series_name] ?? ''}
                  placeholder={hint}
                  onChange={(e) => onChange(cat.series_name, sanitizeSpendingInput(e.target.value))}
                  title={spending[cat.series_name]
                    ? `${formatSgdFull(Number.parseFloat(spending[cat.series_name]))}`
                    : `Placeholder: S$${hint}`}
                  className="w-full pl-6 pr-2 py-1.5 border border-neutral-200 rounded-lg bg-white text-xs tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all duration-150"
                />
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">{error}</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={onSubmit}
          disabled={calculating}
          className={`${primaryActionButtonClass} flex-1`}
        >
          {calculating ? 'Calculating…' : 'Calculate My Inflation'}
        </button>
        <button
          onClick={onReset}
          className={secondaryActionButtonClass}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
