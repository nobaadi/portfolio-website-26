from pydantic import BaseModel, Field
from typing import Optional, List, Any


class CacheLevelConfig(BaseModel):
    size_kb: int = Field(default=32, ge=1, le=65536)
    block_size: int = Field(default=64, ge=16, le=4096)
    associativity: int = Field(default=4, ge=0, le=64)
    policy: str = Field(default="LRU", pattern="^(LRU|FIFO|Random)$")
    write_policy: str = Field(default="write-back", pattern="^(write-back|write-through)$")


class CacheConfig(BaseModel):
    L1: CacheLevelConfig = CacheLevelConfig(size_kb=32, block_size=64, associativity=4, policy="LRU", write_policy="write-back")
    L2: CacheLevelConfig = CacheLevelConfig(size_kb=256, block_size=64, associativity=8, policy="LRU", write_policy="write-back")
    L3: CacheLevelConfig = CacheLevelConfig(size_kb=8192, block_size=64, associativity=16, policy="LRU", write_policy="write-back")


class SimulateRequest(BaseModel):
    cache_config: CacheConfig = CacheConfig()
    workload: str = Field(default="matrix_multiplication")
    custom_trace: Optional[List[int]] = None
    name: Optional[str] = None
    working_set_kb: int = Field(default=256, ge=16, le=4096)
    write_fraction: float = Field(default=0.3, ge=0.0, le=1.0)


class CounterfactualResult(BaseModel):
    bottleneck_level: str
    level_doubled: str
    suggestion: str
    original_avg_cycles: float
    improved_avg_cycles: float
    improvement_pct: float


class SimulateResponse(BaseModel):
    id: int
    l1_hit_rate: float
    l2_hit_rate: float
    l3_hit_rate: float
    overall_miss_rate: float
    avg_access_time: float
    memory_traffic: int
    total_accesses: int
    l1_utilization: float
    l2_utilization: float
    l3_utilization: float
    l1_cycles: int
    l2_cycles: int
    l3_cycles: int
    ram_cycles: int
    timeline: List[Any]
    counterfactual: Optional[CounterfactualResult] = None
    insight: Optional[str] = None


class ExperimentSummary(BaseModel):
    id: int
    name: Optional[str]
    workload: str
    l1_hit_rate: float
    l2_hit_rate: float
    l3_hit_rate: float
    overall_miss_rate: float
    avg_access_time: float
    total_accesses: int
    created_at: str
    l1_size_kb: Optional[int] = None
    l2_size_kb: Optional[int] = None
    l3_size_kb: Optional[int] = None


class ExperimentDetail(BaseModel):
    id: int
    name: Optional[str]
    workload: str
    cache_config: Any
    l1_hit_rate: float
    l2_hit_rate: float
    l3_hit_rate: float
    overall_miss_rate: float
    avg_access_time: float
    memory_traffic: int
    total_accesses: int
    l1_utilization: float
    l2_utilization: float
    l3_utilization: float
    l1_cycles: int = 0
    l2_cycles: int = 0
    l3_cycles: int = 0
    ram_cycles: int = 0
    timeline: List[Any]
    counterfactual: Optional[CounterfactualResult] = None
    created_at: str


class ArchitecturePreset(BaseModel):
    name: str
    description: str
    config: CacheConfig


class SweepPoint(BaseModel):
    size_kb: int
    l1_hit_rate: float
    l2_hit_rate: float
    l3_hit_rate: float
    avg_access_time: float


class SweepRequest(BaseModel):
    cache_config: CacheConfig = CacheConfig()
    workload: str = Field(default="matrix_multiplication")
    working_set_kb: int = Field(default=256, ge=16, le=4096)
    write_fraction: float = Field(default=0.3, ge=0.0, le=1.0)
    sweep_level: str = Field(default="L1", pattern="^(L1|L2|L3)$")
    sizes: List[int] = Field(default=[4, 8, 16, 32, 64, 128, 256])


class SweepResponse(BaseModel):
    sweep_level: str
    workload: str
    working_set_kb: int
    points: List[SweepPoint]
