"""Analysis endpoints for insights derived from user spending and CPI data."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.analysis import (
    build_household_comparison,
    build_inflation_drivers,
    build_inflation_trend,
    detect_inflation_anomalies,
    resolve_spending_input,
)

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/inflation-drivers")
async def get_inflation_drivers(
    session_id: Optional[str] = Query(
        default=None,
        description="Saved session id. Optional when spending_json is provided.",
    ),
    spending_json: Optional[str] = Query(
        default=None,
        description="JSON-encoded spending map, e.g. {\"Food\":500}",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Return top category drivers behind personal vs national inflation gap."""
    try:
        spending = await resolve_spending_input(
            db,
            session_id=session_id,
            spending_json=spending_json,
        )
        if not spending:
            raise ValueError(
                "Provide spending_json or a valid session_id with saved spending profile."
            )
        return await build_inflation_drivers(db, spending)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/household-comparison")
async def get_household_comparison(
    session_id: Optional[str] = Query(
        default=None,
        description="Saved session id. Optional when spending_json is provided.",
    ),
    spending_json: Optional[str] = Query(
        default=None,
        description="JSON-encoded spending map, e.g. {\"Food\":500}",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Compare user inflation against national CPI with plain-language reasons."""
    try:
        spending = await resolve_spending_input(
            db,
            session_id=session_id,
            spending_json=spending_json,
        )
        if not spending:
            raise ValueError(
                "Provide spending_json or a valid session_id with saved spending profile."
            )
        return await build_household_comparison(db, spending)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/inflation-trend")
async def get_inflation_trend(
    session_id: Optional[str] = Query(
        default=None,
        description="Saved session id. Optional when spending_json is provided.",
    ),
    spending_json: Optional[str] = Query(
        default=None,
        description="JSON-encoded spending map, e.g. {\"Food\":500}",
    ),
    limit: int = Query(
        default=24,
        ge=1,
        le=120,
        description="Number of most recent points to return.",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Return historical personal-vs-national inflation trend points."""
    try:
        spending = await resolve_spending_input(
            db,
            session_id=session_id,
            spending_json=spending_json,
        )
        if not spending:
            raise ValueError(
                "Provide spending_json or a valid session_id with saved spending profile."
            )
        return await build_inflation_trend(db, spending, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/anomalies")
async def get_inflation_anomalies(
    z_threshold: float = Query(
        default=2.0,
        ge=0.5,
        le=5.0,
        description=(
            "Number of standard deviations above the historical mean required to flag "
            "a category. Default 2.0 (approximately the top 2.3% of the historical "
            "distribution assuming normality)."
        ),
    ),
    min_periods: int = Query(
        default=6,
        ge=3,
        le=60,
        description="Minimum historical periods required to compute a z-score.",
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Detect CPI categories with anomalously high inflation.

    For each user-facing CPI category, computes a z-score comparing the
    latest recorded inflation rate against the category's historical
    distribution (all prior periods). Categories where the z-score exceeds
    `z_threshold` are flagged and returned with their anomaly score,
    historical baseline statistics, and the magnitude of deviation.

    Returns an empty `flagged` list when no categories are anomalous.
    """
    try:
        return await detect_inflation_anomalies(
            db,
            z_threshold=z_threshold,
            min_periods=min_periods,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
