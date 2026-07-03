from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime


class Base(DeclarativeBase):
    pass


class ExperimentResult(Base):
    __tablename__ = "experiment_results"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    workload = Column(String, nullable=False)
    cache_config = Column(JSON, nullable=False)
    l1_hit_rate = Column(Float, nullable=False)
    l2_hit_rate = Column(Float, nullable=False)
    l3_hit_rate = Column(Float, nullable=False)
    overall_miss_rate = Column(Float, nullable=False)
    avg_access_time = Column(Float, nullable=False)
    memory_traffic = Column(Integer, nullable=False)
    total_accesses = Column(Integer, nullable=False)
    l1_utilization = Column(Float, nullable=True)
    l2_utilization = Column(Float, nullable=True)
    l3_utilization = Column(Float, nullable=True)
    l1_cycles = Column(Integer, nullable=True, default=0)
    l2_cycles = Column(Integer, nullable=True, default=0)
    l3_cycles = Column(Integer, nullable=True, default=0)
    ram_cycles = Column(Integer, nullable=True, default=0)
    counterfactual = Column(JSON, nullable=True)
    timeline = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
