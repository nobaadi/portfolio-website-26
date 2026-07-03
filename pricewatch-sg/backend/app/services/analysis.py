"""Analysis and simulation helpers for inflation insight endpoints."""
from __future__ import annotations

import json
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    CPIMonthlyIndex,
    CPISeries,
    MonthlySpendingItem,
    MonthlySpendingLog,
    UserSpendingItem,
    UserSpendingProfile,
)
from app.services.calculator import calculate_personal_inflation, _period_label


def _clean_spending(spending: dict[str, float]) -> dict[str, float]:
    """Keep only positive numeric spending values."""
    cleaned: dict[str, float] = {}
    for category, amount in spending.items():
        if amount is None:
            continue
        value = float(amount)
        if value > 0:
            cleaned[category] = value
    return cleaned


def parse_spending_json(spending_json: str | None) -> dict[str, float] | None:
    """Parse a JSON-encoded spending map from query params.

    Expected shape: {"Food": 500, "Housing & Utilities": 1200}
    """
    if not spending_json:
        return None

    try:
        raw = json.loads(spending_json)
    except json.JSONDecodeError as exc:
        raise ValueError("spending_json must be valid JSON.") from exc

    if not isinstance(raw, dict):
        raise ValueError("spending_json must be an object mapping category to amount.")

    parsed: dict[str, float] = {}
    for key, value in raw.items():
        if not isinstance(key, str):
            continue
        if not isinstance(value, (int, float)):
            continue
        parsed[key] = float(value)

    cleaned = _clean_spending(parsed)
    if not cleaned:
        raise ValueError("spending_json must include at least one positive spending value.")
    return cleaned


async def load_spending_for_session(
    session: AsyncSession,
    session_id: str,
) -> dict[str, float]:
    """Load best available spending profile for a session.

    Priority:
      1) Latest ``UserSpendingProfile``
      2) Latest saved monthly log
    """
    if not session_id:
        return {}

    profile_res = await session.execute(
        select(UserSpendingProfile)
        .where(UserSpendingProfile.session_id == session_id)
        .order_by(desc(UserSpendingProfile.created_at))
        .limit(1)
    )
    profile = profile_res.scalar_one_or_none()
    if profile is not None:
        profile_items_res = await session.execute(
            select(CPISeries.series_name, UserSpendingItem.monthly_spending)
            .join(CPISeries, CPISeries.id == UserSpendingItem.series_id)
            .where(UserSpendingItem.profile_id == profile.id)
        )
        profile_spending = {
            category: amount
            for category, amount in profile_items_res.all()
            if amount and amount > 0
        }
        cleaned_profile_spending = _clean_spending(profile_spending)
        if cleaned_profile_spending:
            return cleaned_profile_spending

    monthly_res = await session.execute(
        select(MonthlySpendingLog)
        .where(MonthlySpendingLog.session_id == session_id)
        .order_by(desc(MonthlySpendingLog.year), desc(MonthlySpendingLog.month))
        .limit(1)
    )
    monthly = monthly_res.scalar_one_or_none()
    if monthly is None:
        return {}

    monthly_items_res = await session.execute(
        select(CPISeries.series_name, MonthlySpendingItem.monthly_spending)
        .join(CPISeries, CPISeries.id == MonthlySpendingItem.series_id)
        .where(MonthlySpendingItem.log_id == monthly.id)
    )
    monthly_spending = {
        category: amount
        for category, amount in monthly_items_res.all()
        if amount and amount > 0
    }
    return _clean_spending(monthly_spending)


async def resolve_spending_input(
    session: AsyncSession,
    *,
    session_id: str | None,
    spending_json: str | None,
) -> dict[str, float]:
    """Resolve spending from query JSON first, then session lookup."""
    from_query = parse_spending_json(spending_json)
    if from_query is not None:
        return from_query

    if session_id:
        from_session = await load_spending_for_session(session, session_id)
        if from_session:
            return from_session

    return {}


async def build_inflation_drivers(
    session: AsyncSession,
    spending: dict[str, float],
) -> dict:
    """Decompose the gap between personal and national inflation by category."""
    cleaned = _clean_spending(spending)
    if not cleaned:
        raise ValueError("Spending input must contain at least one positive amount.")

    result = await calculate_personal_inflation(session, cleaned)
    national_rate = result.national_inflation_rate if result.national_inflation_rate is not None else 0.0

    drivers: list[dict] = []
    for row in result.category_breakdown:
        if row.inflation_rate is None or row.contribution is None:
            continue

        national_contribution = round(row.weight * national_rate, 3)
        diff_contribution = round(row.contribution - national_contribution, 3)
        direction = "above" if diff_contribution >= 0 else "below"

        explanation = (
            f"{row.category} inflation is {row.inflation_rate:.1f}% and represents "
            f"{row.weight * 100:.0f}% of your spending, putting {abs(diff_contribution):.2f} "
            f"percentage points {direction} national CPI contribution."
        )

        drivers.append(
            {
                "category": row.category,
                "contribution": diff_contribution,
                "explanation": explanation,
                "user_weight": round(row.weight, 4),
                "category_inflation_rate": round(row.inflation_rate, 2),
                "personal_contribution": round(row.contribution, 3),
                "national_contribution": national_contribution,
            }
        )

    drivers.sort(key=lambda item: abs(item["contribution"]), reverse=True)

    return {
        "personal_inflation": result.personal_inflation_rate,
        "national_cpi": result.national_inflation_rate,
        "difference": (
            round(result.personal_inflation_rate - result.national_inflation_rate, 2)
            if result.personal_inflation_rate is not None and result.national_inflation_rate is not None
            else None
        ),
        "drivers": drivers,
        "period": result.period,
    }


async def build_household_comparison(
    session: AsyncSession,
    spending: dict[str, float],
) -> dict:
    """Compare personal inflation against national CPI with plain-language reasons."""
    payload = await build_inflation_drivers(session, spending)
    difference = payload["difference"]
    drivers = payload["drivers"]

    positive_reasons = [d for d in drivers if d["contribution"] > 0][:2]
    negative_reasons = [d for d in drivers if d["contribution"] < 0][:2]

    if difference is None:
        summary = "Unable to compare due to insufficient inflation data."
        reasons: list[str] = []
    elif difference > 0:
        summary = "You are above national inflation."
        reasons = [
            f"higher {d['category'].lower()} impact (+{d['contribution']:.2f} pp)"
            for d in positive_reasons
        ]
    elif difference < 0:
        summary = "You are below national inflation."
        reasons = [
            f"lower {d['category'].lower()} impact ({d['contribution']:.2f} pp)"
            for d in negative_reasons
        ]
    else:
        summary = "You are aligned with national inflation."
        reasons = []

    return {
        "your_inflation": payload["personal_inflation"],
        "national_cpi": payload["national_cpi"],
        "difference": difference,
        "summary": summary,
        "reasons": reasons,
        "period": payload["period"],
    }


async def build_inflation_trend(
    session: AsyncSession,
    spending: dict[str, float],
    limit: int = 24,
) -> list[dict]:
    """Compute historical personal inflation trend using fixed spending weights."""
    cleaned = _clean_spending(spending)
    if not cleaned:
        raise ValueError("Spending input must contain at least one positive amount.")

    tracked_categories = list(cleaned.keys())
    series_res = await session.execute(
        select(CPISeries.id, CPISeries.series_name).where(
            CPISeries.series_name.in_(tracked_categories + ["All Items"])
        )
    )

    series_map: dict[str, int] = {name: sid for sid, name in series_res.all()}
    national_id = series_map.get("All Items")
    if national_id is None:
        raise ValueError("National CPI series (All Items) is unavailable.")

    category_ids: list[int] = []
    total = 0.0
    for category, amount in cleaned.items():
        sid = series_map.get(category)
        if sid is None:
            continue
        category_ids.append(sid)
        total += amount

    if total <= 0 or not category_ids:
        raise ValueError("No matching CPI categories found for the provided spending.")

    weights_by_id: dict[int, float] = {
        series_map[category]: amount / total
        for category, amount in cleaned.items()
        if category in series_map
    }

    index_res = await session.execute(
        select(
            CPIMonthlyIndex.series_id,
            CPIMonthlyIndex.year,
            CPIMonthlyIndex.month,
            CPIMonthlyIndex.index_value,
        )
        .where(CPIMonthlyIndex.series_id.in_(category_ids + [national_id]))
        .order_by(CPIMonthlyIndex.year, CPIMonthlyIndex.month)
    )

    rates_by_series: dict[int, dict[tuple[int, int], float]] = {}
    for series_id, year, month, index_value in index_res.all():
        series_rates = rates_by_series.setdefault(series_id, {})
        series_rates[(year, month)] = float(index_value)

    national_rates = rates_by_series.get(national_id, {})
    if not national_rates:
        raise ValueError("No historical national CPI data available.")

    points: list[dict] = []
    for period in sorted(national_rates.keys()):
        if any(period not in rates_by_series.get(sid, {}) for sid in category_ids):
            continue

        personal_rate = sum(
            weights_by_id[sid] * rates_by_series[sid][period]
            for sid in category_ids
            if sid in weights_by_id
        )

        points.append(
            {
                "period": _period_label(period),
                "personal_inflation": round(personal_rate, 3),
                "national_cpi": round(national_rates[period], 3),
                "year": period[0],
                "month": period[1],
            }
        )

    if limit > 0:
        points = points[-limit:]
    return points


async def detect_inflation_anomalies(
    session: AsyncSession,
    z_threshold: float = 2.0,
    min_periods: int = 6,
) -> dict:
    """
    Z-score anomaly detection across CPI categories.

    For each user-facing category, computes the mean and std of all historical
    index_value entries. A category is flagged when:
        z = (current_rate - historical_mean) / historical_std > z_threshold

    Parameters
    ----------
    z_threshold : float
        Number of standard deviations above the historical mean required to
        flag a category. Default 2.0 (roughly the 97.7th percentile assuming
        a normal distribution of rates).
    min_periods : int
        Minimum historical periods required to compute a meaningful z-score.
        Categories with fewer records are skipped to avoid false positives
        from insufficient data.
    """
    import math

    series_res = await session.execute(
        select(CPISeries.id, CPISeries.series_name).where(CPISeries.is_user_facing == True)  # noqa: E712
    )
    series_map: dict[int, str] = {sid: name for sid, name in series_res.all()}

    if not series_map:
        return {"flagged": [], "checked": 0, "threshold": z_threshold}

    index_res = await session.execute(
        select(
            CPIMonthlyIndex.series_id,
            CPIMonthlyIndex.year,
            CPIMonthlyIndex.month,
            CPIMonthlyIndex.index_value,
        ).where(CPIMonthlyIndex.series_id.in_(list(series_map.keys())))
        .order_by(CPIMonthlyIndex.series_id, CPIMonthlyIndex.year, CPIMonthlyIndex.month)
    )

    # Group by series
    rates_by_series: dict[int, list[tuple[tuple[int, int], float]]] = {}
    for series_id, year, month, index_value in index_res.all():
        rates_by_series.setdefault(series_id, []).append(((year, month), float(index_value)))

    flagged: list[dict] = []
    checked = 0

    for series_id, name in series_map.items():
        entries = rates_by_series.get(series_id, [])
        if len(entries) < min_periods:
            continue
        checked += 1

        values = [v for _, v in entries]
        current_period, current_rate = entries[-1]

        # Exclude current period from the historical baseline so the z-score
        # is not anchored on the value being tested
        historical = values[:-1]
        n = len(historical)
        mean = sum(historical) / n
        variance = sum((x - mean) ** 2 for x in historical) / n
        std = math.sqrt(variance)

        if std == 0:
            continue

        z_score = (current_rate - mean) / std

        if z_score >= z_threshold:
            flagged.append(
                {
                    "category": name,
                    "current_rate": round(current_rate, 3),
                    "historical_mean": round(mean, 3),
                    "historical_std": round(std, 3),
                    "z_score": round(z_score, 3),
                    "periods_analysed": n,
                    "current_period": _period_label(current_period),
                    "above_mean_by": round(current_rate - mean, 3),
                }
            )

    flagged.sort(key=lambda x: x["z_score"], reverse=True)

    return {
        "flagged": flagged,
        "checked": checked,
        "threshold": z_threshold,
        "note": (
            f"Categories where the latest inflation rate is >= {z_threshold} standard "
            "deviations above their historical mean (excluding current period from baseline)."
        ),
    }


async def run_lifestyle_simulation(
    session: AsyncSession,
    base_spending: dict[str, float],
    category_changes: dict[str, float],
) -> dict:
    """Apply category spending deltas and recalculate inflation."""
    cleaned_base = _clean_spending(base_spending)
    if not cleaned_base:
        raise ValueError("Base spending must contain at least one positive amount.")

    adjusted = dict(cleaned_base)
    applied_changes: dict[str, float] = {}

    for category, delta in category_changes.items():
        if category not in adjusted:
            continue
        base_amount = adjusted[category]
        simulated = max(base_amount * (1 + float(delta)), 0.0)
        adjusted[category] = round(simulated, 2)
        applied_changes[category] = float(delta)

    base_result = await calculate_personal_inflation(session, cleaned_base)
    simulated_result = await calculate_personal_inflation(session, adjusted)

    return {
        "base_personal_inflation": base_result.personal_inflation_rate,
        "new_personal_inflation": simulated_result.personal_inflation_rate,
        "change_in_personal_inflation": (
            round(
                (simulated_result.personal_inflation_rate or 0)
                - (base_result.personal_inflation_rate or 0),
                2,
            )
            if simulated_result.personal_inflation_rate is not None
            and base_result.personal_inflation_rate is not None
            else None
        ),
        "updated_total_monthly_spending": simulated_result.total_monthly_spending,
        "applied_changes": applied_changes,
        "updated_spending": adjusted,
        "updated_category_breakdown": [
            {
                "category": row.category,
                "spending": row.spending,
                "weight": row.weight,
                "inflation_rate": row.inflation_rate,
                "contribution": row.contribution,
            }
            for row in simulated_result.category_breakdown
        ],
    }
