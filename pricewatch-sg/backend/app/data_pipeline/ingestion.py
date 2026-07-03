"""CPI data ingestion pipeline.

Fetches CPI percent-change data from SingStat TableBuilder, normalizes the
response, and upserts every series and half-yearly data point into the DB.

Called:
    - On application startup (via FastAPI lifespan)
    - On a daily schedule (via APScheduler)

SingStat API endpoint:
    GET https://tablebuilder.singstat.gov.sg/api/table/tabledata/{table_id}

Supported benchmark tables:
    M214001 - Lowest 20% households
    M214011 - Middle 60% households
    M214021 - Highest 20% households

This table provides YoY percent-change values directly. The `index_value`
column therefore stores percent-change (for example, `0.4` means +0.4%)
rather than an absolute CPI level.

Half-yearly periods are stored as:
    - 1H -> month = 1
    - 2H -> month = 7

Pipeline steps:
    1. _fetch_raw_cpi()         - HTTP GET with graceful error handling
    2. normalize_cpi_response() - parse rows/columns into normalized dicts
    3. _upsert_to_db()          - upsert CPISeries + CPIMonthlyIndex
    4. validate_completeness()  - assert db_count == api_count
    5. _save_log()              - persist DataIngestionLog record
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.data_pipeline.normalizer import (
    KNOWN_USER_FACING_CATEGORIES,
    normalize_cpi_response,
    validate_completeness,
)
from app.models.models import CPIMonthlyIndex, CPISeries, DataIngestionLog

logger = logging.getLogger(__name__)

SINGSTAT_API_BASE = "https://tablebuilder.singstat.gov.sg/api/table/tabledata"

BENCHMARKS: dict[str, dict[str, str]] = {
    "lowest20": {
        "table_id": "M214001",
        "label": "Lowest 20% households",
    },
    "middle60": {
        "table_id": "M214011",
        "label": "Middle 60% households",
    },
    "highest20": {
        "table_id": "M214021",
        "label": "Highest 20% households",
    },
}
DEFAULT_BENCHMARK_KEY = "middle60"
CPI_TABLE_ID = BENCHMARKS[DEFAULT_BENCHMARK_KEY]["table_id"]


def benchmark_key_from_table_id(table_id: str) -> str:
    """Resolve benchmark key from table id, defaulting to middle60."""
    for key, meta in BENCHMARKS.items():
        if meta["table_id"] == table_id:
            return key
    return DEFAULT_BENCHMARK_KEY


def table_id_from_benchmark_key(benchmark_key: str) -> str:
    """Resolve table id from benchmark key.

    Raises ValueError when benchmark key is unknown.
    """
    key = benchmark_key.strip().lower()
    if key not in BENCHMARKS:
        supported = ", ".join(sorted(BENCHMARKS.keys()))
        raise ValueError(f"Unknown benchmark '{benchmark_key}'. Supported: {supported}.")
    return BENCHMARKS[key]["table_id"]


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

async def run_ingestion(table_id: str = CPI_TABLE_ID) -> DataIngestionLog:
    """Execute a full ingestion run and return the audit log record.

    The function never raises — all errors are captured in the log entry so
    the application can start even if SingStat is temporarily unreachable.
    """
    log = DataIngestionLog(table_id=table_id, ingested_at=datetime.now(timezone.utc))

    raw = await _fetch_raw_cpi(table_id)
    if raw is None:
        log.success = False
        log.error_message = (
            "SingStat API fetch failed — endpoint unreachable or returned an error. "
            "The app will retry on the next scheduled run."
        )
        logger.warning(log.error_message)
        await _save_log(log)
        return log

    normalized = normalize_cpi_response(raw)
    log.series_fetched = len(normalized)

    if log.series_fetched == 0:
        log.success = False
        log.error_message = "SingStat API returned an empty dataset."
        logger.warning(log.error_message)
        await _save_log(log)
        return log

    log.records_stored = await _upsert_to_db(normalized)

    # Completeness gate
    expected_series_names = {item["series_name"] for item in normalized}
    db_count = await _count_series_in_db(expected_series_names)
    try:
        validate_completeness(log.series_fetched, db_count)
        logger.info(
            "Completeness check passed: %d series from API, %d matching series in DB.",
            log.series_fetched, db_count,
        )
    except ValueError as exc:
        log.success = False
        log.error_message = str(exc)
        await _save_log(log)
        raise  # propagate so caller is aware

    log.success = True
    logger.info(
        "CPI ingestion complete: %d series fetched, %d data-points stored.",
        log.series_fetched, log.records_stored,
    )
    await _save_log(log)
    return log


async def get_active_table_id() -> str:
    """Return the most recently successful table id, or default benchmark table."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DataIngestionLog.table_id)
            .where(DataIngestionLog.success.is_(True))
            .order_by(DataIngestionLog.ingested_at.desc())
            .limit(1)
        )
        table_id = result.scalar_one_or_none()
        return table_id or CPI_TABLE_ID


# ---------------------------------------------------------------------------
# HTTP fetch
# ---------------------------------------------------------------------------

async def _fetch_raw_cpi(table_id: str) -> Optional[dict]:
    """GET the SingStat TableBuilder API and return the parsed JSON payload.

    Returns None on any HTTP or network error so callers can handle gracefully.
    """
    url = f"{SINGSTAT_API_BASE}/{table_id}"
    logger.info("Fetching CPI data from %s", url)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data: dict = resp.json()
            # SingStat wraps errors inside a 200 response sometimes
            status_code = data.get("StatusCode")
            if status_code is not None and status_code != 200:
                logger.error(
                    "SingStat non-200 payload status: %s — %s",
                    status_code, data.get("Message"),
                )
                return None
            return data
    except httpx.HTTPStatusError as exc:
        logger.error(
            "HTTP %s fetching %s: %s",
            exc.response.status_code, url, exc.response.text[:300],
        )
        return None
    except httpx.RequestError as exc:
        logger.error("Network error fetching %s: %s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Database upsert
# ---------------------------------------------------------------------------

async def _upsert_to_db(normalized: list[dict]) -> int:
    """Insert or update CPISeries rows and their CPIMonthlyIndex records.

    Uses a simple SELECT-then-INSERT/UPDATE pattern to be compatible with
    both fresh installs and incremental updates.

    Returns the total number of new CPIMonthlyIndex rows inserted.
    """
    records_stored = 0

    async with AsyncSessionLocal() as session:
        for item in normalized:
            series = await _upsert_series(session, item)
            new_count = await _upsert_monthly_indices(session, series, item["data_points"])
            records_stored += new_count

        await session.commit()

    return records_stored


async def _upsert_series(session: AsyncSession, item: dict) -> CPISeries:
    """Return the CPISeries row for this item, creating it if necessary."""
    result = await session.execute(
        select(CPISeries).where(CPISeries.series_name == item["series_name"])
    )
    series = result.scalar_one_or_none()
    is_user_facing = item["series_name"] in KNOWN_USER_FACING_CATEGORIES

    if series is None:
        series = CPISeries(
            series_no=item["series_no"],
            series_name=item["series_name"],
            unit=item["unit"],
            is_user_facing=is_user_facing,
        )
        session.add(series)
        await session.flush()
    else:
        # Keep metadata in sync with latest API response
        series.series_no = item["series_no"]
        series.unit = item["unit"]
        series.is_user_facing = is_user_facing

    return series


async def _upsert_monthly_indices(
    session: AsyncSession,
    series: CPISeries,
    data_points: list[tuple[int, int, float]],
) -> int:
    """Upsert all monthly data points for a series.

    New points are inserted; existing points are updated only when the value
    differs (SingStat occasionally revises recent data).

    Returns the count of newly inserted rows.
    """
    new_count = 0
    for year, month, value in data_points:
        result = await session.execute(
            select(CPIMonthlyIndex).where(
                CPIMonthlyIndex.series_id == series.id,
                CPIMonthlyIndex.year == year,
                CPIMonthlyIndex.month == month,
            )
        )
        record = result.scalar_one_or_none()

        if record is None:
            session.add(
                CPIMonthlyIndex(
                    series_id=series.id,
                    year=year,
                    month=month,
                    index_value=value,
                )
            )
            new_count += 1
        elif record.index_value != value:
            record.index_value = value  # accept SingStat revision

    return new_count


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _count_series_in_db(series_names: set[str] | None = None) -> int:
    async with AsyncSessionLocal() as session:
        stmt = select(func.count()).select_from(CPISeries)
        if series_names is not None:
            if not series_names:
                return 0
            stmt = stmt.where(CPISeries.series_name.in_(series_names))
        result = await session.execute(stmt)
        return result.scalar_one()


async def _save_log(log: DataIngestionLog) -> None:
    async with AsyncSessionLocal() as session:
        session.add(log)
        await session.commit()
