import enum
from datetime import datetime, date as date_type
from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, Date, Enum, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from database import Base


# ─── Enumerations ─────────────────────────────────────────────────────────────

class ExitReason(str, enum.Enum):
    TARGET = "TARGET"
    STOP_LOSS = "STOP_LOSS"
    FEAR = "FEAR"
    GREED = "GREED"
    MANUAL = "MANUAL"


class EventType(str, enum.Enum):
    PLAN_CREATED = "plan_created"
    PLAN_LOCKED = "plan_locked"
    PLAN_MODIFIED_AFTER_LOCK = "plan_modified_after_lock"
    IMPULSE_TRADE = "impulse_trade"
    TRADE_LIMIT_REACHED = "trade_limit_reached"
    REVENGE_TRADE_WARNING = "revenge_trade_warning"
    TRADE_LOGGED = "trade_logged"
    RULE_BREAK = "rule_break"


class EmotionalPhase(str, enum.Enum):
    BEFORE = "BEFORE"
    AFTER = "AFTER"


class MarketBias(str, enum.Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


# ─── ORM Models ───────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ── V2: Email Digest Settings ──────────────────────────────────
    email_digest_enabled = Column(Boolean, default=False)
    digest_send_hour = Column(Integer, default=21)  # 9 PM local time

    plans = relationship("TradingPlan", back_populates="user")
    trades = relationship("Trade", back_populates="user")
    behaviour_logs = relationship("BehaviourLog", back_populates="user")


class TradingPlan(Base):
    __tablename__ = "trading_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, default=date_type.today, nullable=False)

    # Market context
    market = Column(String(50), nullable=False)
    bias = Column(String(20), nullable=False)
    key_levels = Column(Text, nullable=True)
    planned_setup = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    # Risk parameters
    max_trades = Column(Integer, default=3)
    max_loss_amount = Column(Float, default=1000.0)

    # Pre-market checklist
    slept_well = Column(Boolean, default=False)
    know_max_risk = Column(Boolean, default=False)
    reviewed_key_levels = Column(Boolean, default=False)
    no_emotional_baggage = Column(Boolean, default=False)
    checked_economic_calendar = Column(Boolean, default=False)
    reviewed_yesterday_trades = Column(Boolean, default=False)

    # Lock state
    is_locked = Column(Boolean, default=False)
    locked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="plans")
    trades = relationship("Trade", back_populates="trading_plan")


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trading_plan_id = Column(Integer, ForeignKey("trading_plans.id", ondelete="SET NULL"), nullable=True)

    symbol = Column(String(50), nullable=True)
    setup_type = Column(String(100), nullable=True)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    quantity = Column(Integer, nullable=False)
    pnl = Column(Float, nullable=True)
    exit_reason = Column(Enum(ExitReason), nullable=True)

    was_plan_followed = Column(Boolean, default=True)
    is_impulse_trade = Column(Boolean, default=False)

    setup_conditions_met = Column(Boolean, default=False)
    sl_is_defined = Column(Boolean, default=False)
    within_max_trades = Column(Boolean, default=False)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="trades")
    trading_plan = relationship("TradingPlan", back_populates="trades")
    emotional_states = relationship("EmotionalState", back_populates="trade", cascade="all, delete-orphan")


class EmotionalState(Base):
    __tablename__ = "emotional_states"

    id = Column(Integer, primary_key=True, index=True)
    trade_id = Column(Integer, ForeignKey("trades.id", ondelete="CASCADE"), nullable=False)
    phase = Column(Enum(EmotionalPhase), nullable=False)

    confidence = Column(Integer, default=5)
    stress = Column(Integer, default=5)
    fomo = Column(Integer, default=5)
    anger = Column(Integer, default=5)
    patience = Column(Integer, default=5)

    trade = relationship("Trade", back_populates="emotional_states")


class BehaviourLog(Base):
    __tablename__ = "behaviour_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(Enum(EventType), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="behaviour_logs")
