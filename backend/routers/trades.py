from datetime import date, datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Trade, TradingPlan, BehaviourLog, EventType, EmotionalState, ExitReason
from schemas import TradeCreate, TradeOut, TradeResponse

router = APIRouter(prefix="/trade", tags=["trade"])


def _log(db: Session, user_id: int, event: EventType, desc: str):
    db.add(BehaviourLog(user_id=user_id, event_type=event, description=desc))


def _get_todays_trades(db: Session, user_id: int) -> List[Trade]:
    today_start = datetime.combine(date.today(), datetime.min.time())
    return (
        db.query(Trade)
        .filter(Trade.user_id == user_id, Trade.created_at >= today_start)
        .order_by(Trade.created_at.asc())
        .all()
    )


# ─── Impulse Trade Detector ───────────────────────────────────────────────────

def run_impulse_detector(
    db: Session,
    user_id: int,
    today_plan: TradingPlan,
    todays_trades: List[Trade],
) -> tuple[bool, List[str], bool, str | None]:
    """
    Returns: (is_impulse, warnings, blocked, block_reason)
    - is_impulse: whether this trade should be flagged as impulse
    - warnings: list of warning messages to show the user
    - blocked: whether the trade must be HARD-BLOCKED
    - block_reason: reason string for hard block
    """
    warnings: List[str] = []
    is_impulse = False
    blocked = False
    block_reason = None

    # ── Guard 1: No plan for today ──────────────────────────────────────────
    if today_plan is None:
        warnings.append("⚠️ You have no trading plan for today. Consider creating one first.")
        is_impulse = True
        _log(db, user_id, EventType.IMPULSE_TRADE, "Trade logged without a daily plan.")
        return is_impulse, warnings, blocked, block_reason

    # ── Guard 2: Trade limit check (HARD BLOCK) ─────────────────────────────
    trade_count = len(todays_trades)
    if trade_count >= today_plan.max_trades:
        blocked = True
        block_reason = (
            f"🛑 You have reached your planned maximum of {today_plan.max_trades} trade(s) for today. "
            f"Respect your plan and come back tomorrow."
        )
        _log(db, user_id, EventType.TRADE_LIMIT_REACHED,
             f"Attempted trade #{trade_count + 1} but max_trades={today_plan.max_trades}")
        return True, [], blocked, block_reason

    # ── Guard 3: Revenge trading check ─────────────────────────────────────
    if len(todays_trades) >= 2:
        last_two = todays_trades[-2:]
        both_losses = all(
            t.pnl is not None and t.pnl < 0
            for t in last_two
        )
        if both_losses:
            warnings.append(
                "🔴 REVENGE TRADE ALERT: Your last 2 trades were losses. "
                "Trading now is often emotionally driven. "
                "Take a 15-minute break before proceeding."
            )
            is_impulse = True
            _log(db, user_id, EventType.REVENGE_TRADE_WARNING,
                 f"2 consecutive losses detected: trade IDs {last_two[0].id}, {last_two[1].id}")

    # ── Guard 4: Max loss limit check ──────────────────────────────────────
    total_loss_today = sum(t.pnl for t in todays_trades if t.pnl is not None and t.pnl < 0)
    if abs(total_loss_today) >= today_plan.max_loss_amount:
        blocked = True
        block_reason = (
            f"🛑 You have hit your max loss limit of ₹{today_plan.max_loss_amount:.0f} for today. "
            f"Protect your capital and stop trading for the day."
        )
        _log(db, user_id, EventType.RULE_BREAK,
             f"Max loss limit ₹{today_plan.max_loss_amount} reached. Total loss: ₹{abs(total_loss_today):.2f}")
        return True, [], blocked, block_reason

    return is_impulse, warnings, blocked, block_reason


@router.post("", response_model=TradeResponse, status_code=status.HTTP_201_CREATED)
def log_trade(
    payload: TradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    The core endpoint. Runs the Impulse Trade Detector before logging the trade.
    Returns the trade object + any warnings.
    """
    # Fetch today's plan
    today_plan = (
        db.query(TradingPlan)
        .filter(TradingPlan.user_id == current_user.id, TradingPlan.date == date.today())
        .first()
    )
    todays_trades = _get_todays_trades(db, current_user.id)

    # Run impulse detector
    is_impulse, warnings, blocked, block_reason = run_impulse_detector(
        db, current_user.id, today_plan, todays_trades
    )

    # Hard block — do NOT save the trade
    if blocked:
        db.commit()  # Save the behaviour log
        return TradeResponse(
            trade=None,  # type: ignore
            warnings=[],
            blocked=True,
            block_reason=block_reason,
        )

    # Determine if pre-trade checklist was fully passed
    checklist_passed = (
        payload.setup_conditions_met
        and payload.sl_is_defined
        and payload.within_max_trades
    )
    if not checklist_passed:
        is_impulse = True
        warnings.append("⚠️ Pre-trade checklist incomplete. This trade is flagged as an impulse trade.")
        _log(db, current_user.id, EventType.IMPULSE_TRADE,
             "Trade logged with incomplete pre-trade checklist.")

    # Determine plan-followed status
    was_plan_followed = (
        not is_impulse
        and today_plan is not None
        and today_plan.is_locked
    )

    # Calculate PnL if exit price provided
    pnl = None
    if payload.exit_price is not None:
        pnl = (payload.exit_price - payload.entry_price) * payload.quantity

    # Create trade record
    trade = Trade(
        user_id=current_user.id,
        trading_plan_id=today_plan.id if today_plan else None,
        symbol=payload.symbol,
        setup_type=payload.setup_type,
        entry_price=payload.entry_price,
        exit_price=payload.exit_price,
        stop_loss=payload.stop_loss,
        target_price=payload.target_price,
        quantity=payload.quantity,
        pnl=pnl,
        exit_reason=payload.exit_reason,
        was_plan_followed=was_plan_followed,
        is_impulse_trade=is_impulse,
        setup_conditions_met=payload.setup_conditions_met,
        sl_is_defined=payload.sl_is_defined,
        within_max_trades=payload.within_max_trades,
        notes=payload.notes,
    )
    db.add(trade)
    db.flush()  # Get trade.id before adding emotional states

    # Log emotional states
    if payload.emotional_before:
        before_data = payload.emotional_before.model_dump()
        db.add(EmotionalState(trade_id=trade.id, **before_data))

    if payload.emotional_after:
        after_data = payload.emotional_after.model_dump()
        db.add(EmotionalState(trade_id=trade.id, **after_data))

    # Log behaviour event
    event = EventType.IMPULSE_TRADE if is_impulse else EventType.TRADE_LOGGED
    _log(db, current_user.id, event,
         f"Trade: {payload.symbol or 'N/A'} | Entry: {payload.entry_price} | PnL: {pnl}")

    db.commit()
    db.refresh(trade)

    return TradeResponse(trade=trade, warnings=warnings, blocked=False)


@router.get("", response_model=list[TradeOut])
def list_trades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50,
):
    """List recent trades for the logged-in user."""
    return (
        db.query(Trade)
        .filter(Trade.user_id == current_user.id)
        .order_by(Trade.created_at.desc())
        .limit(limit)
        .all()
    )


@router.put("/{trade_id}/exit", response_model=TradeOut)
def update_trade_exit(
    trade_id: int,
    exit_price: float,
    exit_reason: ExitReason,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update exit price and reason for an open trade. Recalculates PnL."""
    trade = db.query(Trade).filter(
        Trade.id == trade_id, Trade.user_id == current_user.id
    ).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    trade.exit_price = exit_price
    trade.exit_reason = exit_reason
    trade.pnl = (exit_price - trade.entry_price) * trade.quantity

    # Flag emotion-driven exits
    if exit_reason in [ExitReason.FEAR, ExitReason.GREED]:
        _log(db, current_user.id, EventType.RULE_BREAK,
             f"Trade #{trade_id} exited due to {exit_reason}. Emotional exit detected.")

    db.commit()
    db.refresh(trade)
    return trade
