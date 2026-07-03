"""CPI data normalizer.

Transforms raw SingStat API JSON into structured records ready for DB writes.

SingStat TableBuilder response shape (M214011):
  {
    "Data": {
      "row": [
        {
          "seriesNo": "1",
          "rowText": "All Items",
          "uoM": "Per Cent",
          "columns": [
            {"key": "2025 1H", "value": "0.2"},
            {"key": "2025 2H", "value": "0.4"},
            ...
          ]
        },
        ...
      ]
    }
  }
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# User-facing CPI categories
# ---------------------------------------------------------------------------
# These are the headline spending buckets shown on the spending input form.
# They match the exact ``rowText`` values returned by SingStat M214011.
# All other series are stored in the DB but not surfaced to the user.
KNOWN_USER_FACING_CATEGORIES: set[str] = {
    "Food",
    "Clothing & Footwear",
    "Housing & Utilities",
    "Household Durables & Services",
    "Health",
    "Transport",
    "Information & Communication",
    "Recreation, Sport & Culture",
    "Education",
    "Miscellaneous Goods & Services",
}

# The overall national aggregate - not a spending category but needed for
# the "national CPI" comparison.
NATIONAL_AGGREGATE_NAME = "All Items"


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _parse_period(period_str: str) -> Optional[tuple[int, int]]:
    """Parse a SingStat period string into (year, month).

    Accepts both abbreviated and full month names:
      '2024 Jan' -> (2024, 1)
      '2024 January' -> (2024, 1)

    Also accepts half-year periods used by M214011:
      '2024 1H' -> (2024, 1)
      '2024 2H' -> (2024, 7)

    Returns None if the string cannot be parsed.
    """
    period_str = period_str.strip()

    # Half-year format (for example: "2025 2H").
    half_year = re.fullmatch(r"(\d{4})\s+(1H|2H)", period_str)
    if half_year:
        year = int(half_year.group(1))
        half = half_year.group(2)
        month = 1 if half == "1H" else 7
        return (year, month)

    for fmt in ("%Y %b", "%Y %B"):
        try:
            dt = datetime.strptime(period_str, fmt)
            return (dt.year, dt.month)
        except ValueError:
            continue
    logger.debug("Could not parse period string: %r", period_str)
    return None


# ---------------------------------------------------------------------------
# Main normalizer
# ---------------------------------------------------------------------------

def normalize_cpi_response(raw: dict) -> list[dict]:
    """Transform the raw SingStat API payload into a list of normalized dicts.

    Each output dict has:
      series_no   : str   - seriesNo field from API
      series_name : str   - rowText (human-readable CPI label)
      unit        : str   - unit of measure, e.g. "Per Cent"
      data_points : list  - [(year: int, month: int, index_value: float)]
    """
    rows = raw.get("Data", {}).get("row", [])
    normalized: list[dict] = []

    for row in rows:
        series_no = str(row.get("seriesNo", "")).strip()
        series_name = row.get("rowText", "").strip()
        unit = row.get("uoM", "").strip()

        if not series_name:
            logger.debug("Skipping row with empty series name: %r", row)
            continue

        data_points: list[tuple[int, int, float]] = []
        for col in row.get("columns", []):
            period = _parse_period(col.get("key", ""))
            raw_value = str(col.get("value", "")).strip()

            if period is None or raw_value in ("na", "-", "", "N.A.", "N/A"):
                continue
            try:
                data_points.append((period[0], period[1], float(raw_value)))
            except ValueError:
                logger.debug(
                    "Non-numeric CPI value for '%s' at %s: %r",
                    series_name, col.get("key"), raw_value,
                )

        normalized.append(
            {
                "series_no": series_no,
                "series_name": series_name,
                "unit": unit,
                "data_points": data_points,
            }
        )

    return normalized


# ---------------------------------------------------------------------------
# Completeness validation
# ---------------------------------------------------------------------------

def validate_completeness(api_count: int, db_count: int) -> None:
  """Assert the database contains exactly the series count returned by the API.

  Raises ValueError if counts differ - this indicates a data integrity
  problem in the ingestion pipeline.
    """
  if db_count != api_count:
        raise ValueError(
            f"Completeness check FAILED: SingStat API returned {api_count} series "
      f"but {db_count} matching series are present in the database. "
            "This may indicate a partial write failure."
        )
