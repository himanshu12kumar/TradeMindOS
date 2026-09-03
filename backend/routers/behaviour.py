from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, BehaviourLog, EventType
from schemas import BehaviourLogCreate, BehaviourLogOut

router = APIRouter(prefix="/behaviour-log", tags=["behaviour"])


@router.post("", response_model=BehaviourLogOut, status_code=201)
def create_log(
    payload: BehaviourLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually create a behaviour log entry."""
    log = BehaviourLog(
        user_id=current_user.id,
        event_type=payload.event_type,
        description=payload.description,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("", response_model=list[BehaviourLogOut])
def list_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    event_type: Optional[EventType] = Query(None, description="Filter by event type"),
    date_from:  Optional[str] = Query(None, description="YYYY-MM-DD start date"),
    date_to:    Optional[str] = Query(None, description="YYYY-MM-DD end date"),
    limit: int = Query(100, ge=1, le=500),
    page:  int = Query(1, ge=1),
):
    """Fetch behaviour events with optional filters (newest first)."""
    from datetime import date as date_type
    q = db.query(BehaviourLog).filter(BehaviourLog.user_id == current_user.id)

    if event_type:
        q = q.filter(BehaviourLog.event_type == event_type)
    if date_from:
        try:
            df = datetime.strptime(date_from, "%Y-%m-%d")
            q = q.filter(BehaviourLog.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            q = q.filter(BehaviourLog.created_at <= dt)
        except ValueError:
            pass

    return (
        q.order_by(BehaviourLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )


@router.get("/summary")
def behaviour_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(7, ge=1, le=90),
):
    """Summary stats: violations this period, best streak (days without violation)."""
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=days)
    logs = db.query(BehaviourLog).filter(
        BehaviourLog.user_id == current_user.id,
        BehaviourLog.created_at >= since,
    ).order_by(BehaviourLog.created_at.desc()).all()

    violation_types = {
        EventType.IMPULSE_TRADE, EventType.PLAN_MODIFIED_AFTER_LOCK,
        EventType.REVENGE_TRADE_WARNING, EventType.RULE_BREAK,
        EventType.TRADE_LIMIT_REACHED,
    }
    violations = [l for l in logs if l.event_type in violation_types]
    positive   = [l for l in logs if l.event_type in {EventType.PLAN_LOCKED}]

    # Calculate clean-day streak (days since last violation)
    streak = 0
    if violations:
        last_violation = violations[0].created_at.date()
        today = datetime.utcnow().date()
        streak = (today - last_violation).days
    else:
        streak = days  # No violations at all in the period

    return {
        "period_days": days,
        "total_events": len(logs),
        "violations": len(violations),
        "positive_events": len(positive),
        "clean_day_streak": streak,
        "violation_breakdown": {
            et.value: sum(1 for l in violations if l.event_type == et)
            for et in violation_types
            if any(l.event_type == et for l in violations)
        },
    }
