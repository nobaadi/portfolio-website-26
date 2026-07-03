"""
Database models for the Personal Inflation Tracker.

Tables:
    cpi_series            - Every CPI series row from SingStat M214011
    cpi_monthly_index     - Periodized CPI rate values per series
    data_ingestion_log    - Audit log for pipeline runs
    user_spending_profile - Anonymous user spending snapshots
    user_spending_item    - Individual category amounts within a profile
    monthly_spending_log   - Month-level saved spending log per session
    monthly_spending_item  - Category amounts inside one monthly log
"""
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer,
    String, Float, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


class CPISeries(Base):
    """One row from the SingStat CPI dataset (M214011).

    ``is_user_facing`` is True for the ten headline spending categories
    (Food, Housing, Transport, etc.) that the user allocates spending to.
    All sub-categories are stored too but set to False.
    """
    __tablename__ = "cpi_series"

    id = Column(Integer, primary_key=True, index=True)
    series_no = Column(String(20), nullable=False)
    series_name = Column(String(512), nullable=False, unique=True)
    unit = Column(String(100), default="")
    is_user_facing = Column(Boolean, default=False, nullable=False)

    monthly_indices = relationship(
        "CPIMonthlyIndex", back_populates="series",
        cascade="all, delete-orphan",
    )


class CPIMonthlyIndex(Base):
    """Stored CPI rate value for one CPISeries at a normalized period key."""
    __tablename__ = "cpi_monthly_index"
    __table_args__ = (
        UniqueConstraint("series_id", "year", "month", name="uq_series_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(
        Integer, ForeignKey("cpi_series.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    index_value = Column(Float, nullable=False)

    series = relationship("CPISeries", back_populates="monthly_indices")


class DataIngestionLog(Base):
    """Audit record for each run of the CPI ingestion pipeline."""
    __tablename__ = "data_ingestion_log"

    id = Column(Integer, primary_key=True, index=True)
    ingested_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    table_id = Column(String(20), nullable=False)
    series_fetched = Column(Integer, default=0)
    records_stored = Column(Integer, default=0)
    success = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)


class UserSpendingProfile(Base):
    """A user's spending snapshot, keyed by an anonymous session token."""
    __tablename__ = "user_spending_profiles"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    spending_items = relationship(
        "UserSpendingItem", back_populates="profile",
        cascade="all, delete-orphan",
    )


class UserSpendingItem(Base):
    """One category's monthly spending within a UserSpendingProfile."""
    __tablename__ = "user_spending_items"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(
        Integer, ForeignKey("user_spending_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    series_id = Column(Integer, ForeignKey("cpi_series.id"), nullable=False)
    monthly_spending = Column(Float, nullable=False)

    profile = relationship("UserSpendingProfile", back_populates="spending_items")
    series = relationship("CPISeries")


class MonthlySpendingLog(Base):
    """One saved month of spending for an anonymous session."""
    __tablename__ = "monthly_spending_logs"
    __table_args__ = (
        UniqueConstraint("session_id", "year", "month", name="uq_session_monthly_log"),
    )

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    spending_items = relationship(
        "MonthlySpendingItem", back_populates="monthly_log",
        cascade="all, delete-orphan",
    )


class MonthlySpendingItem(Base):
    """One category's monthly spending inside MonthlySpendingLog."""
    __tablename__ = "monthly_spending_items"

    id = Column(Integer, primary_key=True, index=True)
    log_id = Column(
        Integer, ForeignKey("monthly_spending_logs.id", ondelete="CASCADE"),
        nullable=False,
    )
    series_id = Column(Integer, ForeignKey("cpi_series.id"), nullable=False)
    monthly_spending = Column(Float, nullable=False)

    monthly_log = relationship("MonthlySpendingLog", back_populates="spending_items")
    series = relationship("CPISeries")
