"""
Trade History Router — paginated, filterable trade list + update exit endpoint.
"""
from datetime import datetime, date
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Trade, ExitReason, BehaviourLog, EventType
from schemas import TradeOut

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/trades", response_model=List[TradeOut])
def get_trade_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    # Filters
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to:   Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    symbol:    Optional[str]  = Query(None, description="Symbol contains"),
    setup_type: Optional[str] = Query(None, description="Exact setup type"),
    is_impulse: Optional[bool] = Query(None, description="Filter impulse trades"),
    plan_followed: Optional[bool] = Query(None, description="Filter plan-followed trades"),
    exit_reason: Optional[ExitReason] = Query(None, description="Filter by exit reason"),
    is_open: Optional[bool] = Query(None, description="True = open trades (no exit price)"),
    # Pagination
    page:  int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Paginated, filterable trade history."""
    q = db.query(Trade).filter(Trade.user_id == current_user.id)

    if date_from:
        q = q.filter(Trade.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Trade.created_at <= datetime.combine(date_to, datetime.max.time()))
    if symbol:
        q = q.filter(Trade.symbol.ilike(f"%{symbol}%"))
    if setup_type:
        q = q.filter(Trade.setup_type == setup_type)
    if is_impulse is not None:
        q = q.filter(Trade.is_impulse_trade == is_impulse)
    if plan_followed is not None:
        q = q.filter(Trade.was_plan_followed == plan_followed)
    if exit_reason:
        q = q.filter(Trade.exit_reason == exit_reason)
    if is_open is True:
        q = q.filter(Trade.exit_price == None)
    elif is_open is False:
        q = q.filter(Trade.exit_price != None)

    total = q.count()
    trades = q.order_by(Trade.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return trades


@router.get("/trades/{trade_id}", response_model=TradeOut)
def get_trade_detail(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trade = db.query(Trade).filter(
        Trade.id == trade_id, Trade.user_id == current_user.id
    ).first()
    if not trade:
        from fastapi import HTTPException
        raise HTTPException(404, "Trade not found")
    return trade


@router.put("/trades/{trade_id}/exit", response_model=TradeOut)
def update_trade_exit(
    trade_id: int,
    exit_price: float = Query(..., gt=0),
    exit_reason: ExitReason = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update exit details and recalculate PnL for an open trade."""
    from fastapi import HTTPException
    trade = db.query(Trade).filter(
        Trade.id == trade_id, Trade.user_id == current_user.id
    ).first()
    if not trade:
        raise HTTPException(404, "Trade not found")

    trade.exit_price = exit_price
    trade.exit_reason = exit_reason
    trade.pnl = (exit_price - trade.entry_price) * trade.quantity

    # Flag emotional exits as rule breaks
    if exit_reason in [ExitReason.FEAR, ExitReason.GREED]:
        db.add(BehaviourLog(
            user_id=current_user.id,
            event_type=EventType.RULE_BREAK,
            description=f"Trade #{trade_id} exited due to {exit_reason.value} — emotional exit detected",
        ))
    db.commit()
    db.refresh(trade)
    return trade


@router.get("/stats")
def get_history_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
):
    """Aggregate stats: win rate, avg PnL, best/worst trade, streak."""
    q = db.query(Trade).filter(Trade.user_id == current_user.id, Trade.pnl != None)
    if date_from:
        q = q.filter(Trade.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Trade.created_at <= datetime.combine(date_to, datetime.max.time()))

    trades = q.all()
    if not trades:
        return {"total": 0, "wins": 0, "losses": 0, "win_rate": 0.0,
                "total_pnl": 0.0, "avg_pnl": 0.0, "best_trade": 0.0, "worst_trade": 0.0,
                "impulse_count": 0, "open_trades": 0}

    pnls = [t.pnl for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]

    # Open trades (no exit price)
    open_count = db.query(Trade).filter(
        Trade.user_id == current_user.id, Trade.exit_price == None
    ).count()

    return {
        "total": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / len(trades) * 100, 1),
        "total_pnl": round(sum(pnls), 2),
        "avg_pnl": round(sum(pnls) / len(pnls), 2),
        "best_trade": round(max(pnls), 2),
        "worst_trade": round(min(pnls), 2),
        "impulse_count": sum(1 for t in trades if t.is_impulse_trade),
        "open_trades": open_count,
    }
