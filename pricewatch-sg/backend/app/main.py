"""
Personal Inflation Tracker - FastAPI application entry point.

Startup sequence (via lifespan):
  1. Create / verify database tables
    2. Run initial CPI ingestion from currently active benchmark
  3. Start daily refresh scheduler

Routers:
  /cpi/*        - CPI data access
  /calculate/*  - Personal inflation calculation
  /user/*       - Spending profile persistence
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analysis import router as analysis_router
from app.api.calculator import router as calculator_router
from app.api.cpi import router as cpi_router
from app.api.simulation import router as simulation_router
from app.api.user import router as user_router
from app.data_pipeline.ingestion import get_active_table_id, run_ingestion
from app.db.database import Base, engine
from app.services.scheduler import start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created / verified.")

    table_id = await get_active_table_id()
    logger.info("Running initial CPI data ingestion from SingStat table %s...", table_id)
    log = await run_ingestion(table_id=table_id)
    if log.success:
        logger.info(
            "Initial ingestion complete for %s: %d series, %d records.",
            table_id,
            log.series_fetched,
            log.records_stored,
        )
    else:
        logger.warning(
            "Initial ingestion failed (app will still start): %s",
            log.error_message,
        )

    scheduler = start_scheduler()
    yield

    # --- Shutdown ---
    scheduler.shutdown()


app = FastAPI(
    title="Personal Inflation Tracker",
    description=(
        "Calculate your personal inflation rate using official Singapore "
        "CPI data from SingStat (table M214011)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cpi_router,        prefix="/api")
app.include_router(calculator_router, prefix="/api")
app.include_router(analysis_router,   prefix="/api")
app.include_router(simulation_router, prefix="/api")
app.include_router(user_router,       prefix="/api")


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "personal-inflation-tracker"}

