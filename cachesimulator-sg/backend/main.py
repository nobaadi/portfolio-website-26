import io
import csv
import json
import asyncio
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from database import init_db, get_db
from models import ExperimentResult
from schemas import (
    SimulateRequest, SimulateResponse, ExperimentSummary, ExperimentDetail,
    ArchitecturePreset, SweepRequest, SweepResponse, SweepPoint,
)
from simulator import SimulationInput, run_simulation, run_sweep
from presets import PRESETS


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Interactive Memory Hierarchy Lab API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://cachesimulator-4hiedzrld4-nobaadis-projects.vercel.app",
        "https://cachesimulator-sg.vercel.app",
        "https://cachesimulator-csp0uyley-nobaadis-projects.vercel.app",
        "https://cachesimulator-mb5mydoky-nobaadis-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/simulate", response_model=SimulateResponse, tags=["Simulation"])
async def simulate(req: SimulateRequest, db: AsyncSession = Depends(get_db)):
    config_dict = {
        "L1": req.cache_config.L1.model_dump(),
        "L2": req.cache_config.L2.model_dump(),
        "L3": req.cache_config.L3.model_dump(),
    }
    sim_input = SimulationInput(
        cache_config=config_dict,
        workload=req.workload,
        custom_trace=req.custom_trace,
        working_set_kb=req.working_set_kb,
        write_fraction=req.write_fraction,
    )
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, run_simulation, sim_input)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    experiment = ExperimentResult(
        name=req.name,
        workload=req.workload,
        cache_config=config_dict,
        l1_hit_rate=result.l1_hit_rate,
        l2_hit_rate=result.l2_hit_rate,
        l3_hit_rate=result.l3_hit_rate,
        overall_miss_rate=result.overall_miss_rate,
        avg_access_time=result.avg_access_time,
        memory_traffic=result.memory_traffic,
        total_accesses=result.total_accesses,
        l1_utilization=result.l1_utilization,
        l2_utilization=result.l2_utilization,
        l3_utilization=result.l3_utilization,
        l1_cycles=result.l1_cycles,
        l2_cycles=result.l2_cycles,
        l3_cycles=result.l3_cycles,
        ram_cycles=result.ram_cycles,
        counterfactual=result.counterfactual,
        timeline=result.timeline,
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)

    return SimulateResponse(
        id=experiment.id,
        l1_hit_rate=result.l1_hit_rate,
        l2_hit_rate=result.l2_hit_rate,
        l3_hit_rate=result.l3_hit_rate,
        overall_miss_rate=result.overall_miss_rate,
        avg_access_time=result.avg_access_time,
        memory_traffic=result.memory_traffic,
        total_accesses=result.total_accesses,
        l1_utilization=result.l1_utilization,
        l2_utilization=result.l2_utilization,
        l3_utilization=result.l3_utilization,
        l1_cycles=result.l1_cycles,
        l2_cycles=result.l2_cycles,
        l3_cycles=result.l3_cycles,
        ram_cycles=result.ram_cycles,
        timeline=result.timeline,
        counterfactual=result.counterfactual,
        insight=result.insight,
    )


@app.post("/sweep", response_model=SweepResponse, tags=["Simulation"])
async def sweep(req: SweepRequest):
    config_dict = {
        "L1": req.cache_config.L1.model_dump(),
        "L2": req.cache_config.L2.model_dump(),
        "L3": req.cache_config.L3.model_dump(),
    }
    try:
        loop = asyncio.get_event_loop()
        points = await loop.run_in_executor(
            None,
            lambda: run_sweep(
                config_dict, req.workload, req.sweep_level,
                req.sizes, req.working_set_kb, req.write_fraction,
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return SweepResponse(
        sweep_level=req.sweep_level,
        workload=req.workload,
        working_set_kb=req.working_set_kb,
        points=[SweepPoint(**p) for p in points],
    )


@app.post("/simulate/upload-trace", response_model=SimulateResponse, tags=["Simulation"])
async def simulate_from_trace(
    file: UploadFile = File(...),
    size_kb_l1: int = Query(32),
    size_kb_l2: int = Query(256),
    size_kb_l3: int = Query(8192),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    lines = content.decode("utf-8").strip().splitlines()
    trace: List[int] = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        try:
            trace.append(int(line, 0))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid address: {line!r}")
    if len(trace) > 500_000:
        raise HTTPException(status_code=400, detail="Trace too large (max 500 000 addresses).")

    from schemas import CacheConfig, CacheLevelConfig
    config = CacheConfig(
        L1=CacheLevelConfig(size_kb=size_kb_l1),
        L2=CacheLevelConfig(size_kb=size_kb_l2),
        L3=CacheLevelConfig(size_kb=size_kb_l3),
    )
    sim_req = SimulateRequest(cache_config=config, workload="custom", custom_trace=trace, name=file.filename)
    return await simulate(sim_req, db)


@app.get("/experiments", response_model=List[ExperimentSummary], tags=["Experiments"])
async def list_experiments(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExperimentResult).order_by(desc(ExperimentResult.created_at)).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        ExperimentSummary(
            id=r.id, name=r.name, workload=r.workload,
            l1_hit_rate=r.l1_hit_rate, l2_hit_rate=r.l2_hit_rate,
            l3_hit_rate=r.l3_hit_rate, overall_miss_rate=r.overall_miss_rate,
            avg_access_time=r.avg_access_time, total_accesses=r.total_accesses,
            created_at=r.created_at.isoformat(),
            l1_size_kb=(r.cache_config or {}).get("L1", {}).get("size_kb"),
            l2_size_kb=(r.cache_config or {}).get("L2", {}).get("size_kb"),
            l3_size_kb=(r.cache_config or {}).get("L3", {}).get("size_kb"),
        )
        for r in rows
    ]


@app.get("/experiments/{experiment_id}", response_model=ExperimentDetail, tags=["Experiments"])
async def get_experiment(experiment_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(ExperimentResult, experiment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return ExperimentDetail(
        id=row.id, name=row.name, workload=row.workload,
        cache_config=row.cache_config,
        l1_hit_rate=row.l1_hit_rate, l2_hit_rate=row.l2_hit_rate,
        l3_hit_rate=row.l3_hit_rate, overall_miss_rate=row.overall_miss_rate,
        avg_access_time=row.avg_access_time, memory_traffic=row.memory_traffic,
        total_accesses=row.total_accesses,
        l1_utilization=getattr(row, "l1_utilization", None) or 0.0,
        l2_utilization=getattr(row, "l2_utilization", None) or 0.0,
        l3_utilization=getattr(row, "l3_utilization", None) or 0.0,
        l1_cycles=getattr(row, "l1_cycles", None) or 0,
        l2_cycles=getattr(row, "l2_cycles", None) or 0,
        l3_cycles=getattr(row, "l3_cycles", None) or 0,
        ram_cycles=getattr(row, "ram_cycles", None) or 0,
        counterfactual=getattr(row, "counterfactual", None),
        timeline=row.timeline or [],
        created_at=row.created_at.isoformat(),
    )


@app.delete("/experiments/{experiment_id}", tags=["Experiments"])
async def delete_experiment(experiment_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(ExperimentResult, experiment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Experiment not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": experiment_id}


@app.get("/experiments/export/csv", tags=["Export"])
async def export_csv(db: AsyncSession = Depends(get_db)):
    stmt = select(ExperimentResult).order_by(desc(ExperimentResult.created_at))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "name", "workload",
        "l1_hit_rate_%", "l2_hit_rate_%", "l3_hit_rate_%",
        "overall_miss_rate_%", "avg_access_time_cycles",
        "memory_traffic_bytes", "total_accesses", "created_at",
        "l1_size_kb", "l1_block_size", "l1_associativity", "l1_policy", "l1_write_policy",
        "l2_size_kb", "l2_block_size", "l2_associativity", "l2_policy", "l2_write_policy",
        "l3_size_kb", "l3_block_size", "l3_associativity", "l3_policy", "l3_write_policy",
    ])
    for r in rows:
        cfg = r.cache_config or {}
        l1 = cfg.get("L1", {}); l2 = cfg.get("L2", {}); l3 = cfg.get("L3", {})
        writer.writerow([
            r.id, r.name or "", r.workload,
            r.l1_hit_rate, r.l2_hit_rate, r.l3_hit_rate,
            r.overall_miss_rate, r.avg_access_time,
            r.memory_traffic, r.total_accesses, r.created_at.isoformat(),
            l1.get("size_kb"), l1.get("block_size"), l1.get("associativity"), l1.get("policy"), l1.get("write_policy"),
            l2.get("size_kb"), l2.get("block_size"), l2.get("associativity"), l2.get("policy"), l2.get("write_policy"),
            l3.get("size_kb"), l3.get("block_size"), l3.get("associativity"), l3.get("policy"), l3.get("write_policy"),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=experiment_results.csv"},
    )


@app.get("/presets", response_model=List[ArchitecturePreset], tags=["Configuration"])
async def get_presets():
    return PRESETS


@app.get("/workloads", tags=["Configuration"])
async def get_workloads():
    return [
        {"id": "matrix_multiplication", "name": "Matrix Multiply", "description": "C = A×B — column-major B access causes conflict misses; classic cache-unfriendly pattern."},
        {"id": "sorting", "name": "Merge Sort", "description": "Sequential passes with repeated re-reads; good spatial locality, moderate temporal reuse."},
        {"id": "random_access", "name": "Random Access", "description": "Worst-case scatter across working set — no spatial or temporal locality."},
        {"id": "graph_traversal", "name": "Graph BFS", "description": "Pointer-chase BFS — irregular access, poor spatial locality, heavy L3/RAM pressure."},
        {"id": "thrash_lru", "name": "LRU Thrash", "description": "Cyclic scan just over cache size — exposes LRU worst-case vs Random replacement. Set working set ≈ L1 size."},
    ]


@app.get("/health", tags=["Meta"])
async def health():
    return {"status": "ok", "version": "2.0.0"}
