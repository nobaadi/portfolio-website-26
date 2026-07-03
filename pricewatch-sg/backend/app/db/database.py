from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

_raw_url = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/pricewatch"
)

# asyncpg doesn't accept ?sslmode=require as a URL param -- strip it and
# pass ssl via connect_args instead so Neon and other hosted Postgres work.
_ssl = "sslmode=require" in _raw_url
DATABASE_URL = _raw_url.replace("?sslmode=require", "").replace("&sslmode=require", "")

connect_args = {"ssl": True} if _ssl else {}

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True, connect_args=connect_args)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
