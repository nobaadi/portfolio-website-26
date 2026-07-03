/**
 * ActionRecommendations - practical next steps based on inflation drivers.
 */
import type { InflationResult } from '../types';

interface Props {
  result: InflationResult;
}

function formatSgd(amount: number): string {
  const safe = Math.max(amount, 0);
  if (!Number.isFinite(safe)) return 'S$0';
  if (safe >= 1_000_000_000_000) {
    return `S${new Intl.NumberFormat('en-SG', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(safe)}`;
  }
  return `S$${new Intl.NumberFormat('en-SG', {
    maximumFractionDigits: 0,
  }).format(safe)}`;
}

const MIN_MEANINGFUL_CONTRIBUTION_PP = 0.03;
const MIN_MEANINGFUL_SPENDING_SGD = 50;
const MIN_MEANINGFUL_WEIGHT = 0.03;
const QUICK_WIN_MAX_DRIVER_SHARE = 0.4;

export default function ActionRecommendations({ result }: Props) {
  const {
    personal_inflation_rate,
    national_inflation_rate,
    total_monthly_spending,
    category_breakdown,
  } = result;

  const rankedDrivers = category_breakdown
    .filter((b) => b.contribution !== null && b.inflation_rate !== null)
    .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0));

  const positiveDrivers = rankedDrivers
    .filter((b) => (b.contribution ?? 0) > 0 && (b.inflation_rate ?? 0) > 0)
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));

  const meaningfulPositiveDrivers = positiveDrivers.filter(
    (b) =>
      (b.contribution ?? 0) >= MIN_MEANINGFUL_CONTRIBUTION_PP &&
      b.spending >= MIN_MEANINGFUL_SPENDING_SGD &&
      b.weight >= MIN_MEANINGFUL_WEIGHT
  );

  const stabilizers = rankedDrivers
    .filter((b) => (b.contribution ?? 0) < 0)
    .sort((a, b) => (a.contribution ?? 0) - (b.contribution ?? 0));

  if (personal_inflation_rate === null || rankedDrivers.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 flex flex-col">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1 leading-none">Recommendations</p>
        <p className="text-xs font-semibold tracking-[0.01em] text-neutral-700 mb-3 leading-tight">Priority actions</p>
        <p className="text-xs text-neutral-500 mt-1">
          Add spending categories with valid CPI rates to unlock targeted recommendations.
        </p>
      </div>
    );
  }

  if (positiveDrivers.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 flex flex-col">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1 leading-none">Recommendations</p>
        <p className="text-xs font-semibold tracking-[0.01em] text-neutral-700 mb-3 leading-tight">Priority actions</p>

        <div className="space-y-2 flex-1">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
            <p className="text-[10px] text-emerald-700 font-medium mb-1 uppercase tracking-wide">Price pressure signal</p>
            <p className="text-xs text-emerald-800 break-normal leading-relaxed">
              Your basket currently shows low or negative price pressure across tracked CPI categories.
              This does not evaluate whether your spending amount is high or low.
            </p>
          </div>

          {stabilizers.length > 0 && (
            <div className="bg-[#edf0ff] border border-[#dfe4f8] rounded-xl p-2.5">
              <p className="text-[10px] text-[#5d6daf] font-medium mb-1 uppercase tracking-wide">Largest downward contributors</p>
              <p className="text-xs text-[#273152] break-normal leading-relaxed">
                {stabilizers
                  .slice(0, 3)
                  .map((d) => `${d.category} (${(d.contribution ?? 0).toFixed(2)} pp)`)
                  .join(' • ')}
              </p>
            </div>
          )}

          <p className="text-[10px] text-neutral-400 italic">
            Re-run this after a benchmark switch or spending update to spot new pressure points.
          </p>
        </div>
      </div>
    );
  }

  if (meaningfulPositiveDrivers.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-neutral-200 p-4 flex flex-col">
        <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1 leading-none">Recommendations</p>
        <p className="text-xs font-semibold tracking-[0.01em] text-neutral-700 mb-3 leading-tight">Priority actions</p>

        <div className="space-y-2 flex-1">
          <div className="bg-[#edf0ff] border border-[#dfe4f8] rounded-xl p-2.5">
            <p className="text-[10px] text-[#5d6daf] font-medium mb-1 uppercase tracking-wide">Current signal</p>
            <p className="text-xs text-[#273152] break-normal leading-relaxed">
              No single category is large enough right now for a meaningful cut recommendation.
              This logic uses contribution (weight × category inflation), not spending amount alone.
            </p>
          </div>

          {positiveDrivers.length > 0 && (
            <div className="bg-[#fff6df] border border-[#f5e8bf] rounded-xl p-2.5">
              <p className="text-[10px] text-[#8f6706] font-medium mb-1 uppercase tracking-wide">Small pressure points</p>
              <p className="text-xs text-[#7a5c11] break-normal leading-relaxed">
                {positiveDrivers
                  .slice(0, 3)
                  .map((d) => `${d.category} (+${(d.contribution ?? 0).toFixed(3)} pp)`)
                  .join(' • ')}
              </p>
            </div>
          )}

          <p className="text-[10px] text-neutral-400 italic">
            Recommendations appear once a driver is at least ~{MIN_MEANINGFUL_CONTRIBUTION_PP.toFixed(2)} pp and has material spend.
          </p>
        </div>
      </div>
    );
  }

  const topDrivers = meaningfulPositiveDrivers.slice(0, 3);
  const topDriver = topDrivers[0];

  // Approximation: reducing spend in one category by delta changes personal rate by
  // (delta / total_spending) * category_rate, assuming rates are unchanged.
  const targetReduction = 0.1;
  const cutForPointRaw =
    topDriver.inflation_rate && topDriver.inflation_rate > 0
      ? (total_monthly_spending * targetReduction) / topDriver.inflation_rate
      : null;
  const cutForPoint =
    cutForPointRaw !== null ? Math.min(cutForPointRaw, topDriver.spending) : null;
  const canTrimPointWithTopDriver =
    cutForPointRaw !== null && cutForPointRaw <= topDriver.spending;
  const cutShareOfDriver =
    cutForPointRaw !== null && topDriver.spending > 0
      ? cutForPointRaw / topDriver.spending
      : null;
  const quickWinIsPractical =
    canTrimPointWithTopDriver &&
    cutShareOfDriver !== null &&
    cutShareOfDriver <= QUICK_WIN_MAX_DRIVER_SHARE;
  const maxTrimFromTopDriver =
    topDriver.inflation_rate && total_monthly_spending > 0
      ? (topDriver.spending / total_monthly_spending) * topDriver.inflation_rate
      : 0;

  const gapToNational =
    national_inflation_rate !== null ? personal_inflation_rate - national_inflation_rate : null;

  const cutToMatchNationalRaw =
    gapToNational !== null &&
    gapToNational > 0 &&
    topDriver.inflation_rate &&
    topDriver.inflation_rate > 0
      ? (total_monthly_spending * gapToNational) / topDriver.inflation_rate
      : null;
  const cutToMatchNational =
    cutToMatchNationalRaw !== null ? Math.min(cutToMatchNationalRaw, topDriver.spending) : null;
  const canMatchNationalWithTopDriver =
    cutToMatchNationalRaw !== null && cutToMatchNationalRaw <= topDriver.spending;

  return (
    <div className="bg-white rounded-[20px] border border-neutral-200 p-4 flex flex-col">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-neutral-400 mb-1 leading-none">Recommendations</p>
      <p className="text-xs font-semibold tracking-[0.01em] text-neutral-700 mb-3 leading-tight">Priority actions</p>

      <div className="space-y-2 flex-1">
        <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 animate-slide-up" style={{ animationDelay: '0ms' }}>
          <p className="text-[10px] text-red-700 font-medium mb-1 uppercase tracking-wide">Biggest upward drivers</p>
          <p className="text-xs text-red-800 break-normal leading-relaxed">
            {topDrivers.map((d) => `${d.category} (+${(d.contribution ?? 0).toFixed(2)} pp)`).join(' • ')}
          </p>
        </div>

        {cutForPoint !== null && canTrimPointWithTopDriver && quickWinIsPractical && (
          <div className="bg-[#fff6df] border border-[#f5e8bf] rounded-xl p-2.5 animate-slide-up" style={{ animationDelay: '80ms' }}>
            <p className="text-[10px] text-[#8f6706] font-medium mb-1 uppercase tracking-wide">Quick win</p>
            <p className="text-xs text-[#7a5c11] break-normal leading-relaxed">
              Cut <strong>{topDriver.category}</strong> by ~<strong>{formatSgd(cutForPoint)}/mo</strong> to trim 0.1 pp from your rate.
            </p>
          </div>
        )}

        {cutForPoint !== null && (!canTrimPointWithTopDriver || !quickWinIsPractical) && (
          <div className="bg-[#fff6df] border border-[#f5e8bf] rounded-xl p-2.5 animate-slide-up" style={{ animationDelay: '80ms' }}>
            <p className="text-[10px] text-[#8f6706] font-medium mb-1 uppercase tracking-wide">Quick win check</p>
            {!canTrimPointWithTopDriver ? (
              <p className="text-xs text-[#7a5c11] break-normal leading-relaxed">
                <strong>{topDriver.category}</strong> spend is too small for a 0.1 pp move alone.
                Even reducing it to zero trims about <strong>{maxTrimFromTopDriver.toFixed(2)} pp</strong>.
              </p>
            ) : (
              <p className="text-xs text-[#7a5c11] break-normal leading-relaxed">
                A 0.1 pp move needs a large cut in <strong>{topDriver.category}</strong>
                {' '}(
                ~<strong>{formatSgd(cutForPoint)}/mo</strong>, about{' '}
                <strong>{Math.round((cutShareOfDriver ?? 0) * 100)}%</strong> of that category).
                Consider spreading smaller cuts across multiple categories.
              </p>
            )}
          </div>
        )}

        {cutToMatchNational !== null && canMatchNationalWithTopDriver && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 animate-slide-up" style={{ animationDelay: '160ms' }}>
            <p className="text-[10px] text-red-700 font-medium mb-1 uppercase tracking-wide">Align with national CPI pressure</p>
            <p className="text-xs text-red-800 break-normal leading-relaxed">
              <strong>{gapToNational?.toFixed(2)} pp</strong> above avg.
              cut ~<strong>{formatSgd(cutToMatchNational)}/mo</strong> from <strong>{topDriver.category}</strong>.
            </p>
          </div>
        )}

        {cutToMatchNational !== null && !canMatchNationalWithTopDriver && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 animate-slide-up" style={{ animationDelay: '160ms' }}>
            <p className="text-[10px] text-red-700 font-medium mb-1 uppercase tracking-wide">Align with national CPI pressure</p>
            <p className="text-xs text-red-800 break-normal leading-relaxed">
              Closing the full gap needs changes across multiple larger categories, not only <strong>{topDriver.category}</strong>.
            </p>
          </div>
        )}

        <p className="text-[10px] text-neutral-400 italic">
          Estimates assume current category rates are sustained. Guidance is about inflation pressure, not judging spending discipline.
        </p>
      </div>
    </div>
  );
}
