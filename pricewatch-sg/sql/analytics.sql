-- PriceWatch SG -- Analytical Queries
-- Run directly against the PostgreSQL database.
-- Requires the application to have completed at least one CPI ingestion run.
--
-- Tables:
--   cpi_series            id, series_name, is_user_facing
--   cpi_monthly_index     series_id, year, month, index_value (YoY % change)
--   data_ingestion_log    ingested_at, success, series_fetched, records_stored
--   user_spending_profiles session_id, created_at
--   user_spending_items   profile_id, series_id, monthly_spending
--   monthly_spending_logs session_id, year, month
--   monthly_spending_items log_id, series_id, monthly_spending


-- ============================================================
-- 1. Category inflation trend with period-over-period delta
--    Window: LAG to compare each period against the previous one
-- ============================================================

WITH ordered_rates AS (
    SELECT
        s.series_name,
        m.year,
        m.month,
        m.index_value                                              AS inflation_rate,
        LAG(m.index_value) OVER (
            PARTITION BY s.id
            ORDER BY m.year, m.month
        )                                                          AS prev_rate
    FROM cpi_monthly_index m
    JOIN cpi_series s ON s.id = m.series_id
    WHERE s.is_user_facing = TRUE
)
SELECT
    series_name,
    year,
    month,
    inflation_rate,
    prev_rate,
    ROUND((inflation_rate - prev_rate)::numeric, 3)                AS period_delta,
    CASE
        WHEN inflation_rate > prev_rate THEN 'accelerating'
        WHEN inflation_rate < prev_rate THEN 'decelerating'
        ELSE 'stable'
    END                                                            AS trend
FROM ordered_rates
WHERE prev_rate IS NOT NULL
ORDER BY year DESC, month DESC, ABS(inflation_rate - prev_rate) DESC;


-- ============================================================
-- 2. Category ranking by latest inflation rate
--    Window: RANK and DENSE_RANK over the most recent period
-- ============================================================

WITH latest_period AS (
    SELECT MAX(year) AS yr, MAX(month) AS mo
    FROM cpi_monthly_index
),
latest_rates AS (
    SELECT
        s.series_name,
        m.index_value AS inflation_rate
    FROM cpi_monthly_index m
    JOIN cpi_series s       ON s.id = m.series_id
    JOIN latest_period lp   ON m.year = lp.yr AND m.month = lp.mo
    WHERE s.is_user_facing = TRUE
)
SELECT
    series_name,
    inflation_rate,
    RANK()       OVER (ORDER BY inflation_rate DESC)               AS rank_desc,
    DENSE_RANK() OVER (ORDER BY inflation_rate DESC)               AS dense_rank,
    PERCENT_RANK() OVER (ORDER BY inflation_rate DESC)             AS pct_rank,
    NTILE(4)     OVER (ORDER BY inflation_rate DESC)               AS quartile
FROM latest_rates
ORDER BY inflation_rate DESC;


-- ============================================================
-- 3. Rolling 3-period average inflation per category
--    Window: AVG with ROWS BETWEEN frame
-- ============================================================

SELECT
    s.series_name,
    m.year,
    m.month,
    m.index_value                                                  AS inflation_rate,
    ROUND(
        AVG(m.index_value) OVER (
            PARTITION BY s.id
            ORDER BY m.year, m.month
            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
        )::numeric,
        3
    )                                                              AS rolling_3pd_avg,
    ROUND(
        AVG(m.index_value) OVER (
            PARTITION BY s.id
            ORDER BY m.year, m.month
        )::numeric,
        3
    )                                                              AS cumulative_avg
FROM cpi_monthly_index m
JOIN cpi_series s ON s.id = m.series_id
WHERE s.is_user_facing = TRUE
ORDER BY s.series_name, m.year, m.month;


-- ============================================================
-- 4. User spending distribution: share of wallet per category
--    Aggregation with running total via SUM() OVER
-- ============================================================

WITH session_totals AS (
    SELECT
        p.session_id,
        SUM(i.monthly_spending)                                    AS total_spending
    FROM user_spending_profiles p
    JOIN user_spending_items i ON i.profile_id = p.id
    GROUP BY p.session_id
),
category_spend AS (
    SELECT
        p.session_id,
        s.series_name                                              AS category,
        i.monthly_spending,
        SUM(i.monthly_spending) OVER (PARTITION BY p.session_id)   AS session_total
    FROM user_spending_profiles p
    JOIN user_spending_items i  ON i.profile_id = p.id
    JOIN cpi_series s           ON s.id = i.series_id
)
SELECT
    session_id,
    category,
    ROUND(monthly_spending::numeric, 2)                            AS spending_sgd,
    ROUND((monthly_spending / session_total * 100)::numeric, 2)    AS pct_of_wallet,
    ROUND(
        SUM(monthly_spending) OVER (
            PARTITION BY session_id
            ORDER BY monthly_spending DESC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::numeric,
        2
    )                                                              AS cumulative_spend
FROM category_spend
ORDER BY session_id, monthly_spending DESC;


-- ============================================================
-- 5. Most inflation-pressured categories across all user sessions
--    JOIN user spending against live CPI rates to find weighted impact
-- ============================================================

WITH latest_period AS (
    SELECT MAX(year) AS yr, MAX(month) AS mo FROM cpi_monthly_index
),
session_weights AS (
    SELECT
        p.session_id,
        s.series_name                                              AS category,
        s.id                                                       AS series_id,
        i.monthly_spending,
        SUM(i.monthly_spending) OVER (PARTITION BY p.session_id)   AS session_total
    FROM user_spending_profiles p
    JOIN user_spending_items i  ON i.profile_id = p.id
    JOIN cpi_series s           ON s.id = i.series_id
),
weighted_inflation AS (
    SELECT
        w.category,
        w.monthly_spending / NULLIF(w.session_total, 0)            AS weight,
        m.index_value                                              AS category_rate,
        (w.monthly_spending / NULLIF(w.session_total, 0))
            * m.index_value                                        AS weighted_contribution
    FROM session_weights w
    JOIN cpi_monthly_index m ON m.series_id = w.series_id
    JOIN latest_period lp    ON m.year = lp.yr AND m.month = lp.mo
)
SELECT
    category,
    ROUND(AVG(weight)::numeric, 4)                                 AS avg_user_weight,
    ROUND(AVG(category_rate)::numeric, 3)                          AS cpi_rate,
    ROUND(AVG(weighted_contribution)::numeric, 4)                  AS avg_personal_contribution,
    COUNT(*)                                                       AS sessions_tracked
FROM weighted_inflation
GROUP BY category
HAVING COUNT(*) >= 1
ORDER BY avg_personal_contribution DESC;


-- ============================================================
-- 6. ETL pipeline audit: ingestion success rate and throughput
--    Aggregation with FILTER clause and date truncation
-- ============================================================

SELECT
    DATE_TRUNC('month', ingested_at)                               AS month,
    COUNT(*)                                                       AS total_runs,
    COUNT(*) FILTER (WHERE success = TRUE)                         AS successful_runs,
    COUNT(*) FILTER (WHERE success = FALSE)                        AS failed_runs,
    ROUND(
        COUNT(*) FILTER (WHERE success = TRUE)::numeric / COUNT(*) * 100,
        1
    )                                                              AS success_rate_pct,
    SUM(series_fetched)                                            AS total_series_fetched,
    SUM(records_stored)                                            AS total_records_stored,
    ROUND(AVG(records_stored)::numeric, 0)                         AS avg_records_per_run
FROM data_ingestion_log
GROUP BY DATE_TRUNC('month', ingested_at)
ORDER BY month DESC;


-- ============================================================
-- 7. Identify periods where personal inflation exceeded national CPI
--    CTE chain: compute national rate, then compare against category rates
-- ============================================================

WITH national_rates AS (
    -- "All Items" is the SingStat headline national CPI series
    SELECT
        m.year,
        m.month,
        m.index_value AS national_rate
    FROM cpi_monthly_index m
    JOIN cpi_series s ON s.id = m.series_id
    WHERE s.series_name = 'All Items'
),
category_rates AS (
    SELECT
        m.year,
        m.month,
        s.series_name,
        m.index_value AS category_rate
    FROM cpi_monthly_index m
    JOIN cpi_series s ON s.id = m.series_id
    WHERE s.is_user_facing = TRUE
),
comparison AS (
    SELECT
        c.series_name,
        c.year,
        c.month,
        c.category_rate,
        n.national_rate,
        ROUND((c.category_rate - n.national_rate)::numeric, 3)     AS gap_vs_national
    FROM category_rates c
    JOIN national_rates n USING (year, month)
)
SELECT
    series_name,
    year,
    month,
    category_rate,
    national_rate,
    gap_vs_national,
    CASE
        WHEN gap_vs_national > 0.5  THEN 'significantly above national'
        WHEN gap_vs_national > 0    THEN 'above national'
        WHEN gap_vs_national = 0    THEN 'at national'
        WHEN gap_vs_national > -0.5 THEN 'below national'
        ELSE 'significantly below national'
    END                                                            AS pressure_label
FROM comparison
ORDER BY year DESC, month DESC, ABS(gap_vs_national) DESC;
