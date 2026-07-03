"""
Personal Inflation Calculator
------------------------------
Computes a user's personal inflation rate as a spending-weighted average
of category-level CPI rates.

Formula
-------
    personal_inflation = Σ (weight_i × category_rate_i)
  where:
    weight_i         = user_spending_i / total_spending
        category_rate_i  = latest CPI percent-change value from SingStat
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import CPIMonthlyIndex, CPISeries

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class CategoryBreakdown:
    """Inflation impact for one spending category."""
    category: str
    spending: float                  # monthly SGD amount
    weight: float                    # fraction of total spending
    inflation_rate: Optional[float]  # YoY %, None if insufficient data
    contribution: Optional[float]    # weight × inflation_rate


@dataclass
class InflationResult:
    """Full output from the personal inflation calculation."""
    personal_inflation_rate: Optional[float]
    national_inflation_rate: Optional[float]
    total_monthly_spending: float
    period: str                               # e.g. "2025 Mar"
    category_breakdown: list[CategoryBreakdown] = field(default_factory=list)
    projected_annual_spending: Optional[float] = None
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Core calculation
# ---------------------------------------------------------------------------

async def calculate_personal_inflation(
    session: AsyncSession,
    spending: dict[str, float],
) -> InflationResult:
    """Compute personal inflation from a {category_name: monthly_sgd} mapping.

    Args:
        session:  AsyncSession — injected by FastAPI dependency.
        spending: Dict mapping CPI series name to monthly SGD spending.

    Returns:
        InflationResult with personal rate, national rate, and breakdown.

    Raises:
        ValueError: if the spending map is empty or all zeros.
    """
    if not spending or all(v <= 0 for v in spending.values()):
        raise ValueError("Spending profile must contain at least one positive value.")

    total = sum(v for v in spending.values() if v > 0)
    breakdown: list[CategoryBreakdown] = []
    warnings: list[str] = []
    latest_period_str = "unknown"

    for series_name, amount in spending.items():
        if amount <= 0:
            continue

        # Resolve series from DB
        res = await session.execute(
            select(CPISeries).where(CPISeries.series_name == series_name)
        )
        series = res.scalar_one_or_none()
        if series is None:
            warnings.append(
                f"Category '{series_name}' not found in CPI database — skipped."
            )
            continue

        latest_rate, period = await _get_latest_rate(session, series.id)

        if period:
            latest_period_str = _period_label(period)

        inflation: Optional[float] = None
        contribution: Optional[float] = None

        if latest_rate is not None:
            inflation = round(latest_rate, 2)
            contribution = round((amount / total) * inflation, 3)
        else:
            warnings.append(
                f"Insufficient data for '{series_name}' - inflation rate unavailable."
            )

        breakdown.append(
            CategoryBreakdown(
                category=series_name,
                spending=amount,
                weight=round(amount / total, 4),
                inflation_rate=inflation,
                contribution=contribution,
            )
        )

    # Personal rate = sum of weighted contributions
    valid = [b for b in breakdown if b.contribution is not None]
    personal_rate: Optional[float] = round(sum(b.contribution for b in valid), 2) if valid else None

    # National rate from "All Items"
    national_rate: Optional[float] = await _national_inflation(session)

    # Projected annual spending using personal inflation rate
    projected: Optional[float] = None
    if personal_rate is not None:
        projected = round(total * 12 * (1 + personal_rate / 100), 2)

    return InflationResult(
        personal_inflation_rate=personal_rate,
        national_inflation_rate=national_rate,
        total_monthly_spending=round(total, 2),
        period=latest_period_str,
        category_breakdown=sorted(
            breakdown, key=lambda b: -(b.contribution or 0)
        ),
        projected_annual_spending=projected,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _national_inflation(session: AsyncSession) -> Optional[float]:
    """Return the latest inflation rate for the 'All Items' aggregate."""
    res = await session.execute(
        select(CPISeries).where(CPISeries.series_name == "All Items")
    )
    nat = res.scalar_one_or_none()
    if nat is None:
        return None
    rate, _ = await _get_latest_rate(session, nat.id)
    return round(rate, 2) if rate is not None else None


async def _get_latest_rate(
    session: AsyncSession,
    series_id: int,
) -> tuple[Optional[float], Optional[tuple[int, int]]]:
    """Fetch the latest available CPI rate and its period for a series."""
    result = await session.execute(
        select(CPIMonthlyIndex)
        .where(CPIMonthlyIndex.series_id == series_id)
        .order_by(CPIMonthlyIndex.year.desc(), CPIMonthlyIndex.month.desc())
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    if latest is None:
        return None, None
    return latest.index_value, (latest.year, latest.month)


def _period_label(period: tuple[int, int]) -> str:
    """Convert stored period key to UI label.

    CPI benchmark tables are half-yearly and stored as:
      month=1 -> 1H
      month=7 -> 2H
    """
    year, month = period
    if month == 1:
        return f"{year} 1H"
    if month == 7:
        return f"{year} 2H"
    return f"{year} {datetime(year, month, 1).strftime('%b')}"
