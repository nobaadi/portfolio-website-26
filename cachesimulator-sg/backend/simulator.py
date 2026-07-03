"""
Cache Simulation Engine
-----------------------
Multi-level cache hierarchy (L1 → L2 → L3 → RAM).

Each level: configurable size, block size, associativity,
replacement policy (LRU|FIFO|Random), write policy (write-back|write-through).

Workloads scale with working_set_kb.
Access latencies (cycles): L1=4, L2=12, L3=40, RAM=200
"""

from __future__ import annotations
import random
import math
import copy
from collections import OrderedDict, deque
from typing import Literal, List, Tuple, Optional, Dict
from dataclasses import dataclass, field

ReplacementPolicy = Literal["LRU", "FIFO", "Random"]
WritePolicy = Literal["write-back", "write-through"]

LATENCY = {"L1": 4, "L2": 12, "L3": 40, "RAM": 200}


@dataclass
class CacheConfig:
    size_kb: int
    block_size: int
    associativity: int
    policy: ReplacementPolicy = "LRU"
    write_policy: WritePolicy = "write-back"

    @property
    def num_blocks(self) -> int:
        return (self.size_kb * 1024) // self.block_size

    @property
    def num_sets(self) -> int:
        ways = self.associativity if self.associativity > 0 else self.num_blocks
        return max(1, self.num_blocks // ways)

    @property
    def ways(self) -> int:
        return self.num_blocks if self.associativity == 0 else self.associativity

    def block_offset_bits(self) -> int:
        return int(math.log2(self.block_size))

    def index_bits(self) -> int:
        return int(math.log2(self.num_sets)) if self.num_sets > 1 else 0

    def get_tag_index(self, address: int) -> Tuple[int, int]:
        ob = self.block_offset_bits()
        ib = self.index_bits()
        index = (address >> ob) & ((1 << ib) - 1)
        tag = address >> (ob + ib)
        return tag, index


class CacheSet:
    def __init__(self, ways: int, policy: ReplacementPolicy, write_policy: WritePolicy = "write-back"):
        self.ways = ways
        self.policy = policy
        self.write_policy = write_policy
        # LRU: tag -> dirty
        self._lru: OrderedDict[int, bool] = OrderedDict()
        # FIFO
        self._fifo: deque[int] = deque()
        self._fifo_dirty: Dict[int, bool] = {}
        # Random
        self._random_store: list[int] = []
        self._random_dirty: Dict[int, bool] = {}

    def lookup(self, tag: int, is_write: bool = False) -> bool:
        if self.policy == "LRU":
            if tag in self._lru:
                self._lru.move_to_end(tag)
                if is_write and self.write_policy == "write-back":
                    self._lru[tag] = True
                return True
            return False
        elif self.policy == "FIFO":
            if tag in self._fifo_dirty:
                if is_write and self.write_policy == "write-back":
                    self._fifo_dirty[tag] = True
                return True
            return False
        else:
            if tag in self._random_dirty:
                if is_write and self.write_policy == "write-back":
                    self._random_dirty[tag] = True
                return True
            return False

    def insert(self, tag: int, is_write: bool = False) -> bool:
        """Insert block. Returns True if a dirty block was evicted."""
        dirty = is_write and self.write_policy == "write-back"
        evicted_dirty = False

        if self.policy == "LRU":
            if tag in self._lru:
                if dirty:
                    self._lru[tag] = True
                self._lru.move_to_end(tag)
            else:
                if len(self._lru) >= self.ways:
                    _, evicted_dirty = self._lru.popitem(last=False)
                self._lru[tag] = dirty
        elif self.policy == "FIFO":
            if tag not in self._fifo_dirty:
                if len(self._fifo) >= self.ways:
                    evicted = self._fifo.popleft()
                    evicted_dirty = self._fifo_dirty.pop(evicted, False)
                self._fifo.append(tag)
                self._fifo_dirty[tag] = dirty
            elif dirty:
                self._fifo_dirty[tag] = True
        else:
            if tag not in self._random_dirty:
                if len(self._random_store) >= self.ways:
                    idx = random.randrange(len(self._random_store))
                    evicted_tag = self._random_store[idx]
                    evicted_dirty = self._random_dirty.pop(evicted_tag, False)
                    self._random_store[idx] = tag
                    self._random_dirty[tag] = dirty
                else:
                    self._random_store.append(tag)
                    self._random_dirty[tag] = dirty
            elif dirty:
                self._random_dirty[tag] = True

        return evicted_dirty

    def utilization(self) -> float:
        if self.policy == "LRU":
            return len(self._lru) / self.ways
        elif self.policy == "FIFO":
            return len(self._fifo_dirty) / self.ways
        else:
            return len(self._random_dirty) / self.ways


class CacheLevel:
    def __init__(self, config: CacheConfig):
        self.config = config
        self.sets: List[CacheSet] = [
            CacheSet(config.ways, config.policy, config.write_policy)
            for _ in range(config.num_sets)
        ]
        self.hits = 0
        self.misses = 0
        self.dirty_evictions = 0

    def access(self, address: int, is_write: bool = False) -> Tuple[bool, bool]:
        """Returns (hit, dirty_evicted)."""
        tag, index = self.config.get_tag_index(address)
        s = self.sets[index]
        if s.lookup(tag, is_write):
            self.hits += 1
            return True, False
        self.misses += 1
        dirty_evicted = s.insert(tag, is_write)
        if dirty_evicted:
            self.dirty_evictions += 1
        return False, dirty_evicted

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total else 0.0

    @property
    def avg_utilization(self) -> float:
        return sum(s.utilization() for s in self.sets) / len(self.sets)


# ---------------------------------------------------------------------------
# Workload generators (scale with working_set_kb)
# ---------------------------------------------------------------------------

MAX_TRACE = 400_000


def _matrix_multiplication_trace(working_set_kb: int = 256) -> List[int]:
    """C = A x B. Working set ~= 3*n^2*4 bytes."""
    n = max(8, int(math.sqrt(working_set_kb * 1024 / 3 / 4)))
    n = min(n, 80)
    base_a, base_b, base_c = 0x1000, 0x10000, 0x20000
    stride = 4
    trace: List[int] = []
    for i in range(n):
        for j in range(n):
            for k in range(n):
                trace.append(base_a + (i * n + k) * stride)
                trace.append(base_b + (k * n + j) * stride)
                if len(trace) >= MAX_TRACE:
                    return trace
            trace.append(base_c + (i * n + j) * stride)
    return trace


def _sorting_trace(working_set_kb: int = 256) -> List[int]:
    """Merge-sort; array size proportional to working_set_kb."""
    n = max(128, min(working_set_kb * 1024 // 4, 32768))
    base = 0x1000
    stride = 4
    trace: List[int] = []
    arr = list(range(n))
    width = 1
    while width < n:
        for start in range(0, n, width * 2):
            left = arr[start: start + width]
            right = arr[start + width: start + width * 2]
            # reads
            for i in range(len(left)):
                trace.append(base + (start + i) * stride)
            for i in range(len(right)):
                trace.append(base + (start + width + i) * stride)
            # writes (merged result)
            merged = sorted(left + right)
            arr[start:start + len(merged)] = merged
            for i in range(len(merged)):
                trace.append(base + (start + i) * stride)
            if len(trace) >= MAX_TRACE:
                return trace
        width *= 2
    return trace


def _random_access_trace(working_set_kb: int = 256) -> List[int]:
    """Random across working_set_kb address space."""
    rng = random.Random(42)
    address_space = working_set_kb * 1024
    n = min(working_set_kb * 16, 80_000)
    return [rng.randrange(0, address_space, 4) for _ in range(n)]


def _graph_traversal_trace(working_set_kb: int = 256) -> List[int]:
    """BFS pointer-chase; node count proportional to working_set_kb."""
    rng = random.Random(7)
    base = 0x4000
    node_size = 64
    nodes = max(64, min(working_set_kb * 1024 // node_size, 8192))
    adj: List[List[int]] = [
        [rng.randint(0, nodes - 1) for _ in range(rng.randint(1, 4))]
        for _ in range(nodes)
    ]
    trace: List[int] = []
    visited: set = set()
    queue: deque = deque([0])
    max_t = min(working_set_kb * 32, 80_000)
    while queue and len(trace) < max_t:
        node = queue.popleft()
        if node in visited:
            continue
        visited.add(node)
        trace.append(base + node * node_size)
        for nb in adj[node]:
            trace.append(base + node * node_size + 8)
            queue.append(nb)
    return trace


def _thrash_lru_trace(working_set_kb: int = 256) -> List[int]:
    """Cyclic sequential scan that exposes replacement-policy differences.

    Repeatedly loops over exactly (working_set_kb) of unique cache blocks.
    When working set > target cache, LRU evicts the next-needed block on
    every access (0 % hit rate after warmup). Random eviction avoids this
    systematic worst case and achieves ~(cache_size / ws) hit rate.
    Set working_set_kb just above your L1 or L2 size to see the effect.
    """
    block_size = 64
    n_unique_blocks = max(1, (working_set_kb * 1024) // block_size)
    n_accesses = min(n_unique_blocks * 8, MAX_TRACE)
    return [((i % n_unique_blocks) * block_size) for i in range(n_accesses)]


WORKLOAD_GENERATORS = {
    "matrix_multiplication": _matrix_multiplication_trace,
    "sorting": _sorting_trace,
    "random_access": _random_access_trace,
    "graph_traversal": _graph_traversal_trace,
    "thrash_lru": _thrash_lru_trace,
}


# ---------------------------------------------------------------------------
# Core simulation
# ---------------------------------------------------------------------------

@dataclass
class SimulationInput:
    cache_config: dict
    workload: str
    custom_trace: Optional[List[int]] = None
    working_set_kb: int = 256
    write_fraction: float = 0.3


@dataclass
class SimulationResult:
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
    timeline: List[dict]
    counterfactual: Optional[dict] = None
    insight: Optional[str] = None


def _build_cache(level_key: str, cfg: dict) -> CacheLevel:
    defaults = {
        "L1": CacheConfig(32, 64, 4, "LRU", "write-back"),
        "L2": CacheConfig(256, 64, 8, "LRU", "write-back"),
        "L3": CacheConfig(8192, 64, 16, "LRU", "write-back"),
    }
    d = defaults[level_key]
    c = cfg.get(level_key, {})
    return CacheLevel(CacheConfig(
        size_kb=int(c.get("size_kb", d.size_kb)),
        block_size=int(c.get("block_size", d.block_size)),
        associativity=int(c.get("associativity", d.associativity)),
        policy=c.get("policy", d.policy),
        write_policy=c.get("write_policy", d.write_policy),
    ))


def _simulate_core(
    l1: CacheLevel, l2: CacheLevel, l3: CacheLevel,
    trace: List[int], write_fraction: float
) -> dict:
    rng = random.Random(42)
    total_cycles = 0
    l1_cyc = l2_cyc = l3_cyc = ram_cyc = 0
    memory_traffic = 0
    timeline: List[dict] = []
    snap = max(1, len(trace) // 50)

    for i, addr in enumerate(trace):
        is_write = rng.random() < write_fraction
        cycles = 0

        l1_hit, l1_dirty = l1.access(addr, is_write)
        if l1_dirty:
            memory_traffic += l1.config.block_size

        if l1_hit:
            cycles += LATENCY["L1"]
            l1_cyc += LATENCY["L1"]
            # Write-through: propagate write to L2 (and further if L2 is also WT)
            if is_write and l1.config.write_policy == "write-through":
                cycles += LATENCY["L2"]
                l2_cyc += LATENCY["L2"]
                if l2.config.write_policy == "write-through":
                    cycles += LATENCY["L3"]
                    l3_cyc += LATENCY["L3"]
                    if l3.config.write_policy == "write-through":
                        cycles += LATENCY["RAM"]
                        ram_cyc += LATENCY["RAM"]
                        memory_traffic += l1.config.block_size
        else:
            # L1 miss -- fetch from lower levels
            cycles += LATENCY["L1"]
            l1_cyc += LATENCY["L1"]

            l2_hit, l2_dirty = l2.access(addr, is_write)
            if l2_dirty:
                memory_traffic += l2.config.block_size

            if l2_hit:
                cycles += LATENCY["L2"]
                l2_cyc += LATENCY["L2"]
                if is_write and l2.config.write_policy == "write-through":
                    cycles += LATENCY["L3"]
                    l3_cyc += LATENCY["L3"]
                    if l3.config.write_policy == "write-through":
                        cycles += LATENCY["RAM"]
                        ram_cyc += LATENCY["RAM"]
                        memory_traffic += l2.config.block_size
            else:
                cycles += LATENCY["L2"]
                l2_cyc += LATENCY["L2"]

                l3_hit, l3_dirty = l3.access(addr, is_write)
                if l3_dirty:
                    memory_traffic += l3.config.block_size

                if l3_hit:
                    cycles += LATENCY["L3"]
                    l3_cyc += LATENCY["L3"]
                    if is_write and l3.config.write_policy == "write-through":
                        cycles += LATENCY["RAM"]
                        ram_cyc += LATENCY["RAM"]
                        memory_traffic += l3.config.block_size
                else:
                    cycles += LATENCY["L3"] + LATENCY["RAM"]
                    l3_cyc += LATENCY["L3"]
                    ram_cyc += LATENCY["RAM"]
                    memory_traffic += l3.config.block_size

        total_cycles += cycles

        if (i + 1) % snap == 0 or i == len(trace) - 1:
            completed = i + 1
            timeline.append({
                "index": completed,
                "l1_hit_rate": round(l1.hit_rate * 100, 2),
                "l2_hit_rate": round(l2.hit_rate * 100, 2),
                "l3_hit_rate": round(l3.hit_rate * 100, 2),
                "avg_access_time": round(total_cycles / completed, 2),
            })

    n = len(trace)
    overall_miss_rate = (1 - l1.hit_rate) * (1 - l2.hit_rate) * (1 - l3.hit_rate)
    return {
        "l1_hit_rate": round(l1.hit_rate * 100, 4),
        "l2_hit_rate": round(l2.hit_rate * 100, 4),
        "l3_hit_rate": round(l3.hit_rate * 100, 4),
        "overall_miss_rate": round(overall_miss_rate * 100, 4),
        "avg_access_time": round(total_cycles / n, 4),
        "memory_traffic": memory_traffic,
        "total_accesses": n,
        "l1_utilization": round(l1.avg_utilization * 100, 2),
        "l2_utilization": round(l2.avg_utilization * 100, 2),
        "l3_utilization": round(l3.avg_utilization * 100, 2),
        "l1_cycles": l1_cyc,
        "l2_cycles": l2_cyc,
        "l3_cycles": l3_cyc,
        "ram_cycles": ram_cyc,
        "total_cycles": total_cycles,
        "timeline": timeline,
    }


def _compute_counterfactual(inp: SimulationInput, stats: dict, trace: List[int]) -> Optional[dict]:
    total = stats["total_cycles"]
    if total == 0:
        return None

    contributions = {
        "L2": stats["l2_cycles"],
        "L3": stats["l3_cycles"],
        "RAM": stats["ram_cycles"],
    }
    bottleneck = max(contributions, key=lambda k: contributions[k])

    # Decide which level to double
    level_to_double = "L3" if bottleneck in ("RAM", "L3") else "L2"
    defaults = {"L1": 32, "L2": 256, "L3": 8192}
    original_size = inp.cache_config.get(level_to_double, {}).get("size_kb", defaults[level_to_double])
    doubled_size = min(original_size * 2, 65536)

    cfg = copy.deepcopy(inp.cache_config)
    if level_to_double not in cfg:
        cfg[level_to_double] = {}
    cfg[level_to_double]["size_kb"] = doubled_size

    l1c = _build_cache("L1", cfg)
    l2c = _build_cache("L2", cfg)
    l3c = _build_cache("L3", cfg)
    cf = _simulate_core(l1c, l2c, l3c, trace, inp.write_fraction)

    improvement_pct = (stats["avg_access_time"] - cf["avg_access_time"]) / stats["avg_access_time"] * 100
    if improvement_pct < 0.5:
        return None

    def size_label(kb: int) -> str:
        return f"{kb // 1024} MB" if kb >= 1024 else f"{kb} KB"

    return {
        "bottleneck_level": bottleneck,
        "level_doubled": level_to_double,
        "suggestion": f"Double {level_to_double} from {size_label(original_size)} to {size_label(doubled_size)}",
        "original_avg_cycles": round(stats["avg_access_time"], 2),
        "improved_avg_cycles": round(cf["avg_access_time"], 2),
        "improvement_pct": round(improvement_pct, 1),
    }


def _generate_insight(inp: SimulationInput, stats: dict) -> str:
    ws = inp.working_set_kb
    cfg = inp.cache_config
    l1_kb   = cfg.get("L1", {}).get("size_kb", 32)
    l2_kb   = cfg.get("L2", {}).get("size_kb", 256)
    l3_kb   = cfg.get("L3", {}).get("size_kb", 8192)
    l1_assoc = cfg.get("L1", {}).get("associativity", 4)
    l1_policy = cfg.get("L1", {}).get("policy", "LRU")

    l1_rate = stats["l1_hit_rate"]
    l2_rate = stats["l2_hit_rate"]
    total   = stats["total_cycles"]
    ram_pct = stats["ram_cycles"] / total * 100 if total > 0 else 0

    def kb_label(kb: int) -> str:
        return f"{kb // 1024}MB" if kb >= 1024 else f"{kb}KB"

    if inp.workload == "thrash_lru":
        if ws <= l1_kb:
            return (f"Working set ({kb_label(ws)}) fits in L1 — {l1_rate:.0f}% hit rate. "
                    "Increase working set above L1 size to see LRU thrashing kick in.")
        policy_tip = (f" Switch to Random replacement to break the cycle — it avoids this worst case."
                      if l1_policy == "LRU" else
                      f" {l1_policy} replacement partially avoids LRU's worst-case thrashing.")
        return (f"Cyclic scan ({kb_label(ws)}) exceeds L1 ({kb_label(l1_kb)}) — LRU evicts exactly what's "
                f"needed next, yielding {l1_rate:.0f}% L1 hit rate after warmup.{policy_tip}")

    if ws <= l1_kb:
        if l1_rate >= 88:
            return (f"Working set ({kb_label(ws)}) fits in L1 ({kb_label(l1_kb)}) — "
                    "near-optimal locality, most data served at 4 cycles.")
        if l1_assoc == 1:
            return (f"Working set fits in L1 but only {l1_rate:.0f}% hit rate — "
                    "direct-mapped (1-way) causes conflict misses when accesses hash to the same set.")
        return (f"Working set ({kb_label(ws)}) fits in L1 ({kb_label(l1_kb)}) but {l1_rate:.0f}% hit rate — "
                "this workload's irregular access pattern causes L1 thrashing despite sufficient capacity.")

    if ws <= l2_kb:
        if l1_rate >= 70:
            return (f"Working set ({kb_label(ws)}) exceeds L1 ({kb_label(l1_kb)}) but fits in L2 — "
                    f"{l1_rate:.0f}% of accesses hit L1; the rest pay the 12-cycle L2 penalty.")
        return (f"Working set ({kb_label(ws)}) exceeds L1 ({kb_label(l1_kb)}) — "
                f"only {l1_rate:.0f}% L1 hit rate. Increasing L1 or reducing working set would help most.")

    if ws <= l3_kb:
        if ram_pct < 8:
            return (f"Working set ({kb_label(ws)}) is contained by L3 ({kb_label(l3_kb)}) — "
                    f"most misses resolve at 40-cycle L3 cost; {l2_rate:.0f}% still hit L2.")
        return (f"Working set ({kb_label(ws)}) exceeds L1+L2, spilling heavily into L3 — "
                f"{ram_pct:.1f}% of cycles are still RAM penalties despite L3.")

    return (f"Working set ({kb_label(ws)}) exceeds all caches (L3={kb_label(l3_kb)}) — "
            f"{ram_pct:.0f}% of cycles are 200-cycle RAM penalties. "
            "Prefetching or tiling would help more than cache resizing here.")


def run_simulation(inp: SimulationInput) -> SimulationResult:
    l1 = _build_cache("L1", inp.cache_config)
    l2 = _build_cache("L2", inp.cache_config)
    l3 = _build_cache("L3", inp.cache_config)

    if inp.custom_trace:
        trace = inp.custom_trace
    elif inp.workload in WORKLOAD_GENERATORS:
        trace = WORKLOAD_GENERATORS[inp.workload](inp.working_set_kb)
    else:
        raise ValueError(f"Unknown workload: {inp.workload}")

    stats = _simulate_core(l1, l2, l3, trace, inp.write_fraction)
    counterfactual = _compute_counterfactual(inp, stats, trace)
    insight = _generate_insight(inp, stats) if not inp.custom_trace else None

    return SimulationResult(
        l1_hit_rate=stats["l1_hit_rate"],
        l2_hit_rate=stats["l2_hit_rate"],
        l3_hit_rate=stats["l3_hit_rate"],
        overall_miss_rate=stats["overall_miss_rate"],
        avg_access_time=stats["avg_access_time"],
        memory_traffic=stats["memory_traffic"],
        total_accesses=stats["total_accesses"],
        l1_utilization=stats["l1_utilization"],
        l2_utilization=stats["l2_utilization"],
        l3_utilization=stats["l3_utilization"],
        l1_cycles=stats["l1_cycles"],
        l2_cycles=stats["l2_cycles"],
        l3_cycles=stats["l3_cycles"],
        ram_cycles=stats["ram_cycles"],
        timeline=stats["timeline"],
        counterfactual=counterfactual,
        insight=insight,
    )


def run_sweep(
    cache_config: dict, workload: str, sweep_level: str,
    sizes: List[int], working_set_kb: int, write_fraction: float
) -> List[dict]:
    """Run simulations varying one level's size."""
    if workload not in WORKLOAD_GENERATORS:
        raise ValueError(f"Unknown workload: {workload}")
    trace = WORKLOAD_GENERATORS[workload](working_set_kb)
    results = []
    for size_kb in sizes:
        cfg = copy.deepcopy(cache_config)
        if sweep_level not in cfg:
            cfg[sweep_level] = {}
        cfg[sweep_level]["size_kb"] = size_kb
        l1 = _build_cache("L1", cfg)
        l2 = _build_cache("L2", cfg)
        l3 = _build_cache("L3", cfg)
        s = _simulate_core(l1, l2, l3, trace, write_fraction)
        results.append({
            "size_kb": size_kb,
            "l1_hit_rate": s["l1_hit_rate"],
            "l2_hit_rate": s["l2_hit_rate"],
            "l3_hit_rate": s["l3_hit_rate"],
            "avg_access_time": s["avg_access_time"],
        })
    return results
