"""
Personal inflation calculator endpoint.

  POST /calculate/personal-inflation
        Input:  { spending: { "Food": 450, "Housing & Utilities": 1200, ... } }
    Output: personal rate, national rate, per-category breakdown, projection
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.calculator import calculate_personal_inflation

router = APIRouter(prefix="/calculate", tags=["calculator"])


class SpendingInput(BaseModel):
    """Monthly spending (SGD) per CPI category name."""
    spending: dict[str, float]

    @field_validator("spending")
    @classmethod
    def validate_spending(cls, v: dict) -> dict:
        if not v:
            raise ValueError("Spending map cannot be empty.")
        for category, amount in v.items():
            if amount < 0:
                raise ValueError(
                    f"Spending for '{category}' cannot be negative (got {amount})."
                )
        return v


@router.post("/personal-inflation")
async def compute_personal_inflation(
    payload: SpendingInput,
    db: AsyncSession = Depends(get_db),
):
    """Compute the caller's personal inflation rate.

        Weights each category's latest CPI rate by its share of total spending,
    then sums to get a single personal inflation figure.

    Also returns:
            - national inflation ("All Items")
            - per-category breakdown with individual contributions
            - projected annual spending if inflation continues at current rate
    """
    try:
        result = await calculate_personal_inflation(db, payload.spending)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "personal_inflation_rate": result.personal_inflation_rate,
        "national_inflation_rate": result.national_inflation_rate,
        "total_monthly_spending": result.total_monthly_spending,
        "projected_annual_spending": result.projected_annual_spending,
        "period": result.period,
        "category_breakdown": [
            {
                "category": b.category,
                "spending": b.spending,
                "weight": b.weight,
                "inflation_rate": b.inflation_rate,
                "contribution": b.contribution,
            }
            for b in result.category_breakdown
        ],
        "warnings": result.warnings,
    }
