export function formatPeriodLabel(period: string | null | undefined): string {
  if (!period) return 'N/A';

  const halfYearMatch = period.match(/^(\d{4})\s*(1H|2H)$/i);
  if (halfYearMatch) {
    const year = halfYearMatch[1];
    const half = halfYearMatch[2].toUpperCase();
    return half === '1H' ? `Jan-Jun ${year}` : `Jul-Dec ${year}`;
  }

  return period;
}
