"""
SingStat Auto-Updater
---------------------
Hits the SingStat TableBuilder API every 24 hours.
When a new monthly report is published, it ingests the new data points
into the DB automatically — no manual work needed.

SingStat TableBuilder API (free, no auth):
  https://tablebuilder.singstat.gov.sg/api/table/tabledata/{series_id}

Series used:
  M213161 — Average Retail Prices of Selected Consumer Items (monthly)
             Includes: chicken rice, laksa, char kway teow, eggs, bread etc.

This is the OFFICIAL source — the same data SingStat publishes on their
dashboard. Methodology: surveyors visit ~150+ hawker stalls and supermarkets
island-wide monthly. Published ~6 weeks after reference month.
"""

import httpx
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from app.db.database import AsyncSessionLocal
from app.models.models import Item, PriceRecord, DataIngestionLog

logger = logging.getLogger(__name__)

SINGSTAT_API = "https://tablebuilder.singstat.gov.sg/api/table/tabledata"

# SingStat series M213161: Average Retail Prices of Selected Consumer Items
# Map SingStat row names → our item names in DB
SINGSTAT_ITEM_MAP = {
    # Hawker / cooked food
    "Chicken Rice":                          "Chicken Rice (Hawker)",
    "Char Kway Teow":                        "Char Kway Teow",
    "Laksa":                                 "Laksa",
    "Wonton Mee":                            "Wonton Mee",
    "Economical Rice (1 Meat And 2 Vegetables)": "Economical Rice (3 dishes)",
    "Roti Prata (Plain, 2 Pieces)":          "Roti Prata (2pcs)",
    "Kopi O":                                "Kopi O (per cup)",
    "Teh":                                   "Teh Tarik (per cup)",
    # Supermarket / raw ingredients
    "Hen Eggs (Per 10)":                     "Hen Eggs (per 10)",
    "Rice (Per Kg)":                         "FairPrice White Rice 5kg",
    "Chicken (Whole, Per Kg)":               "Whole Chicken (per kg)",
    "Fresh Milk (Per 600Ml)":                "Full Cream Milk 1L",
    "White Bread (Per 400G)":               "Gardenia Bread 400g",
    "Papaya (Per Kg)":                       "Papaya (per kg)",
    "Orange (Per Kg)":                       "Navel Orange (per kg)",
}

# Unit conversion factors for items where SingStat unit ≠ our DB unit
UNIT_CONVERSIONS = {
    "Rice (Per Kg)":       lambda p: p * 5,     # per kg → per 5kg bag
    "Fresh Milk (Per 600Ml)": lambda p: p * (1000/600),  # 600ml → 1L
}

SERIES_ID = "M213161"


def _parse_period(period_str: str) -> datetime | None:
    """Parse SingStat period like '2025 Jan' → datetime."""
    try:
        return datetime.strptime(period_str.strip(), "%Y %b").replace(
            day=15, tzinfo=timezone.utc
        )
    except ValueError:
        try:
            return datetime.strptime(period_str.strip(), "%Y %B").replace(
                day=15, tzinfo=timezone.utc
            )
        except ValueError:
            return None


async def fetch_singstat_series(series_id: str = SERIES_ID) -> dict | None:
    """
    Fetch full time series from SingStat TableBuilder API.
    Returns raw JSON or None on failure.
    """
    url = f"{SINGSTAT_API}/{series_id}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return data
    except httpx.HTTPError as e:
        logger.warning(f"SingStat API fetch failed for {series_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching SingStat {series_id}: {e}")
        return None


async def ingest_singstat_update() -> None:
    """
    Pull latest SingStat data and insert any new price records.
    Called on a daily schedule. Only inserts records newer than what we have.
    """
    logger.info(f"Starting SingStat ingestion for series {SERIES_ID}...")

    raw = await fetch_singstat_series(SERIES_ID)
    if not raw:
        await _log_ingestion(SERIES_ID, success=False, error="API fetch returned None")
        return

    try:
        rows = raw.get("Data", {}).get("row", [])
    except (KeyError, AttributeError):
        logger.warning("Unexpected SingStat response structure")
        await _log_ingestion(SERIES_ID, success=False, error="Unexpected response structure")
        return

    records_ingested = 0
    latest_period = None

    async with AsyncSessionLocal() as session:
        for row in rows:
            singstat_name = row.get("rowText", "").strip()
            our_name = SINGSTAT_ITEM_MAP.get(singstat_name)
            if not our_name:
                continue  # not a tracked item

            # Find our DB item
            result = await session.execute(select(Item).where(Item.name == our_name))
            item = result.scalar_one_or_none()
            if not item:
                logger.debug(f"Item not found in DB: {our_name}")
                continue

            # Get the most recent record date for this item
            existing = sorted(item.price_records, key=lambda r: r.recorded_at)
            latest_existing = existing[-1].recorded_at if existing else None

            # Process each data point
            columns = row.get("columns", [])
            for col in columns:
                period_str = col.get("key", "")
                value_str = col.get("value", "")

                if not value_str or value_str in ("na", "-", ""):
                    continue

                try:
                    price = float(value_str)
                except ValueError:
                    continue

                # Apply unit conversion if needed
                converter = UNIT_CONVERSIONS.get(singstat_name)
                if converter:
                    price = converter(price)

                dt = _parse_period(period_str)
                if not dt:
                    continue

                # Track latest period for logging
                if latest_period is None or dt > latest_period:
                    latest_period = dt

                # Only insert if newer than what we have
                if latest_existing and dt <= latest_existing:
                    continue

                session.add(PriceRecord(
                    item_id=item.id,
                    price_sgd=round(price, 4),
                    recorded_at=dt,
                    source_url=f"https://tablebuilder.singstat.gov.sg/table/TS/{SERIES_ID}",
                    scraped=True,
                    data_source="singstat_official",
                ))
                records_ingested += 1

        await session.commit()

    period_str = latest_period.strftime("%Y %b") if latest_period else "unknown"
    logger.info(f"SingStat ingestion complete: {records_ingested} new records, latest period: {period_str}")
    await _log_ingestion(SERIES_ID, records=records_ingested, period=period_str)


async def _log_ingestion(series_id: str, records: int = 0, period: str = "",
                          success: bool = True, error: str = None) -> None:
    async with AsyncSessionLocal() as session:
        session.add(DataIngestionLog(
            source="singstat_tablebuilder",
            series_id=series_id,
            records_ingested=records,
            last_data_period=period,
            success=success,
            error_message=error,
        ))
        await session.commit()
