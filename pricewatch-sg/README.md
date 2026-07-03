# PriceWatch SG

Personal inflation tracker for Singapore. Ingests live CPI data from the SingStat TableBuilder API, weights it against your actual spending, and shows exactly how your inflation rate diverges from the national headline.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com)

## What It Does

Singapore headline CPI is a weighted average across all households. If your spending skews toward food and away from transport, your real inflation rate differs from what the government publishes. PriceWatch SG makes that difference visible and quantifiable.

You enter your monthly spending by category. The backend pulls half-yearly CPI percent-change figures from the SingStat TableBuilder API, weights each category by your spending proportion, and computes your personal inflation rate. You can also run counterfactuals: what happens to your personal rate if food spending increases 20%?

**Data source:** SingStat TableBuilder API, tables M214001 / M214011 / M214021 for lowest-20%, middle-60%, and highest-20% income households. No API key required. Official government CPI at category level, updated half-yearly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, async SQLAlchemy 2.0, asyncpg |
| ETL pipeline | httpx (async HTTP), SingStat TableBuilder API, APScheduler |
| Database | PostgreSQL 16 |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Infra | Docker Compose, GitHub Actions CI |

---

## Architecture

```
SingStat TableBuilder API (M214011)
         |
         v
data_pipeline/ingestion.py      async HTTP fetch with httpx; graceful degradation
                                 on API failure; audit log entry on every run
         |
         v
data_pipeline/normalizer.py     parse SingStat series/period structure;
                                 map half-year labels (1H -> month 1, 2H -> month 7)
         |
         v
PostgreSQL
  CPISeries          one row per CPI category (Food, Housing, Transport, ...)
  CPIMonthlyIndex    one row per (series, year, month); stores YoY percent-change
  DataIngestionLog   audit trail: success flag, series count, records stored, error
  UserSpendingProfile / MonthlySpendingLog   persisted user spending by session
         |
         v
services/calculator.py    personal_rate = sum(weight_i * category_rate_i)
                          weight_i = user_spending_i / total_spending
services/analysis.py      driver decomposition, historical trend, what-if simulation
services/scheduler.py     APScheduler background job refreshes data on interval
         |
         v
FastAPI (/api/cpi, /api/calculate, /api/analysis, /api/user, /api/simulation)
         |
         v
React frontend
  SpendingInput -> personal inflation card -> category driver breakdown ->
  trend chart -> household comparison -> what-if simulation panel
```

---

## Key Technical Decisions

**Async SQLAlchemy throughout.** Every database call uses `AsyncSession` with the asyncpg driver. SingStat can take 5-10 seconds to respond; running the ETL pipeline as an async background job means it never blocks request handling.

**Upsert with revision handling.** SingStat occasionally revises recent CPI values after initial publication. The ingestion pipeline does SELECT-then-UPDATE rather than blind INSERT, so revised figures replace stale ones without creating duplicate rows. New rows are tracked separately from updates in the audit log.

**Completeness validation gate.** After each ingestion run, the pipeline compares the count of series returned by the API against the count stored in the database. Divergence is flagged as failed in `DataIngestionLog`. The application still starts and serves existing data -- a temporary SingStat outage does not take the frontend down.

**Simulated retail prices.** SingStat publishes aggregate CPI by broad category but no Singapore supermarket has a public price API. The `SimulatedSupermarketScraper` generates individual item prices using real SingStat CPI benchmarks as anchors with small Gaussian noise. The personal inflation calculation uses real official data; the per-item price granularity is approximated from those same benchmarks. The `ScrapedPrice` interface means swapping in a real Playwright scraper requires no other code changes.

**User-defined spending weights.** The Singapore Household Expenditure Survey provides average weights, but average weights are exactly the problem this tool solves. User-entered spending is the input; weights are computed from that, not borrowed from aggregate statistics.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/cpi/latest` | Latest CPI rates for all tracked categories |
| GET | `/api/cpi/latest?benchmark_key=lowest20` | Switch income bracket (lowest20 / middle60 / highest20) |
| GET | `/api/cpi/series/{name}/history` | Historical CPI trend for one category |
| GET | `/api/cpi/status` | Ingestion status and last successful run time |
| POST | `/api/calculate/personal-inflation` | Compute weighted personal inflation from spending JSON |
| GET | `/api/analysis/inflation-drivers` | Category decomposition of personal vs national gap |
| GET | `/api/analysis/inflation-trend` | Historical personal vs national inflation (up to 24 periods) |
| GET | `/api/analysis/household-comparison` | Plain-language comparison with contributing reasons |
| GET | `/api/analysis/anomalies?z_threshold=2.0` | Categories where latest inflation is 2+ std devs above historical mean; returns z-score, baseline stats, and deviation magnitude per flagged category |
| POST | `/api/simulation/lifestyle` | Apply spending deltas, recompute personal rate |
| POST | `/api/user/spending` | Save spending profile for a session |
| GET | `/api/user/spending/{session_id}` | Load saved spending profile |
| GET | `/health` | Health check |

---

## Setup

### Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

Backend: http://localhost:8000
Frontend: http://localhost:3000
API docs: http://localhost:8000/docs

### Manual

**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env        # fill in DATABASE_URL
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

See `.env.example`. Key variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | asyncpg connection string: `postgresql+asyncpg://user:pass@host:5432/db` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | used by Docker Compose to init the Postgres container |
| `ALLOWED_ORIGINS` | CORS allowlist, comma-separated or `*` for local dev |
| `VITE_API_URL` | backend base URL used by the Vite dev proxy |
| `CPI_REFRESH_MINUTES` | background scheduler interval in minutes (default: 1; recommended for prod: 1440) |

---

## SQL Analytics

The [/sql](./sql/) folder contains standalone analytical queries that run directly against the PostgreSQL database -- window functions, CTEs, and aggregations for inflation trend analysis. These do not require the application to be running.

---

## Project Structure

```
pricewatch-sg/
├── backend/
│   └── app/
│       ├── api/                  FastAPI route handlers
│       ├── data_pipeline/
│       │   ├── ingestion.py      ETL: async fetch, upsert, validate, audit log
│       │   └── normalizer.py     SingStat JSON normalisation
│       ├── db/
│       │   └── database.py       async SQLAlchemy engine and session factory
│       ├── models/               SQLAlchemy ORM models
│       └── services/
│           ├── calculator.py     personal inflation formula
│           ├── analysis.py       driver decomposition, trend, simulation logic
│           ├── scheduler.py      APScheduler background job
│           └── scraper.py        price data layer
├── frontend/
│   └── src/
│       ├── components/           chart and card components
│       ├── hooks/                data-fetching hooks
│       └── pages/                Dashboard
├── sql/                          standalone analytics queries (window functions, CTEs)
├── .github/workflows/ci.yml      GitHub Actions CI
├── docker-compose.yml
└── .env.example
```
