import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from models import Base

_db_path = os.getenv("DATABASE_PATH", "./cache_sim.db")
DATABASE_URL = f"sqlite+aiosqlite:///{_db_path}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

NEW_COLUMNS = [
    ("l1_cycles", "INTEGER DEFAULT 0"),
    ("l2_cycles", "INTEGER DEFAULT 0"),
    ("l3_cycles", "INTEGER DEFAULT 0"),
    ("ram_cycles", "INTEGER DEFAULT 0"),
    ("counterfactual", "JSON"),
]


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns to existing tables (idempotent)
        for col_name, col_def in NEW_COLUMNS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE experiment_results ADD COLUMN {col_name} {col_def}")
                )
            except Exception:
                pass  # Column already exists


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
