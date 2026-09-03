from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, TradingPlan, BehaviourLog, EventType
from schemas import TradingPlanCreate, TradingPlanOut, TradingPlanUpdate

router = APIRouter(prefix="/plan", tags=["plan"])


def _log(db: Session, user_id: int, event: EventType, desc: str):
    db.add(BehaviourLog(user_id=user_id, event_type=event, description=desc))


@router.post("", response_model=TradingPlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: TradingPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create today's trading plan. Only one plan per day per user."""
    existing = (
        db.query(TradingPlan)
        .filter(TradingPlan.user_id == current_user.id, TradingPlan.date == date.today())
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A plan already exists for today. Use PUT to update it.")

    plan = TradingPlan(user_id=current_user.id, **payload.model_dump())
    db.add(plan)
    _log(db, current_user.id, EventType.PLAN_CREATED, f"Created plan for {date.today()} | Market: {payload.market} | Bias: {payload.bias}")
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/today", response_model=Optional[TradingPlanOut])
def get_today_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch today's plan for the logged-in user."""
    plan = (
        db.query(TradingPlan)
        .filter(TradingPlan.user_id == current_user.id, TradingPlan.date == date.today())
        .first()
    )
    return plan  # Returns null if no plan yet


@router.put("/{plan_id}", response_model=TradingPlanOut)
def update_plan(
    plan_id: int,
    payload: TradingPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a plan. If the plan is locked, logs it as a plan_modified_after_lock violation."""
    plan = db.query(TradingPlan).filter(
        TradingPlan.id == plan_id, TradingPlan.user_id == current_user.id
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Detect which fields are actually changing
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return plan

    if plan.is_locked:
        changed_fields = ", ".join(update_data.keys())
        _log(
            db, current_user.id, EventType.PLAN_MODIFIED_AFTER_LOCK,
            f"⚠️ Plan #{plan_id} was modified AFTER locking! Changed fields: {changed_fields}"
        )

    for key, value in update_data.items():
        setattr(plan, key, value)

    db.commit()
    db.refresh(plan)
    return plan


@router.post("/{plan_id}/lock", response_model=TradingPlanOut)
def lock_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lock the plan. Once locked, further modifications are flagged as violations."""
    plan = db.query(TradingPlan).filter(
        TradingPlan.id == plan_id, TradingPlan.user_id == current_user.id
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.is_locked:
        raise HTTPException(status_code=400, detail="Plan is already locked")

    plan.is_locked = True
    plan.locked_at = datetime.utcnow()
    _log(db, current_user.id, EventType.PLAN_LOCKED, f"🔒 Plan #{plan_id} locked at {plan.locked_at.isoformat()}")
    db.commit()
    db.refresh(plan)
    return plan


@router.get("", response_model=list[TradingPlanOut])
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 30,
):
    """List past trading plans (most recent first)."""
    return (
        db.query(TradingPlan)
        .filter(TradingPlan.user_id == current_user.id)
        .order_by(TradingPlan.date.desc())
        .limit(limit)
        .all()
    )
