"""
User spending profile endpoints.

  POST /user/spending              — save or update a spending profile
  GET  /user/spending/{session_id} — retrieve a saved profile
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.models import (
    CPISeries,
    MonthlySpendingItem,
    MonthlySpendingLog,
    UserSpendingItem,
    UserSpendingProfile,
)

router = APIRouter(prefix="/user", tags=["user"])


class SpendingProfileInput(BaseModel):
    """Body for POST /user/spending."""
    session_id: str | None = None   # omit to generate a new session
    spending: dict[str, float]      # {cpi_series_name: monthly_sgd}


class MonthlyLogInput(BaseModel):
    """Body for POST /user/monthly-logs."""
    session_id: str | None = None
    year: int
    month: int
    spending: dict[str, float]

    @field_validator("year")
    @classmethod
    def validate_year(cls, value: int) -> int:
        if value < 2000 or value > 2100:
            raise ValueError("year must be between 2000 and 2100")
        return value

    @field_validator("month")
    @classmethod
    def validate_month(cls, value: int) -> int:
        if value < 1 or value > 12:
            raise ValueError("month must be between 1 and 12")
        return value


def _serialize_monthly_log(log: MonthlySpendingLog, spending: dict[str, float]) -> dict:
    total = sum(spending.values())
    return {
        "year": log.year,
        "month": log.month,
        "period": f"{log.year}-{log.month:02d}",
        "total_monthly_spending": total,
        "spending": spending,
        "created_at": log.created_at,
        "updated_at": log.updated_at,
    }


async def _load_monthly_log_spending(db: AsyncSession, log_id: int) -> dict[str, float]:
    rows = await db.execute(
        select(MonthlySpendingItem, CPISeries.series_name)
        .join(CPISeries, CPISeries.id == MonthlySpendingItem.series_id)
        .where(MonthlySpendingItem.log_id == log_id)
    )
    return {
        series_name: item.monthly_spending
        for item, series_name in rows.all()
    }


@router.post("/spending")
async def save_spending_profile(
    payload: SpendingProfileInput,
    db: AsyncSession = Depends(get_db),
):
    """Persist a spending profile and return the session token.

    If ``session_id`` is provided and a profile already exists for it,
    the existing profile is replaced entirely.  A new ``session_id`` is
    generated when the field is omitted.
    """
    session_id = payload.session_id or secrets.token_hex(16)

    # Drop any existing profile for this session
    existing_res = await db.execute(
        select(UserSpendingProfile)
        .where(UserSpendingProfile.session_id == session_id)
    )
    existing = existing_res.scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        await db.flush()

    profile = UserSpendingProfile(session_id=session_id)
    db.add(profile)
    await db.flush()

    for series_name, amount in payload.spending.items():
        if amount <= 0:
            continue
        series_res = await db.execute(
            select(CPISeries).where(CPISeries.series_name == series_name)
        )
        series = series_res.scalar_one_or_none()
        if series is None:
            continue
        db.add(
            UserSpendingItem(
                profile_id=profile.id,
                series_id=series.id,
                monthly_spending=amount,
            )
        )

    await db.commit()
    return {"session_id": session_id, "saved": True}


@router.get("/spending/{session_id}")
async def get_spending_profile(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a previously saved spending profile by session token."""
    profile_res = await db.execute(
        select(UserSpendingProfile)
        .where(UserSpendingProfile.session_id == session_id)
    )
    profile = profile_res.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")

    items_res = await db.execute(
        select(UserSpendingItem).where(UserSpendingItem.profile_id == profile.id)
    )
    items = items_res.scalars().all()

    spending: dict[str, float] = {}
    for item in items:
        series_res = await db.execute(
            select(CPISeries).where(CPISeries.id == item.series_id)
        )
        series = series_res.scalar_one_or_none()
        if series:
            spending[series.series_name] = item.monthly_spending

    return {"session_id": session_id, "spending": spending}


@router.post("/monthly-logs")
async def save_monthly_log(
    payload: MonthlyLogInput,
    db: AsyncSession = Depends(get_db),
):
    """Save or update one monthly spending log for a session token."""
    session_id = payload.session_id or secrets.token_hex(16)

    existing_res = await db.execute(
        select(MonthlySpendingLog).where(
            and_(
                MonthlySpendingLog.session_id == session_id,
                MonthlySpendingLog.year == payload.year,
                MonthlySpendingLog.month == payload.month,
            )
        )
    )
    existing = existing_res.scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        await db.flush()

    monthly_log = MonthlySpendingLog(
        session_id=session_id,
        year=payload.year,
        month=payload.month,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(monthly_log)
    await db.flush()

    saved_count = 0
    for series_name, amount in payload.spending.items():
        if amount <= 0:
            continue
        series_res = await db.execute(
            select(CPISeries).where(CPISeries.series_name == series_name)
        )
        series = series_res.scalar_one_or_none()
        if series is None:
            continue
        db.add(
            MonthlySpendingItem(
                log_id=monthly_log.id,
                series_id=series.id,
                monthly_spending=amount,
            )
        )
        saved_count += 1

    await db.commit()
    spending = await _load_monthly_log_spending(db, monthly_log.id)

    return {
        "session_id": session_id,
        "saved": True,
        "saved_items": saved_count,
        "log": _serialize_monthly_log(monthly_log, spending),
    }


@router.get("/monthly-logs/{session_id}")
async def list_monthly_logs(
    session_id: str,
    limit: int = 12,
    db: AsyncSession = Depends(get_db),
):
    """List saved monthly logs for one session, newest first."""
    safe_limit = max(1, min(limit, 60))
    logs_res = await db.execute(
        select(MonthlySpendingLog)
        .where(MonthlySpendingLog.session_id == session_id)
        .order_by(desc(MonthlySpendingLog.year), desc(MonthlySpendingLog.month))
        .limit(safe_limit)
    )
    logs = logs_res.scalars().all()

    out: list[dict] = []
    for log in logs:
        spending = await _load_monthly_log_spending(db, log.id)
        out.append(_serialize_monthly_log(log, spending))

    return {"session_id": session_id, "logs": out}


@router.get("/monthly-logs/{session_id}/previous")
async def get_previous_month_log(
    session_id: str,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent saved month before a given year/month."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")

    previous_res = await db.execute(
        select(MonthlySpendingLog)
        .where(
            and_(
                MonthlySpendingLog.session_id == session_id,
                or_(
                    MonthlySpendingLog.year < year,
                    and_(MonthlySpendingLog.year == year, MonthlySpendingLog.month < month),
                ),
            )
        )
        .order_by(desc(MonthlySpendingLog.year), desc(MonthlySpendingLog.month))
        .limit(1)
    )
    previous = previous_res.scalar_one_or_none()
    if previous is None:
        return {"session_id": session_id, "log": None}

    spending = await _load_monthly_log_spending(db, previous.id)
    return {"session_id": session_id, "log": _serialize_monthly_log(previous, spending)}
