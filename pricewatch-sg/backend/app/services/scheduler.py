"""
Scheduler - one recurring job:
    cpi_refresh  every N minutes - pull latest CPI data from active benchmark

The initial ingestion is handled by the FastAPI lifespan event in main.py;
the scheduler only needs to keep data fresh after startup.
"""
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.data_pipeline.ingestion import get_active_table_id, run_ingestion

logger = logging.getLogger(__name__)


def _refresh_minutes() -> int:
    """Return scheduler interval minutes from env, with safe fallback."""
    raw = os.getenv("CPI_REFRESH_MINUTES", "1")
    try:
        minutes = int(raw)
    except ValueError:
        minutes = 1
    return max(1, minutes)


async def refresh_cpi_data() -> None:
    """Fetch the latest CPI data from SingStat and ingest new records."""
    logger.info("Scheduled CPI refresh starting...")
    try:
        table_id = await get_active_table_id()
        log = await run_ingestion(table_id=table_id)
        if log.success:
            logger.info(
                "CPI refresh done for %s: %d series, %d new records.",
                table_id,
                log.series_fetched,
                log.records_stored,
            )
        else:
            logger.warning("CPI refresh failed: %s", log.error_message)
    except Exception as exc:
        logger.error("CPI refresh raised unexpectedly: %s", exc)


def start_scheduler() -> AsyncIOScheduler:
    """Initialise and start the APScheduler instance."""
    refresh_minutes = _refresh_minutes()
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        refresh_cpi_data,
        trigger=IntervalTrigger(minutes=refresh_minutes),
        id="cpi_refresh",
        replace_existing=True,
        # No next_run_time - lifespan already ran the initial ingestion.
    )
    scheduler.start()
    logger.info("Scheduler started: CPI refresh every %d minute(s).", refresh_minutes)
    return scheduler
