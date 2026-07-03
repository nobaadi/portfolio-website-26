"""CPI router data access endpoints.

Routes:
    GET /cpi/categories          - user-facing spending categories + latest rates
    GET /cpi/all                 - every stored CPI series
    GET /cpi/latest              - latest rates for all categories
    GET /cpi/series/{id}/history - full history for one series
    GET /cpi/status              - last ingestion audit log
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data_pipeline.ingestion import (
    BENCHMARKS,
    CPI_TABLE_ID,
    benchmark_key_from_table_id,
    run_ingestion,
    table_id_from_benchmark_key,
)
from app.db.database import get_db
from app.models.models import CPIMonthlyIndex, CPISeries, DataIngestionLog
from app.services.calculator import _get_latest_rate, _period_label

router = APIRouter(prefix="/cpi", tags=["cpi"])


def _benchmark_payload(table_id: str) -> dict[str, str]:
    key = benchmark_key_from_table_id(table_id)
    meta = BENCHMARKS[key]
    return {
        "key": key,
        "label": meta["label"],
        "table_id": meta["table_id"],
    }


# ---------------------------------------------------------------------------
# Benchmark controls
# ---------------------------------------------------------------------------

@router.get("/benchmarks")
async def get_benchmarks(db: AsyncSession = Depends(get_db)):
    """Available household benchmark datasets and currently active benchmark."""
    result = await db.execute(
        select(DataIngestionLog)
        .order_by(DataIngestionLog.ingested_at.desc())
        .limit(1)
    )
    log = result.scalar_one_or_none()
    current_table_id = (log.table_id if log and log.table_id else CPI_TABLE_ID)

    return {
        "current": _benchmark_payload(current_table_id),
        "options": [
            {
                "key": key,
                "label": meta["label"],
                "table_id": meta["table_id"],
            }
            for key, meta in BENCHMARKS.items()
        ],
    }


@router.post("/benchmark/{benchmark_key}")
async def switch_benchmark(benchmark_key: str):
    """Switch active benchmark by ingesting the selected SingStat CPI table."""
    try:
        table_id = table_id_from_benchmark_key(benchmark_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        log = await run_ingestion(table_id=table_id)
    except Exception as exc:  # pragma: no cover - defensive guard for runtime failures
        raise HTTPException(
            status_code=500,
            detail=f"Benchmark switch failed for table {table_id}: {exc}",
        ) from exc

    return {
        "benchmark": _benchmark_payload(table_id),
        "ingestion": {
            "ingested_at": log.ingested_at.isoformat() if log.ingested_at else None,
            "table_id": log.table_id,
            "series_fetched": log.series_fetched,
            "records_stored": log.records_stored,
            "success": log.success,
            "error_message": log.error_message,
        },
    }


# ---------------------------------------------------------------------------
# User-facing categories (for spending form)
# ---------------------------------------------------------------------------

@router.get("/categories")
async def get_user_facing_categories(db: AsyncSession = Depends(get_db)):
    """All headline CPI spending categories with latest inflation rates.

    These are the categories shown in the spending input form.
    """
    result = await db.execute(
        select(CPISeries)
        .where(CPISeries.is_user_facing == True)  # noqa: E712
        .order_by(CPISeries.series_name)
    )
    categories = result.scalars().all()

    output = []
    for cat in categories:
        latest_rate, period = await _get_latest_rate(db, cat.id)
        inflation = round(latest_rate, 2) if latest_rate is not None else None
        output.append(
            {
                "id": cat.id,
                "series_name": cat.series_name,
                "unit": cat.unit,
                "latest_inflation_rate": inflation,
                "latest_index": latest_rate,
                "period": _period_label(period) if period else None,
            }
        )

    return {"categories": output, "count": len(output)}


# ---------------------------------------------------------------------------
# All series
# ---------------------------------------------------------------------------

@router.get("/all")
async def get_all_series(db: AsyncSession = Depends(get_db)):
    """Every active CPI rate series stored in the database."""
    result = await db.execute(
        select(CPISeries)
        .where(CPISeries.unit == "Per Cent")
        .order_by(CPISeries.series_no)
    )
    series = result.scalars().all()
    return {
        "series": [
            {
                "id": s.id,
                "series_no": s.series_no,
                "series_name": s.series_name,
                "unit": s.unit,
                "is_user_facing": s.is_user_facing,
            }
            for s in series
        ],
        "count": len(series),
    }


# ---------------------------------------------------------------------------
# Latest inflation snapshot
# ---------------------------------------------------------------------------

@router.get("/latest")
async def get_latest_inflation(db: AsyncSession = Depends(get_db)):
    """Latest inflation rate for all user-facing categories + national 'All Items'.

    This is the dataset used to populate the dashboard overview cards.
    """
    result = await db.execute(
        select(CPISeries)
        .where(CPISeries.unit == "Per Cent")
        .order_by(CPISeries.series_no)
    )
    all_series = result.scalars().all()

    categories = []
    national = None
    latest_period: Optional[tuple[int, int]] = None

    for s in all_series:
        latest_rate, period = await _get_latest_rate(db, s.id)
        inflation = round(latest_rate, 2) if latest_rate is not None else None

        if period and (latest_period is None or period > latest_period):
            latest_period = period

        entry = {
            "id": s.id,
            "series_name": s.series_name,
            "is_user_facing": s.is_user_facing,
            "latest_index": latest_rate,
            "inflation_rate": inflation,
        }

        if s.series_name == "All Items":
            national = entry
        elif s.is_user_facing:
            categories.append(entry)

    period_str = _period_label(latest_period) if latest_period else "unknown"

    return {
        "period": period_str,
        "national": national,
        "categories": sorted(categories, key=lambda x: x["series_name"]),
    }


# ---------------------------------------------------------------------------
# Historical series data
# ---------------------------------------------------------------------------

@router.get("/series/{series_id}/history")
async def get_series_history(series_id: int, db: AsyncSession = Depends(get_db)):
    """Full monthly CPI index history for one series, ordered chronologically."""
    series_res = await db.execute(
        select(CPISeries).where(CPISeries.id == series_id)
    )
    series = series_res.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="CPI series not found.")

    records_res = await db.execute(
        select(CPIMonthlyIndex)
        .where(CPIMonthlyIndex.series_id == series_id)
        .order_by(CPIMonthlyIndex.year, CPIMonthlyIndex.month)
    )
    records = records_res.scalars().all()

    return {
        "series_name": series.series_name,
        "unit": series.unit,
        "history": [
            {"year": r.year, "month": r.month, "index_value": r.index_value}
            for r in records
        ],
    }


# ---------------------------------------------------------------------------
# Pipeline status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_ingestion_status(db: AsyncSession = Depends(get_db)):
    """Most recent data ingestion audit log entry."""
    result = await db.execute(
        select(DataIngestionLog)
        .order_by(DataIngestionLog.ingested_at.desc())
        .limit(1)
    )
    log = result.scalar_one_or_none()

    if not log:
        default_benchmark = _benchmark_payload(CPI_TABLE_ID)
        return {
            "status": "no_ingestion_run_yet",
            "benchmark_key": default_benchmark["key"],
            "benchmark_label": default_benchmark["label"],
            "table_id": default_benchmark["table_id"],
        }

    benchmark = _benchmark_payload(log.table_id or CPI_TABLE_ID)

    return {
        "ingested_at": log.ingested_at.isoformat() if log.ingested_at else None,
        "table_id": log.table_id,
        "benchmark_key": benchmark["key"],
        "benchmark_label": benchmark["label"],
        "series_fetched": log.series_fetched,
        "records_stored": log.records_stored,
        "success": log.success,
        "error_message": log.error_message,
    }
