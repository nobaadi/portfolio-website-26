// Shared TypeScript interfaces for the Personal Inflation Tracker frontend.

export interface CPICategory {
  id: number;
  series_name: string;
  unit: string;
  latest_inflation_rate: number | null;
  latest_index: number | null;
  period: string | null;
}

export interface CategoryBreakdown {
  category: string;
  spending: number;
  weight: number;
  inflation_rate: number | null;
  contribution: number | null;
}

export interface InflationResult {
  personal_inflation_rate: number | null;
  national_inflation_rate: number | null;
  total_monthly_spending: number;
  projected_annual_spending: number | null;
  period: string;
  category_breakdown: CategoryBreakdown[];
  warnings: string[];
}

export interface LatestCPICategory {
  id: number;
  series_name: string;
  is_user_facing: boolean;
  latest_index: number | null;
  inflation_rate: number | null;
}

export interface LatestCPI {
  period: string;
  national: LatestCPICategory | null;
  categories: LatestCPICategory[];
}

export interface IngestionStatus {
  status?: string;
  ingested_at?: string;
  table_id?: string;
  benchmark_key?: string;
  benchmark_label?: string;
  series_fetched?: number;
  records_stored?: number;
  success?: boolean;
  error_message?: string | null;
}

export interface BenchmarkOption {
  key: string;
  label: string;
  table_id: string;
}

export interface BenchmarkResponse {
  current: BenchmarkOption;
  options: BenchmarkOption[];
}

export interface MonthlySpendingLog {
  year: number;
  month: number;
  period: string;
  total_monthly_spending: number;
  spending: Record<string, number>;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyLogListResponse {
  session_id: string;
  logs: MonthlySpendingLog[];
}

export interface InflationDriver {
  category: string;
  contribution: number;
  explanation: string;
  user_weight: number;
  category_inflation_rate: number;
  personal_contribution: number;
  national_contribution: number;
}

export interface InflationDriversResponse {
  personal_inflation: number | null;
  national_cpi: number | null;
  difference: number | null;
  period: string;
  drivers: InflationDriver[];
}

export interface HouseholdComparisonResponse {
  your_inflation: number | null;
  national_cpi: number | null;
  difference: number | null;
  summary: string;
  reasons: string[];
  period: string;
}

export interface InflationTrendPoint {
  period: string;
  personal_inflation: number;
  national_cpi: number;
  year: number;
  month: number;
}

export interface LifestyleSimulationResponse {
  base_personal_inflation: number | null;
  new_personal_inflation: number | null;
  change_in_personal_inflation: number | null;
  updated_total_monthly_spending: number;
  applied_changes: Record<string, number>;
  updated_spending: Record<string, number>;
  updated_category_breakdown: CategoryBreakdown[];
}

// Spending state uses string values for controlled inputs,
// then parses to numbers before sending to the API.
export type SpendingFormValues = Record<string, string>;
