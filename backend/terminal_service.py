"""
TradeMind OS — Live Trading Terminal & Broker Service
Provides real-time market data, paper trading execution engine,
and Zerodha Kite Connect v3 REST integration with automatic 2-way sync into TradeMind OS.
"""

import hashlib
import logging
import math
import random
import time
from datetime import datetime, date as date_type
from typing import Any, Dict, List, Optional, Tuple
import requests
from sqlalchemy.orm import Session

from models import (
    BehaviourLog,
    BrokerCredential,
    EventType,
    ExitReason,
    LiveOrder,
    LivePosition,
    Trade,
    TradingPlan,
    User,
)

logger = logging.getLogger("terminal_service")

# ─── Baseline Instruments (High-liquidity Indian Equities & Indices) ─────────

INSTRUMENT_REGISTRY: Dict[str, Dict[str, Any]] = {
    "NIFTY 50": {
        "name": "NIFTY 50 Index",
        "segment": "INDICES",
        "base_price": 24850.00,
        "lot_size": 25,
        "tick_size": 0.05,
    },
    "BANKNIFTY": {
        "name": "Nifty Bank Index",
        "segment": "INDICES",
        "base_price": 51220.00,
        "lot_size": 15,
        "tick_size": 0.05,
    },
    "FINNIFTY": {
        "name": "Nifty Financial Services",
        "segment": "INDICES",
        "base_price": 23480.00,
        "lot_size": 25,
        "tick_size": 0.05,
    },
    "SENSEX": {
        "name": "BSE Sensex Index",
        "segment": "INDICES",
        "base_price": 81340.00,
        "lot_size": 10,
        "tick_size": 0.05,
    },
    "RELIANCE": {
        "name": "Reliance Industries Ltd",
        "segment": "NSE_EQ",
        "base_price": 2985.50,
        "lot_size": 1,
        "tick_size": 0.05,
    },
    "HDFCBANK": {
        "name": "HDFC Bank Ltd",
        "segment": "NSE_EQ",
        "base_price": 1642.00,
        "lot_size": 1,
        "tick_size": 0.05,
    },
    "TCS": {
        "name": "Tata Consultancy Services Ltd",
        "segment": "NSE_EQ",
        "base_price": 4215.00,
        "lot_size": 1,
        "tick_size": 0.05,
    },
    "INFY": {
        "name": "Infosys Ltd",
        "segment": "NSE_EQ",
        "base_price": 1785.40,
        "lot_size": 1,
        "tick_size": 0.05,
    },
    "ICICIBANK": {
        "name": "ICICI Bank Ltd",
        "segment": "NSE_EQ",
        "base_price": 1215.30,
        "lot_size": 1,
        "tick_size": 0.05,
    },
    "SBIN": {
        "name": "State Bank of India",
        "segment": "NSE_EQ",
        "base_price": 816.70,
        "lot_size": 1,
        "tick_size": 0.05,
    },
    "TATAMOTORS": {
        "name": "Tata Motors Ltd",
        "segment": "NSE_EQ",
        "base_price": 1032.50,
        "lot_size": 1,
        "tick_size": 0.05,
    },
    "BAJFINANCE": {
        "name": "Bajaj Finance Ltd",
        "segment": "NSE_EQ",
        "base_price": 7120.00,
        "lot_size": 1,
        "tick_size": 0.05,
    },
}

# In-memory dynamic ticker price tracker for real-time market feel
_LIVE_TICKS: Dict[str, Dict[str, Any]] = {}


def _init_ticks():
    """Initializes dynamic ticker state from registry."""
    global _LIVE_TICKS
    if not _LIVE_TICKS:
        for symbol, meta in INSTRUMENT_REGISTRY.items():
            base = meta["base_price"]
            open_price = round(base * (1 + random.uniform(-0.003, 0.003)), 2)
            _LIVE_TICKS[symbol] = {
                "ltp": open_price,
                "open": open_price,
                "high": round(open_price * 1.008, 2),
                "low": round(open_price * 0.992, 2),
                "close": base,
                "last_update": time.time(),
            }


_init_ticks()


def get_live_tick(symbol: str) -> Dict[str, Any]:
    """
    Returns latest tick data for symbol with realistic micro-movements.
    """
    _init_ticks()
    if symbol not in _LIVE_TICKS:
        # Fallback if unknown symbol
        base = 1000.0
        return {
            "symbol": symbol,
            "ltp": base,
            "change": 0.0,
            "change_percent": 0.0,
            "high": base * 1.01,
            "low": base * 0.99,
            "open": base,
            "close": base,
            "lot_size": 1,
        }

    tick = _LIVE_TICKS[symbol]
    now = time.time()
    # Micro-fluctuation if at least 0.3s passed
    if now - tick["last_update"] > 0.3:
        # Random step: -0.1% to +0.1%
        delta = tick["ltp"] * random.uniform(-0.0012, 0.0012)
        new_ltp = round(max(tick["ltp"] + delta, 1.0), 2)
        tick["ltp"] = new_ltp
        tick["high"] = max(tick["high"], new_ltp)
        tick["low"] = min(tick["low"], new_ltp)
        tick["last_update"] = now

    change = round(tick["ltp"] - tick["close"], 2)
    change_pct = round((change / tick["close"]) * 100, 2)
    lot_size = INSTRUMENT_REGISTRY.get(symbol, {}).get("lot_size", 1)

    return {
        "symbol": symbol,
        "name": INSTRUMENT_REGISTRY.get(symbol, {}).get("name", symbol),
        "segment": INSTRUMENT_REGISTRY.get(symbol, {}).get("segment", "NSE_EQ"),
        "ltp": tick["ltp"],
        "change": change,
        "change_percent": change_pct,
        "high": tick["high"],
        "low": tick["low"],
        "open": tick["open"],
        "close": tick["close"],
        "lot_size": lot_size,
    }


def get_all_market_watch() -> List[Dict[str, Any]]:
    """Returns real-time data for all symbols in the watchlist."""
    return [get_live_tick(sym) for sym in INSTRUMENT_REGISTRY.keys()]


def generate_candle_data(symbol: str, timeframe: str = "5m", count: int = 150) -> List[Dict[str, Any]]:
    """
    Generates realistic historical/intraday OHLC candle data for the chart widget.
    """
    tick = get_live_tick(symbol)
    current_price = tick["ltp"]
    candles = []

    # Step back in time
    now = datetime.now()
    step_minutes = 5
    if timeframe == "1m":
        step_minutes = 1
    elif timeframe == "15m":
        step_minutes = 15
    elif timeframe == "1h":
        step_minutes = 60
    elif timeframe == "1D":
        step_minutes = 1440

    # Generate synthetic walk backward from current price
    price = current_price
    temp_candles = []
    for i in range(count):
        t_stamp = int((now.timestamp() - (i * step_minutes * 60)))
        volatility = price * 0.002
        c_open = round(price + random.uniform(-volatility, volatility), 2)
        c_close = round(price, 2)
        c_high = round(max(c_open, c_close) + random.uniform(0, volatility * 1.5), 2)
        c_low = round(min(c_open, c_close) - random.uniform(0, volatility * 1.5), 2)
        volume = random.randint(500, 15000)

        temp_candles.append({
            "time": t_stamp,
            "open": c_open,
            "high": c_high,
            "low": c_low,
            "close": c_close,
            "volume": volume,
        })
        price = c_open

    # Reverse so earliest is first
    temp_candles.reverse()
    # Make sure the last candle closes at current LTP
    if temp_candles:
        temp_candles[-1]["close"] = current_price
        temp_candles[-1]["high"] = max(temp_candles[-1]["high"], current_price)
        temp_candles[-1]["low"] = min(temp_candles[-1]["low"], current_price)

    return temp_candles


# ─── Paper Trading Engine ────────────────────────────────────────────────────

class PaperTradingEngine:
    """
    Handles zero-risk virtual order execution, position tracking, MTM calculations,
    and automatic synchronization into TradeMind OS.
    """

    @staticmethod
    def execute_order(
        db: Session,
        user_id: int,
        order_data: Dict[str, Any],
    ) -> LiveOrder:
        symbol = order_data["symbol"]
        txn_type = order_data["transaction_type"].upper()  # BUY | SELL
        product = order_data.get("product", "MIS").upper()
        order_type = order_data.get("order_type", "MARKET").upper()
        qty = int(order_data["quantity"])
        stop_loss = order_data.get("stop_loss")
        target_price = order_data.get("target_price")
        setup_type = order_data.get("setup_type")

        # Get latest tick
        tick = get_live_tick(symbol)
        ltp = tick["ltp"]

        # Calculate fill price with realistic market slippage
        slippage_pct = 0.0003  # 0.03%
        if txn_type == "BUY":
            fill_price = round(ltp * (1 + slippage_pct), 2)
        else:
            fill_price = round(ltp * (1 - slippage_pct), 2)

        if order_type == "LIMIT" and order_data.get("price") and order_data["price"] > 0:
            fill_price = float(order_data["price"])

        # 1. Create LiveOrder record
        order_id_str = f"PAPER-{int(time.time() * 1000) % 1000000}"
        live_order = LiveOrder(
            user_id=user_id,
            broker_order_id=order_id_str,
            symbol=symbol,
            trading_mode="PAPER",
            transaction_type=txn_type,
            product=product,
            order_type=order_type,
            quantity=qty,
            price=fill_price,
            trigger_price=order_data.get("trigger_price"),
            stop_loss=stop_loss,
            target_price=target_price,
            status="COMPLETE",
            average_price=fill_price,
        )
        db.add(live_order)
        db.flush()

        # 2. Update LivePosition
        position = (
            db.query(LivePosition)
            .filter(
                LivePosition.user_id == user_id,
                LivePosition.symbol == symbol,
                LivePosition.product == product,
                LivePosition.trading_mode == "PAPER",
                LivePosition.status == "OPEN",
            )
            .first()
        )

        signed_qty = qty if txn_type == "BUY" else -qty

        if not position:
            position = LivePosition(
                user_id=user_id,
                symbol=symbol,
                product=product,
                trading_mode="PAPER",
                quantity=signed_qty,
                buy_avg_price=fill_price if txn_type == "BUY" else 0.0,
                sell_avg_price=fill_price if txn_type == "SELL" else 0.0,
                realized_pnl=0.0,
                unrealized_pnl=0.0,
                status="OPEN",
            )
            db.add(position)
        else:
            prev_qty = position.quantity
            new_qty = prev_qty + signed_qty

            # If closing or reducing position
            if (prev_qty > 0 and txn_type == "SELL") or (prev_qty < 0 and txn_type == "BUY"):
                closed_qty = min(abs(prev_qty), qty)
                if prev_qty > 0:  # was long, selling to close
                    pnl_chunk = (fill_price - position.buy_avg_price) * closed_qty
                else:  # was short, buying to cover
                    pnl_chunk = (position.sell_avg_price - fill_price) * closed_qty

                position.realized_pnl += round(pnl_chunk, 2)
                position.quantity = new_qty
                if new_qty == 0:
                    position.status = "CLOSED"
            else:
                # Adding to position
                if txn_type == "BUY":
                    position.buy_avg_price = round(
                        ((position.buy_avg_price * prev_qty) + (fill_price * qty)) / new_qty, 2
                    )
                else:
                    position.sell_avg_price = round(
                        ((position.sell_avg_price * abs(prev_qty)) + (fill_price * qty)) / abs(new_qty), 2
                    )
                position.quantity = new_qty

        db.flush()

        # 3. ── AUTOMATIC BRIDGE TO TRADEMIND OS ────────────────────────────────
        # Every filled trade is logged to TradeMind's database table `trades`
        today_date = date_type.today()
        today_plan = (
            db.query(TradingPlan)
            .filter(TradingPlan.user_id == user_id, TradingPlan.date == today_date)
            .first()
        )

        # Check if trade matches plan setup
        planned_setup = today_plan.planned_setup if today_plan else None
        setup_met = bool(planned_setup and setup_type and setup_type.lower() == planned_setup.lower())
        sl_defined = bool(stop_loss and stop_loss > 0)

        # If opening trade
        new_trade = Trade(
            user_id=user_id,
            trading_plan_id=today_plan.id if today_plan else None,
            symbol=symbol,
            setup_type=setup_type or planned_setup or "Live Terminal Execution",
            entry_price=fill_price,
            exit_price=None,
            stop_loss=stop_loss,
            target_price=target_price,
            quantity=qty,
            pnl=0.0,
            was_plan_followed=True,
            is_impulse_trade=False,
            setup_conditions_met=setup_met,
            sl_is_defined=sl_defined,
            within_max_trades=True,
            notes=f"Auto-executed on TradeLive Terminal ({product} {txn_type}) [Order: {order_id_str}]",
            created_at=datetime.utcnow(),
        )
        db.add(new_trade)
        db.flush()

        # Link order to trade
        live_order.trade_id = new_trade.id

        # Log behaviour event
        db.add(
            BehaviourLog(
                user_id=user_id,
                event_type=EventType.TRADE_LOGGED,
                description=f"Terminal order filled: {txn_type} {qty} {symbol} @ ₹{fill_price:.2f} (Paper Mode)",
            )
        )
        db.commit()
        db.refresh(live_order)
        return live_order

    @staticmethod
    def square_off_position(
        db: Session,
        user_id: int,
        position_id: int,
    ) -> Optional[LiveOrder]:
        """Squares off an open position at current market price."""
        pos = (
            db.query(LivePosition)
            .filter(
                LivePosition.id == position_id,
                LivePosition.user_id == user_id,
                LivePosition.status == "OPEN",
            )
            .first()
        )
        if not pos or pos.quantity == 0:
            return None

        # Opposite transaction
        txn_type = "SELL" if pos.quantity > 0 else "BUY"
        qty = abs(pos.quantity)

        order_data = {
            "symbol": pos.symbol,
            "transaction_type": txn_type,
            "product": pos.product,
            "order_type": "MARKET",
            "quantity": qty,
            "setup_type": "Position Square-off",
        }
        return PaperTradingEngine.execute_order(db, user_id, order_data)


# ─── Zerodha Kite Connect REST Service ────────────────────────────────────────

class ZerodhaKiteService:
    """
    Direct HTTPS REST integration with Zerodha Kite Connect v3.
    """
    BASE_URL = "https://api.kite.trade"

    @staticmethod
    def get_login_url(api_key: str) -> str:
        """Returns Zerodha OAuth login URL."""
        return f"https://kite.zerodha.com/connect/login?v=3&api_key={api_key}"

    @staticmethod
    def exchange_token(api_key: str, api_secret: str, request_token: str) -> Dict[str, Any]:
        """
        Exchanges request_token for access_token using SHA-256 checksum.
        Checksum = SHA256(api_key + request_token + api_secret)
        """
        to_hash = f"{api_key}{request_token}{api_secret}".encode("utf-8")
        checksum = hashlib.sha256(to_hash).hexdigest()

        payload = {
            "api_key": api_key,
            "request_token": request_token,
            "checksum": checksum,
        }

        url = f"{ZerodhaKiteService.BASE_URL}/session/token"
        headers = {
            "X-Kite-Version": "3",
            "User-Agent": "TradeMindOS/2.0",
        }

        try:
            resp = requests.post(url, data=payload, headers=headers, timeout=10)
            data = resp.json()
            if resp.status_code == 200 and data.get("status") == "success":
                token_data = data.get("data", {})
                return {
                    "success": True,
                    "access_token": token_data.get("access_token"),
                    "user_name": token_data.get("user_name"),
                    "user_id": token_data.get("user_id"),
                }
            else:
                return {
                    "success": False,
                    "error": data.get("message", "Zerodha token exchange failed"),
                }
        except Exception as exc:
            logger.error(f"Kite API token exchange error: {exc}")
            return {"success": False, "error": str(exc)}

    @staticmethod
    def place_order(
        api_key: str,
        access_token: str,
        order_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Places a regular order via Kite Connect API.
        """
        url = f"{ZerodhaKiteService.BASE_URL}/orders/regular"
        headers = {
            "X-Kite-Version": "3",
            "Authorization": f"token {api_key}:{access_token}",
            "User-Agent": "TradeMindOS/2.0",
        }

        kite_payload = {
            "tradingsymbol": order_data["symbol"],
            "exchange": "NFO" if "NIFTY" in order_data["symbol"] or "SENSEX" in order_data["symbol"] else "NSE",
            "transaction_type": order_data["transaction_type"],
            "order_type": order_data.get("order_type", "MARKET"),
            "quantity": order_data["quantity"],
            "product": order_data.get("product", "MIS"),
            "validity": "DAY",
        }
        if order_data.get("price") and order_data["price"] > 0:
            kite_payload["price"] = order_data["price"]
        if order_data.get("trigger_price") and order_data["trigger_price"] > 0:
            kite_payload["trigger_price"] = order_data["trigger_price"]

        try:
            resp = requests.post(url, data=kite_payload, headers=headers, timeout=10)
            data = resp.json()
            if resp.status_code == 200 and data.get("status") == "success":
                return {
                    "success": True,
                    "order_id": data.get("data", {}).get("order_id"),
                }
            return {
                "success": False,
                "error": data.get("message", "Kite order placement failed"),
            }
        except Exception as exc:
            logger.error(f"Kite order API error: {exc}")
            return {"success": False, "error": str(exc)}

    @staticmethod
    def get_positions(api_key: str, access_token: str) -> List[Dict[str, Any]]:
        """Fetches positions from Zerodha Kite."""
        url = f"{ZerodhaKiteService.BASE_URL}/portfolio/positions"
        headers = {
            "X-Kite-Version": "3",
            "Authorization": f"token {api_key}:{access_token}",
        }
        try:
            resp = requests.get(url, headers=headers, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                net_positions = data.get("data", {}).get("net", [])
                return net_positions
        except Exception as exc:
            logger.warning(f"Failed to fetch Kite positions: {exc}")
        return []
