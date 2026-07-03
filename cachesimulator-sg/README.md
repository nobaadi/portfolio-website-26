# Memory Hierarchy Lab: Interactive CPU Cache Simulator

An interactive, full-stack CPU cache simulator for building real intuition about memory hierarchy behaviour. Configure L1/L2/L3 caches, run synthetic workloads or your own memory address traces, and immediately see how every parameter change affects hit rates, cycle costs, and memory traffic.

**The goal:** make cache theory tangible -- the kind of understanding that lets you explain why your matrix multiply runs 4x faster after loop reordering, not just recite the AMAT formula.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-async-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com)

---

## Live Demo

The frontend is deployed on Vercel. The simulation backend requires a running server -- run it locally using the setup instructions below or with Docker.

```bash
# Fastest path: Docker
docker compose up --build
# Then open http://localhost:5173
```

---

## What It Does

### Simulator tab
- Configure a full **3-level cache hierarchy** (L1 / L2 / L3) with independent size, block size, associativity, replacement policy (LRU / FIFO / Random), and write policy (write-back / write-through)
- Cache geometry is displayed live under each level: `512 sets × 4 ways × 64 B = 128 KB` — showing the actual hardware math behind the sliders
- Choose from five representative workloads (matrix multiply, merge sort, random access, graph BFS, LRU thrash) or **upload your own hex/decimal address trace** (up to 500 k addresses)
- **Write fraction slider** — control what share of accesses are writes (0 % = read-only, 100 % = write-only); meaningfully affects cycle cost and dirty-eviction traffic
- Results show hit rates, AMAT, memory traffic, cache utilisation, cycle-cost breakdown, a **hit-rate timeline** (warm-up curve over the trace), and an automatic **bottleneck counterfactual** ("doubling L2 would reduce avg cycles by 23%")
- **Workload insight bullets** — auto-generated interpretation specific to the active workload and results
- **Size sweep** — vary any cache level across its full range in one click; the performance cliff is detected and annotated automatically ("Cliff at 64 KB — L2 boundary")
- **Cache concept glossary** shown in the empty state before the first run
- Latency reference always visible: `L1: 4c → L2: 12c → L3: 40c → RAM: 200c`
- **⌘/Ctrl+Enter** to run

### Compare tab
- Side-by-side A/B configuration — independent cache configs, workloads, and working-set sizes
- Shared **write fraction** slider so both configs run under the same access profile
- **Δ Delta Analysis table** — every metric diffed numerically (e.g. `L1 Hit Rate: A=71.4% / B=87.2% → +15.8 pp, B wins`)
- Headline verdict: "*Config B is 31.4% faster (4.2 fewer avg cycles per access)*"
- Grouped bar chart across all metrics
- **Workload mismatch warning** when Config A and B use different workloads (delta numbers would be misleading)

### History tab
- All runs persisted to SQLite — click any row to expand its full results dashboard
- **Export CSV** downloads all experiments for external analysis

---

## Benchmark: Matrix Multiply Cache Cliff

`backend/matrix_multiply_trace.txt` is a real memory access trace from a **64×64 float32 naive matrix multiply** (i-j-k loop order, row-major storage):

```
C[i][j] += A[i][k] * B[k][j]   for i,j,k in range(64)
```

| Access pattern | Behaviour |
|---|---|
| `A[i][k]` (k varies) | Row-sequential — cache-friendly, stride = 4 B |
| `B[k][j]` (k varies, j fixed) | **Column-sequential** — cache-hostile, stride = 256 B (64 × 4 B) |
| `C[i][j]` (j fixed in inner loop) | High temporal reuse — hits in register / L1 |

**Working set:** 3 × 64 × 64 × 4 B = **48 KB** total.

Upload this trace and sweep L1 size to see the cliff:

| L1 size | Expected behaviour |
|---|---|
| 16 KB | Matrices don't fit; B column-accesses thrash L1 → low hit rate |
| 32 KB | Right at the boundary; LRU policy determines whether blocks survive |
| 64 KB | All three matrices fit; hit rate jumps significantly |

This is the same phenomenon that explains why `for(k) for(j)` inner loops saturate L1 bandwidth while `for(j) for(k)` causes a 10× slowdown on a real CPU — visible directly in the simulator.

---

## The Simulation Engine

The core is a **correct set-associative cache** implementation, not a simplified approximation:

1. **Address decomposition** — for each access, extract block-offset bits, index bits, and tag bits from the raw address based on the configured geometry. Conflict misses are correctly modelled.
2. **Replacement policies**:
   - LRU: `collections.OrderedDict` — O(1) move-to-end on hit, evict oldest on miss
   - FIFO: `collections.deque` — evict first-inserted regardless of recency
   - Random: uniform random eviction — useful baseline showing LRU's advantage
3. **Write policies**: write-back accumulates dirty blocks (counted as memory traffic on eviction); write-through generates a memory write on every store
4. **Hierarchy**: L1 miss → probe L2 → probe L3 → go to RAM; each level's result contributes to the AMAT via weighted cycle costs
5. **AMAT formula**: `AMAT = L1_hit_rate × L1_lat + L1_miss_rate × (L2_hit_rate × L2_lat + L2_miss_rate × (L3_hit_rate × L3_lat + L3_miss_rate × RAM_lat))`

Latencies (cycles): L1 = 4, L2 = 12, L3 = 40, RAM = 200 — matching typical modern x86 values.

---

## Why This Matters for Data Engineering

Cache behaviour is not just a systems topic. Every data-intensive workload runs into it:

**Columnar storage (Parquet, Arrow).** Column-oriented formats improve analytical query performance because a scan of one column has stride-1 access -- every read is the next sequential cache line. Row-oriented storage (Postgres heap, CSV) causes cache thrashing when only a few columns are needed. The simulator makes this difference measurable: run the matrix multiply trace (column-major B access) vs. the sequential scan workload and watch the L1 hit rate diverge.

**ML inference throughput.** Embedding lookups in recommendation models are essentially random memory accesses into large embedding tables. The random access workload in the simulator reproduces this pattern and shows exactly why embedding tables that exceed L3 are a throughput bottleneck regardless of compute capacity.

**Query engine loop ordering.** Hash join probes, sort-merge join scans, and GROUP BY aggregations all have distinct memory access patterns. A nested-loop join that iterates the inner table in the wrong order causes the same column-major thrashing visible in the matrix multiply trace.

**Cache-aware data structure design.** The sweep feature lets you find the cache size at which a workload transitions from L2-resident to L3-resident -- the same cliff that determines whether a B-tree node size fits in a cache line or crosses a boundary.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, async SQLAlchemy, SQLite (aiosqlite) |
| Frontend | React 19, TypeScript, Vite, React Router v7, TanStack Query, Recharts |
| Simulation | Pure Python set-associative model; address bit-decomposition |

## Architecture Decisions

**Why FastAPI and not Flask?** Async-native — the simulation (CPU-bound per request) is offloaded to a thread pool via `run_in_executor`, keeping the event loop free. Under concurrent load (e.g. "Run Both" in Compare tab) both simulations run in parallel.

**Why SQLite?** Zero-config persistence for a single-user tool. Swapping to Postgres requires only a connection string change — SQLAlchemy abstracts everything else.

**Why TanStack Query?** Provides automatic stale-while-revalidate caching of experiment history and presets — the History tab feels instant on repeated visits with no manual cache management code.

**Simulation accuracy trade-off:** The engine models set-associativity and conflict misses correctly but does not model instruction caches, TLB misses, prefetcher effects, or out-of-order execution. It accurately represents the *data cache* behaviour of a sequential trace.

---

## Setup

### Docker (recommended)

```bash
docker compose up --build
```

Backend: http://localhost:8001
Frontend: http://localhost:5173
API docs: http://localhost:8001/docs

### Manual

**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8001`.

---

## Project Structure

```
cachesimulator/
├── backend/
│   ├── main.py                    # FastAPI routes
│   ├── simulator.py               # Cache simulation engine (set-associative, AMAT)
│   ├── models.py                  # SQLAlchemy ORM models
│   ├── schemas.py                 # Pydantic request/response schemas
│   ├── database.py                # Async SQLite initialisation
│   ├── presets.py                 # CPU architecture presets (Intel/AMD baselines)
│   ├── matrix_multiply_trace.txt  # Real benchmark trace (64×64 matmul, 500k accesses)
│   └── sample_trace.txt           # Minimal example trace for quick testing
└── frontend/src/
    ├── pages/
    │   ├── SimulatorPage.tsx      # Main simulator + sweep UI
    │   ├── ComparePage.tsx        # A/B comparison with delta analysis
    │   └── HistoryPage.tsx        # Persistent experiment history + CSV export
    ├── components/
    │   ├── CacheConfigPanel.tsx   # Hierarchy configuration with geometry display
    │   ├── ResultsDashboard.tsx   # KPI cards, timeline chart, utilisation bars
    │   ├── SweepPanel.tsx         # Sweep chart with cliff auto-annotation
    │   ├── InsightPanel.tsx       # Workload-aware auto-generated insight bullets
    │   └── ConceptExplainer.tsx   # Cache concept glossary (shown before first run)
    ├── api.ts                     # Typed Axios HTTP client
    └── types.ts                   # Shared TypeScript interfaces
```
```

## Example: Why Matrix Multiply Stresses Caches

With default settings (32 KB L1, 4-way LRU), matrix multiply on a 48×48 matrix gives ~85% L1 hit rate. The misses come from matrix B's column-major access pattern — each `B[k][j]` step strides `n * 4 = 192` bytes, crossing cache lines. Increasing L1 to 64 KB with 8-way associativity improves this to ~92%. The simulator makes this tradeoff visible in seconds.
