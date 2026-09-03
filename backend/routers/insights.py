"""
Insights Router — data for emotional correlation charts and performance analytics.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Trade, TradingPlan, EmotionalPhase
from routers.scores import calculate_daily_score

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/emotional-correlation")
def get_emotional_correlation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(90, ge=7, le=365, description="Look-back window in days"),
):
    """
    Returns trades with before/after emotional state scores alongside PnL.
    Used to plot scatter charts: e.g. FOMO vs P&L, Stress vs P&L.
    """
    since = datetime.utcnow() - timedelta(days=days)
    trades = (
        db.query(Trade)
        .filter(
            Trade.user_id == current_user.id,
            Trade.pnl != None,
            Trade.created_at >= since,
        )
        .all()
    )

    result = []
    for t in trades:
        before = next((e for e in t.emotional_states if e.phase == EmotionalPhase.BEFORE), None)
        after  = next((e for e in t.emotional_states if e.phase == EmotionalPhase.AFTER),  None)
        if not before and not after:
            continue
        result.append({
            "trade_id": t.id,
            "date": t.created_at.date().isoformat(),
            "symbol": t.symbol,
            "pnl": round(t.pnl, 2),
            "is_win": t.pnl > 0,
            "is_impulse": t.is_impulse_trade,
            "setup_type": t.setup_type,
            "before": {
                "confidence": before.confidence,
                "stress":     before.stress,
                "fomo":       before.fomo,
                "anger":      before.anger,
                "patience":   before.patience,
            } if before else None,
            "after": {
                "confidence": after.confidence,
                "stress":     after.stress,
                "fomo":       after.fomo,
                "anger":      after.anger,
                "patience":   after.patience,
            } if after else None,
        })
    return result


@router.get("/setup-performance")
def get_setup_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(90, ge=7, le=365),
):
    """Win rate and avg P&L grouped by trade setup type."""
    since = datetime.utcnow() - timedelta(days=days)
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.pnl != None,
        Trade.setup_type != None,
        Trade.created_at >= since,
    ).all()

    by_setup: dict = {}
    for t in trades:
        s = t.setup_type or "Other"
        if s not in by_setup:
            by_setup[s] = {"total": 0, "wins": 0, "total_pnl": 0.0}
        by_setup[s]["total"] += 1
        if t.pnl > 0:
            by_setup[s]["wins"] += 1
        by_setup[s]["total_pnl"] += t.pnl

    return sorted([
        {
            "setup": k,
            "total": v["total"],
            "wins": v["wins"],
            "losses": v["total"] - v["wins"],
            "win_rate": round(v["wins"] / v["total"] * 100, 1),
            "avg_pnl": round(v["total_pnl"] / v["total"], 2),
            "total_pnl": round(v["total_pnl"], 2),
        }
        for k, v in by_setup.items()
    ], key=lambda x: x["total"], reverse=True)


@router.get("/time-of-day")
def get_time_of_day_analysis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(90, ge=7, le=365),
):
    """Trade count and avg P&L grouped by hour of day — find your best trading window."""
    since = datetime.utcnow() - timedelta(days=days)
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.created_at >= since,
    ).all()

    by_hour: dict = {}
    for t in trades:
        h = t.created_at.hour
        if h not in by_hour:
            by_hour[h] = {"count": 0, "wins": 0, "total_pnl": 0.0}
        by_hour[h]["count"] += 1
        if t.pnl is not None:
            by_hour[h]["total_pnl"] += t.pnl
            if t.pnl > 0:
                by_hour[h]["wins"] += 1

    return sorted([
        {
            "hour": h,
            "hour_label": f"{h:02d}:00",
            "count": v["count"],
            "avg_pnl": round(v["total_pnl"] / v["count"], 2) if v["count"] > 0 else 0,
            "win_rate": round(v["wins"] / v["count"] * 100, 1) if v["count"] > 0 else 0,
        }
        for h, v in by_hour.items()
    ], key=lambda x: x["hour"])


@router.get("/score-trend")
def get_score_trend(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(30, ge=7, le=90),
):
    """Daily discipline score for the last N days — for the trend line chart."""
    from routers.scores import calculate_daily_score, score_to_grade
    today = date.today()
    result = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        day_start = datetime.combine(d, datetime.min.time())
        day_end   = datetime.combine(d, datetime.max.time())
        plan = db.query(TradingPlan).filter(
            TradingPlan.user_id == current_user.id, TradingPlan.date == d
        ).first()
        trades = db.query(Trade).filter(
            Trade.user_id == current_user.id,
            Trade.created_at >= day_start,
            Trade.created_at <= day_end,
        ).all()
        _, score = calculate_daily_score(plan, trades)
        result.append({
            "date": d.isoformat(),
            "score": score,
            "had_plan": plan is not None,
            "trade_count": len(trades),
        })
    return result


@router.get("/emotion-summary")
def get_emotion_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(30, ge=7, le=365),
):
    """
    Avg emotional scores split by trade outcome (win vs loss).
    Helps identify which emotions correlate with bad trades.
    """
    since = datetime.utcnow() - timedelta(days=days)
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id,
        Trade.pnl != None,
        Trade.created_at >= since,
    ).all()

    def avg_emotions(trade_list, phase: EmotionalPhase):
        states = []
        for t in trade_list:
            s = next((e for e in t.emotional_states if e.phase == phase), None)
            if s:
                states.append(s)
        if not states:
            return None
        n = len(states)
        return {
            "confidence": round(sum(s.confidence for s in states) / n, 1),
            "stress":     round(sum(s.stress     for s in states) / n, 1),
            "fomo":       round(sum(s.fomo       for s in states) / n, 1),
            "anger":      round(sum(s.anger      for s in states) / n, 1),
            "patience":   round(sum(s.patience   for s in states) / n, 1),
        }

    wins   = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]

    return {
        "wins":   {"count": len(wins),   "before": avg_emotions(wins, EmotionalPhase.BEFORE),   "after": avg_emotions(wins, EmotionalPhase.AFTER)},
        "losses": {"count": len(losses), "before": avg_emotions(losses, EmotionalPhase.BEFORE), "after": avg_emotions(losses, EmotionalPhase.AFTER)},
    }
