"""
TradeMind OS — Live Trading Terminal Router
Provides endpoints for market watch, live charting, order execution,
position management, and Zerodha Kite Connect integration.
"""

from datetime import date as date_type, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import (
    BehaviourLog,
    BrokerCredential,
    EventType,
    LiveOrder,
    LivePosition,
    Trade,
    TradingPlan,
    User,
)
from schemas import (
    BrokerConfigIn,
    BrokerConfigOut,
    BrokerTokenExchangeIn,
    MarketInstrumentOut,
    SquareOffRequest,
    TerminalOrderCreate,
    TerminalOrderOut,
    TerminalPositionOut,
)
import terminal_service
from terminal_service import (
    INSTRUMENT_REGISTRY,
    PaperTradingEngine,
    ZerodhaKiteService,
    generate_candle_data,
    get_all_market_watch,
    get_live_tick,
)

router = APIRouter(prefix="/terminal", tags=["trading_terminal"])


def _get_or_create_broker_cred(db: Session, user_id: int) -> BrokerCredential:
    cred = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.user_id == user_id)
        .first()
    )
    if not cred:
        cred = BrokerCredential(
            user_id=user_id,
            broker_name="ZERODHA",
            trading_mode="PAPER",
            paper_balance=100000.0,
        )
        db.add(cred)
        db.commit()
        db.refresh(cred)
    return cred


# ─── 1. Market Watch & Live Charts ───────────────────────────────────────────

@router.get("/market-watch", response_model=List[MarketInstrumentOut])
def get_market_watch(
    current_user: User = Depends(get_current_user),
):
    """Returns real-time watchlist with live tickers and price metrics."""
    data = get_all_market_watch()
    return data


@router.get("/chart/{symbol}")
def get_chart(
    symbol: str,
    timeframe: str = Query(default="5m", pattern="^(1m|5m|15m|1h|1D)$"),
    count: int = Query(default=150, ge=10, le=300),
    current_user: User = Depends(get_current_user),
):
    """Returns historical and live candlestick OHLC data for the selected symbol."""
    sym = symbol.upper()
    candles = generate_candle_data(sym, timeframe=timeframe, count=count)
    return {
        "symbol": sym,
        "timeframe": timeframe,
        "candles": candles,
    }


# ─── 2. Orders & Order Placement (with Pre-Trade Discipline Gateway) ──────────

@router.post("/orders", response_model=TerminalOrderOut, status_code=status.HTTP_201_CREATED)
def place_order(
    payload: TerminalOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Places an order on the Live Trading Terminal.
    First checks TradeMind daily discipline limits (Max Trades, Max Loss, Revenge Trading).
    Routes to PaperTradingEngine or Zerodha Kite based on user's active trading mode.
    Auto-syncs filled orders into TradeMind OS journal.
    """
    user_id = current_user.id
    cred = _get_or_create_broker_cred(db, user_id)

    # ── TradeMind Pre-Order Discipline Check ─────────────────────────────────
    today = date_type.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_plan = (
        db.query(TradingPlan)
        .filter(TradingPlan.user_id == user_id, TradingPlan.date == today)
        .first()
    )

    todays_trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id, Trade.created_at >= today_start)
        .all()
    )

    # Guard: Max trades limit
    if today_plan and len(todays_trades) >= today_plan.max_trades:
        if not payload.override_risk_gate:
            db.add(
                BehaviourLog(
                    user_id=user_id,
                    event_type=EventType.TRADE_LIMIT_REACHED,
                    description=(
                        f"Terminal blocked order: Attempted trade #{len(todays_trades) + 1} "
                        f"when daily max limit is {today_plan.max_trades}."
                    ),
                )
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error_code": "TRADE_LIMIT_REACHED",
                    "message": (
                        f"🛑 TRADE LIMIT REACHED! You have already completed {len(todays_trades)} "
                        f"of your {today_plan.max_trades} planned trades today. "
                        f"Taking another trade is overtrading. Respect your plan!"
                    ),
                    "trade_count": len(todays_trades),
                    "max_trades": today_plan.max_trades,
                },
            )

    # Guard: Max daily loss limit
    if today_plan:
        losses_today = [t.pnl for t in todays_trades if t.pnl is not None and t.pnl < 0]
        total_loss = abs(sum(losses_today))
        if total_loss >= today_plan.max_loss_amount:
            if not payload.override_risk_gate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error_code": "MAX_LOSS_BREACHED",
                        "message": (
                            f"🛑 MAX LOSS BREACHED! Total loss today is ₹{total_loss:.2f} "
                            f"(Daily Limit: ₹{today_plan.max_loss_amount:.2f}). "
                            f"Trading is halted to preserve capital."
                        ),
                        "can_override": True,
                    },
                )
            else:
                db.add(
                    BehaviourLog(
                        user_id=user_id,
                        event_type=EventType.RULE_BREAK,
                        description=f"Terminal risk gate overridden by user after max loss breach (Loss: ₹{total_loss:.2f}).",
                    )
                )
                db.commit()

    # ── Execute Order based on Trading Mode ──────────────────────────────────
    mode = cred.trading_mode.upper()
    order_dict = payload.model_dump()

    if mode == "REAL":
        # Zerodha Kite Connect Execution
        if not cred.api_key or not cred.access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error_code": "ZERODHA_NOT_CONNECTED",
                    "message": "Zerodha Kite Connect is not authenticated. Please configure API Key & Login in Broker Settings.",
                },
            )

        res = ZerodhaKiteService.place_order(
            api_key=cred.api_key,
            access_token=cred.access_token,
            order_data=order_dict,
        )

        if not res.get("success"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error_code": "BROKER_REJECTED", "message": res.get("error", "Kite order rejected")},
            )

        # Log order in DB
        tick = get_live_tick(payload.symbol)
        fill_price = tick["ltp"]
        live_order = LiveOrder(
            user_id=user_id,
            broker_order_id=res.get("order_id"),
            symbol=payload.symbol,
            trading_mode="REAL",
            transaction_type=payload.transaction_type.upper(),
            product=payload.product.upper(),
            order_type=payload.order_type.upper(),
            quantity=payload.quantity,
            price=fill_price,
            trigger_price=payload.trigger_price,
            stop_loss=payload.stop_loss,
            target_price=payload.target_price,
            status="COMPLETE",
            average_price=fill_price,
        )
        db.add(live_order)
        db.commit()
        db.refresh(live_order)
        return live_order

    else:
        # Paper Trading Mode Execution
        live_order = PaperTradingEngine.execute_order(db, user_id, order_dict)
        return live_order


@router.get("/orders", response_model=List[TerminalOrderOut])
def get_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns order history and active orders for the current user."""
    orders = (
        db.query(LiveOrder)
        .filter(LiveOrder.user_id == current_user.id)
        .order_by(LiveOrder.created_at.desc())
        .limit(100)
        .all()
    )
    return orders


@router.delete("/orders/{order_id}")
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancels an open order."""
    order = (
        db.query(LiveOrder)
        .filter(LiveOrder.id == order_id, LiveOrder.user_id == current_user.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != "OPEN":
        raise HTTPException(status_code=400, detail="Cannot cancel an already completed or cancelled order")

    order.status = "CANCELLED"
    db.commit()
    return {"message": "Order cancelled successfully"}


# ─── 3. Positions & Real-time MTM ─────────────────────────────────────────────

@router.get("/positions", response_model=List[TerminalPositionOut])
def get_positions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns live positions with real-time calculated MTM unrealized P&L and realized P&L.
    """
    positions = (
        db.query(LivePosition)
        .filter(
            LivePosition.user_id == current_user.id,
            LivePosition.status == "OPEN",
        )
        .all()
    )

    out = []
    for pos in positions:
        tick = get_live_tick(pos.symbol)
        ltp = tick["ltp"]

        if pos.quantity > 0:  # Long
            unrealized = round((ltp - pos.buy_avg_price) * pos.quantity, 2)
        elif pos.quantity < 0:  # Short
            unrealized = round((pos.sell_avg_price - ltp) * abs(pos.quantity), 2)
        else:
            unrealized = 0.0

        total_pnl = round(pos.realized_pnl + unrealized, 2)

        out.append(
            TerminalPositionOut(
                id=pos.id,
                symbol=pos.symbol,
                product=pos.product,
                trading_mode=pos.trading_mode,
                quantity=pos.quantity,
                buy_avg_price=pos.buy_avg_price,
                sell_avg_price=pos.sell_avg_price,
                ltp=ltp,
                realized_pnl=pos.realized_pnl,
                unrealized_pnl=unrealized,
                total_pnl=total_pnl,
                status=pos.status,
            )
        )
    return out


@router.post("/positions/square-off")
def square_off_positions(
    payload: SquareOffRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Squares off a specific open position or all open positions at market price.
    """
    query = db.query(LivePosition).filter(
        LivePosition.user_id == current_user.id,
        LivePosition.status == "OPEN",
    )
    if payload.symbol:
        query = query.filter(LivePosition.symbol == payload.symbol)

    positions = query.all()
    if not positions:
        return {"message": "No open positions to square off", "count": 0}

    count = 0
    for pos in positions:
        if pos.quantity != 0:
            PaperTradingEngine.square_off_position(db, current_user.id, pos.id)
            count += 1

    return {"message": f"Successfully squared off {count} position(s)", "count": count}


# ─── 4. Broker Configuration (Zerodha Kite & Paper Mode) ──────────────────────

@router.get("/broker-config", response_model=BrokerConfigOut)
def get_broker_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns current trading mode and masked broker connection status."""
    cred = _get_or_create_broker_cred(db, current_user.id)

    # Mask API secret for security (e.g. '***a1b2')
    masked_secret = None
    if cred.api_secret:
        masked_secret = f"***{cred.api_secret[-4:]}" if len(cred.api_secret) >= 4 else "***"

    login_url = None
    if cred.api_key:
        login_url = ZerodhaKiteService.get_login_url(cred.api_key)

    return BrokerConfigOut(
        broker_name=cred.broker_name,
        api_key=cred.api_key,
        api_secret_masked=masked_secret,
        has_access_token=bool(cred.access_token),
        trading_mode=cred.trading_mode,
        paper_balance=cred.paper_balance,
        kite_login_url=login_url,
    )


@router.post("/broker-config", response_model=BrokerConfigOut)
def update_broker_config(
    payload: BrokerConfigIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Updates broker credentials or switches between Paper and Real modes."""
    cred = _get_or_create_broker_cred(db, current_user.id)

    if payload.broker_name:
        cred.broker_name = payload.broker_name
    if payload.api_key is not None:
        cred.api_key = payload.api_key.strip() if payload.api_key else None
    if payload.api_secret is not None and payload.api_secret.strip():
        cred.api_secret = payload.api_secret.strip()
    if payload.trading_mode:
        mode = payload.trading_mode.upper()
        if mode in ("PAPER", "REAL"):
            cred.trading_mode = mode
    if payload.paper_balance is not None and payload.paper_balance > 0:
        cred.paper_balance = payload.paper_balance

    db.commit()
    db.refresh(cred)
    return get_broker_config(db, current_user)


@router.post("/broker-token")
def exchange_kite_token(
    payload: BrokerTokenExchangeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exchanges Zerodha Kite request_token for an active access_token.
    """
    cred = _get_or_create_broker_cred(db, current_user.id)
    if not cred.api_key or not cred.api_secret:
        raise HTTPException(
            status_code=400,
            detail="Please save your Zerodha API Key and API Secret first before exchanging request token.",
        )

    res = ZerodhaKiteService.exchange_token(
        api_key=cred.api_key,
        api_secret=cred.api_secret,
        request_token=payload.request_token.strip(),
    )

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Token exchange failed"))

    cred.access_token = res.get("access_token")
    cred.trading_mode = "REAL"
    db.commit()

    return {
        "message": "Zerodha Kite authenticated successfully! Real Trading Mode is now active.",
        "user_name": res.get("user_name"),
        "user_id": res.get("user_id"),
    }
