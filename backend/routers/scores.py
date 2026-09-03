from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Trade, TradingPlan, BehaviourLog, EventType, ExitReason
from schemas import DailyScoreOut, WeeklyReviewOut

router = APIRouter(prefix="/scores", tags=["scores"])


# ─── Discipline Score Calculator ──────────────────────────────────────────────

def calculate_daily_score(
    plan: Optional[TradingPlan],
    trades: List[Trade],
) -> dict:
    """
    Scoring logic:
      +15  Pre-market checklist completed (all 6 items)
      +20  Risk limit respected (total daily loss < max_loss_amount)
      +25  All trades followed the plan setup
      +20  No emotional exits (no FEAR/GREED exit reasons)
      +10  Journal entries completed (emotional states logged for each trade)
      -30  Per impulse/rule-breaking trade
    """
    breakdown = {
        "pre_market_checklist": 0,
        "risk_limit_respected": 0,
        "plan_setup_followed": 0,
        "stop_loss_respected": 0,
        "journal_completed": 0,
        "impulse_trade_penalty": 0,
    }

    if plan:
        # +15: Pre-market checklist
        checklist_items = [
            plan.slept_well,
            plan.know_max_risk,
            plan.reviewed_key_levels,
            plan.no_emotional_baggage,
            plan.checked_economic_calendar,
            plan.reviewed_yesterday_trades,
        ]
        if all(checklist_items):
            breakdown["pre_market_checklist"] = 15
        elif any(checklist_items):
            # Partial credit
            breakdown["pre_market_checklist"] = round(15 * (sum(checklist_items) / len(checklist_items)))

        # +20: Risk limit respected
        if trades:
            total_loss = sum(t.pnl for t in trades if t.pnl is not None and t.pnl < 0)
            if abs(total_loss) < plan.max_loss_amount:
                breakdown["risk_limit_respected"] = 20
        else:
            # No trades = risk not violated
            breakdown["risk_limit_respected"] = 20

    if trades:
        # +25: All trades followed the plan
        plan_followed_count = sum(1 for t in trades if t.was_plan_followed)
        if plan_followed_count == len(trades):
            breakdown["plan_setup_followed"] = 25
        elif plan_followed_count > 0:
            breakdown["plan_setup_followed"] = round(25 * (plan_followed_count / len(trades)))

        # +20: No emotional exits (no FEAR or GREED)
        emotional_exits = sum(
            1 for t in trades
            if t.exit_reason in [ExitReason.FEAR, ExitReason.GREED]
        )
        if emotional_exits == 0:
            breakdown["stop_loss_respected"] = 20
        elif emotional_exits < len(trades):
            breakdown["stop_loss_respected"] = round(20 * (1 - emotional_exits / len(trades)))

        # +10: Journal entries (emotional states) logged
        trades_with_emotions = sum(1 for t in trades if t.emotional_states)
        if trades_with_emotions == len(trades):
            breakdown["journal_completed"] = 10
        elif trades_with_emotions > 0:
            breakdown["journal_completed"] = round(10 * (trades_with_emotions / len(trades)))

        # -30: Per impulse trade
        impulse_count = sum(1 for t in trades if t.is_impulse_trade)
        breakdown["impulse_trade_penalty"] = -30 * impulse_count

    total = sum(breakdown.values())
    total = max(0, min(100, total))  # Clamp to [0, 100]
    return breakdown, total


def score_to_grade(score: int) -> str:
    if score >= 90:
        return "A+ 🏆"
    elif score >= 80:
        return "A 🥇"
    elif score >= 70:
        return "B 👍"
    elif score >= 60:
        return "C ⚠️"
    elif score >= 40:
        return "D 📉"
    else:
        return "F 🛑"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/daily", response_model=DailyScoreOut)
def get_daily_score(
    target_date: Optional[date] = Query(default=None, description="Date to score (defaults to today)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculate and return the discipline score for a given day."""
    score_date = target_date or date.today()
    day_start = datetime.combine(score_date, datetime.min.time())
    day_end = datetime.combine(score_date, datetime.max.time())

    plan = (
        db.query(TradingPlan)
        .filter(TradingPlan.user_id == current_user.id, TradingPlan.date == score_date)
        .first()
    )
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == current_user.id, Trade.created_at.between(day_start, day_end))
        .all()
    )

    breakdown, total = calculate_daily_score(plan, trades)

    return DailyScoreOut(
        date=score_date,
        total_score=total,
        max_score=100,
        breakdown=breakdown,
        grade=score_to_grade(total),
    )


@router.get("/weekly", response_model=WeeklyReviewOut)
def get_weekly_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a weekly review summary (last 7 days)."""
    today = date.today()
    week_start = today - timedelta(days=6)
    week_start_dt = datetime.combine(week_start, datetime.min.time())

    trades: List[Trade] = (
        db.query(Trade)
        .filter(Trade.user_id == current_user.id, Trade.created_at >= week_start_dt)
        .all()
    )

    total_trades = len(trades)
    plan_followed_count = sum(1 for t in trades if t.was_plan_followed)
    impulse_count = sum(1 for t in trades if t.is_impulse_trade)
    total_pnl = sum(t.pnl for t in trades if t.pnl is not None)
    plan_followed_pct = (plan_followed_count / total_trades * 100) if total_trades > 0 else 0.0

    # Calculate average daily discipline score
    daily_scores = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        day_start = datetime.combine(d, datetime.min.time())
        day_end = datetime.combine(d, datetime.max.time())
        day_plan = db.query(TradingPlan).filter(
            TradingPlan.user_id == current_user.id, TradingPlan.date == d
        ).first()
        day_trades = [t for t in trades if day_start <= t.created_at <= day_end]
        _, score = calculate_daily_score(day_plan, day_trades)
        daily_scores.append(score)
    avg_daily_score = sum(daily_scores) / len(daily_scores)

    # Identify top mistake from behaviour logs
    logs: List[BehaviourLog] = (
        db.query(BehaviourLog)
        .filter(BehaviourLog.user_id == current_user.id, BehaviourLog.created_at >= week_start_dt)
        .all()
    )
    mistake_events = [EventType.IMPULSE_TRADE, EventType.PLAN_MODIFIED_AFTER_LOCK,
                      EventType.REVENGE_TRADE_WARNING, EventType.RULE_BREAK]
    mistake_counts: dict = {}
    for log in logs:
        if log.event_type in mistake_events:
            key = log.event_type.value
            mistake_counts[key] = mistake_counts.get(key, 0) + 1

    top_mistake = max(mistake_counts, key=mistake_counts.get) if mistake_counts else None
    top_mistake_labels = {
        "impulse_trade": "Taking impulse trades",
        "plan_modified_after_lock": "Modifying plan after locking",
        "revenge_trade_warning": "Revenge trading after losses",
        "rule_break": "Emotional exits (Fear/Greed)",
    }
    top_mistake_label = top_mistake_labels.get(top_mistake) if top_mistake else None

    # Best habit
    best_habit = None
    if plan_followed_pct >= 80:
        best_habit = "Consistently following your trading plan 🎯"
    elif impulse_count == 0 and total_trades > 0:
        best_habit = "Zero impulse trades this week 🧘"
    elif avg_daily_score >= 70:
        best_habit = "Maintaining good overall discipline 📈"

    # Focus area
    if top_mistake == "impulse_trade":
        focus = "Pause before every entry — ask: 'Is this in my plan?'"
    elif top_mistake == "revenge_trade_warning":
        focus = "After 2 consecutive losses, step away for 30 minutes"
    elif top_mistake == "rule_break":
        focus = "Honor your stop-loss. Fear-based exits destroy long-term edge"
    elif total_trades == 0:
        focus = "Start logging trades to build self-awareness data"
    else:
        focus = "Keep it up! Review your trade setups for consistency"

    return WeeklyReviewOut(
        week_start=week_start,
        week_end=today,
        total_trades=total_trades,
        plan_followed_count=plan_followed_count,
        plan_followed_pct=round(plan_followed_pct, 1),
        impulse_trade_count=impulse_count,
        total_pnl=round(total_pnl, 2),
        avg_daily_score=round(avg_daily_score, 1),
        top_mistake=top_mistake_label,
        best_habit=best_habit,
        focus_next_week=focus,
    )
