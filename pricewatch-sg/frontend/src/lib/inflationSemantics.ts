export const SAFE_INFLATION_MAX = 2;
export const BAD_INFLATION_MIN = 4;

export type Severity = 'good' | 'caution' | 'bad' | 'neutral';

/**
 * Global inflation severity rule used across the UI.
 * Negative or low inflation means lower price pressure, mid-range inflation is caution,
 * and high inflation is high pressure.
 */
export function inflationSeverity(rate: number | null | undefined): Severity {
  if (rate === null || rate === undefined) return 'neutral';
  if (rate > BAD_INFLATION_MIN) return 'bad';
  if (rate > SAFE_INFLATION_MAX) return 'caution';
  return 'good';
}

/**
 * For personal-vs-national delta:
 * <= 0 indicates lower-or-equal price pressure versus national CPI,
 * small positive is caution, and large positive is high pressure.
 */
export function diffSeverity(diff: number | null | undefined): Severity {
  if (diff === null || diff === undefined) return 'neutral';
  if (diff > 0.5) return 'bad';
  if (diff > 0) return 'caution';
  return 'good';
}

export function severityTextClass(severity: Severity): string {
  switch (severity) {
    case 'good':
      return 'text-emerald-600';
    case 'caution':
      return 'text-amber-500';
    case 'bad':
      return 'text-red-500';
    default:
      return 'text-neutral-400';
  }
}

export function severityBgBorderClass(severity: Severity): string {
  switch (severity) {
    case 'good':
      return 'bg-emerald-50 border-emerald-100';
    case 'caution':
      return 'bg-amber-50 border-amber-100';
    case 'bad':
      return 'bg-red-50 border-red-100';
    default:
      return 'bg-neutral-100 border-neutral-200';
  }
}
