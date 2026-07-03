"""Simulation endpoints for lifestyle what-if scenarios."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.analysis import load_spending_for_session, run_lifestyle_simulation

router = APIRouter(prefix="/simulation", tags=["simulation"])


class LifestyleSimulationInput(BaseModel):
    """Body for POST /simulation/lifestyle."""

    session_id: Optional[str] = None
    base_spending: Optional[dict[str, float]] = None
    category_changes: dict[str, float]

    @field_validator("category_changes")
    @classmethod
    def validate_changes(cls, value: dict[str, float]) -> dict[str, float]:
        if not value:
            raise ValueError("category_changes cannot be empty.")

        for category, delta in value.items():
            if delta < -1.0:
                raise ValueError(
                    f"Change for '{category}' cannot be less than -1.0 (100% reduction)."
                )
            if delta > 3.0:
                raise ValueError(
                    f"Change for '{category}' is too large; max allowed is +3.0."
                )
        return value


@router.post("/lifestyle")
async def simulate_lifestyle(
    payload: LifestyleSimulationInput,
    db: AsyncSession = Depends(get_db),
):
    """Apply category spending changes and return updated inflation output."""
    try:
        base_spending = payload.base_spending or {}
        if not base_spending:
            if not payload.session_id:
                raise ValueError(
                    "Provide base_spending or session_id for simulation baseline."
                )
            base_spending = await load_spending_for_session(db, payload.session_id)

        if not base_spending:
            raise ValueError("No baseline spending profile found for simulation.")

        return await run_lifestyle_simulation(
            db,
            base_spending=base_spending,
            category_changes=payload.category_changes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
