"""
APScheduler — runs background jobs for TradeMind OS.
Currently schedules: daily email digest for all opted-in users.
"""
from datetime import date, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from database import SessionLocal
from email_service import send_digest_email
from models import User, Trade, TradingPlan, ExitReason

scheduler = BackgroundScheduler(timezone="Asia/Kolkata")


def _calculate_daily_score_for_user(db: Session, user_id: int, score_date: date) -> dict:
    """Inline score calculator (avoids circular imports from routers)."""
    from routers.scores import calculate_daily_score
    day_start = datetime.combine(score_date, datetime.min.time())
    day_end = datetime.combine(score_date, datetime.max.time())
    plan = db.query(TradingPlan).filter(
        TradingPlan.user_id == user_id, TradingPlan.date == score_date
    ).first()
    trades = db.query(Trade).filter(
        Trade.user_id == user_id,
        Trade.created_at >= day_start,
        Trade.created_at <= day_end,
    ).all()
    breakdown, total = calculate_daily_score(plan, trades)
    grade = _grade(total)
    return {"total_score": total, "grade": grade, "breakdown": breakdown}


def _grade(score: int) -> str:
    if score >= 90: return "A+ 🏆"
    if score >= 80: return "A 🥇"
    if score >= 70: return "B 👍"
    if score >= 60: return "C ⚠️"
    if score >= 40: return "D 📉"
    return "F 🛑"


def _get_weekly_for_user(db: Session, user_id: int) -> dict:
    """Minimal weekly summary for email."""
    today = date.today()
    week_start = today - timedelta(days=6)
    week_start_dt = datetime.combine(week_start, datetime.min.time())
    trades = db.query(Trade).filter(
        Trade.user_id == user_id, Trade.created_at >= week_start_dt
    ).all()
    total = len(trades)
    plan_followed = sum(1 for t in trades if t.was_plan_followed)
    impulse = sum(1 for t in trades if t.is_impulse_trade)
    total_pnl = sum(t.pnl for t in trades if t.pnl is not None)
    pct = (plan_followed / total * 100) if total > 0 else 0.0

    from models import EventType, BehaviourLog
    logs = db.query(BehaviourLog).filter(
        BehaviourLog.user_id == user_id,
        BehaviourLog.created_at >= week_start_dt
    ).all()
    mistake_counts = {}
    for log in logs:
        if log.event_type in [EventType.IMPULSE_TRADE, EventType.PLAN_MODIFIED_AFTER_LOCK,
                               EventType.REVENGE_TRADE_WARNING, EventType.RULE_BREAK]:
            k = log.event_type.value
            mistake_counts[k] = mistake_counts.get(k, 0) + 1
    top = max(mistake_counts, key=mistake_counts.get) if mistake_counts else None
    labels = {
        "impulse_trade": "Taking impulse trades",
        "plan_modified_after_lock": "Modifying plan after locking",
        "revenge_trade_warning": "Revenge trading after losses",
        "rule_break": "Emotional exits (Fear/Greed)",
    }
    if total == 0:
        focus = "Start logging trades to build self-awareness data"
    elif pct < 60:
        focus = "Focus on sticking to your plan. Pre-market prep is key."
    else:
        focus = "Keep it up! Review setups for consistency."

    return {
        "total_trades": total,
        "plan_followed_pct": round(pct, 1),
        "total_pnl": round(total_pnl, 2),
        "impulse_trade_count": impulse,
        "top_mistake": labels.get(top) if top else None,
        "focus_next_week": focus,
    }


def send_daily_digests():
    """Job: send digest email to all users who opted in."""
    print(f"[Scheduler] 📧 Running daily digest job at {datetime.now().isoformat()}")
    db: Session = SessionLocal()
    try:
        users = db.query(User).filter(
            User.email_digest_enabled == True,
            User.email != None,
        ).all()
        print(f"[Scheduler] Found {len(users)} user(s) with digest enabled")
        for user in users:
            try:
                score_data = _calculate_daily_score_for_user(db, user.id, date.today())
                weekly_data = _get_weekly_for_user(db, user.id)
                send_digest_email(user.email, user.username, score_data, weekly_data)
            except Exception as e:
                print(f"[Scheduler] Error processing user {user.id}: {e}")
    finally:
        db.close()


def start_scheduler():
    """Call on FastAPI startup."""
    # Runs every day at 9:00 PM IST
    scheduler.add_job(
        send_daily_digests,
        trigger="cron",
        hour=21,
        minute=0,
        id="daily_digest",
        replace_existing=True,
    )
    scheduler.start()
    print("[Scheduler] ✅ APScheduler started — digest runs daily at 9:00 PM IST")


def stop_scheduler():
    """Call on FastAPI shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[Scheduler] Stopped")
