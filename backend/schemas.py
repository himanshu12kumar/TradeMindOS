from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, field_validator
from models import ExitReason, EventType, EmotionalPhase


# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ─── Trading Plan ─────────────────────────────────────────────────────────────

class TradingPlanCreate(BaseModel):
    market: str = Field(..., example="NIFTY50")
    bias: str = Field(..., example="BULLISH")
    key_levels: Optional[str] = None   # JSON string
    planned_setup: Optional[str] = None
    notes: Optional[str] = None
    max_trades: int = Field(default=3, ge=1, le=20)
    max_loss_amount: float = Field(default=1000.0, ge=0)
    # Pre-market checklist
    slept_well: bool = False
    know_max_risk: bool = False
    reviewed_key_levels: bool = False
    no_emotional_baggage: bool = False
    checked_economic_calendar: bool = False
    reviewed_yesterday_trades: bool = False


class TradingPlanUpdate(BaseModel):
    market: Optional[str] = None
    bias: Optional[str] = None
    key_levels: Optional[str] = None
    planned_setup: Optional[str] = None
    notes: Optional[str] = None
    max_trades: Optional[int] = Field(default=None, ge=1, le=20)
    max_loss_amount: Optional[float] = Field(default=None, ge=0)
    slept_well: Optional[bool] = None
    know_max_risk: Optional[bool] = None
    reviewed_key_levels: Optional[bool] = None
    no_emotional_baggage: Optional[bool] = None
    checked_economic_calendar: Optional[bool] = None
    reviewed_yesterday_trades: Optional[bool] = None


class TradingPlanOut(BaseModel):
    id: int
    user_id: int
    date: date
    market: str
    bias: str
    key_levels: Optional[str]
    planned_setup: Optional[str]
    notes: Optional[str]
    max_trades: int
    max_loss_amount: float
    slept_well: bool
    know_max_risk: bool
    reviewed_key_levels: bool
    no_emotional_baggage: bool
    checked_economic_calendar: bool
    reviewed_yesterday_trades: bool
    is_locked: bool
    locked_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Emotional State ──────────────────────────────────────────────────────────

class EmotionalStateCreate(BaseModel):
    phase: EmotionalPhase
    confidence: int = Field(default=5, ge=1, le=10)
    stress: int = Field(default=5, ge=1, le=10)
    fomo: int = Field(default=5, ge=1, le=10)
    anger: int = Field(default=5, ge=1, le=10)
    patience: int = Field(default=5, ge=1, le=10)


class EmotionalStateOut(BaseModel):
    id: int
    phase: EmotionalPhase
    confidence: int
    stress: int
    fomo: int
    anger: int
    patience: int

    class Config:
        from_attributes = True


# ─── Trade ────────────────────────────────────────────────────────────────────

class TradeCreate(BaseModel):
    symbol: Optional[str] = None
    setup_type: Optional[str] = None
    entry_price: float = Field(..., gt=0)
    exit_price: Optional[float] = Field(default=None, gt=0)
    stop_loss: Optional[float] = Field(default=None, gt=0)
    target_price: Optional[float] = Field(default=None, gt=0)
    quantity: int = Field(..., ge=1)
    exit_reason: Optional[ExitReason] = None
    notes: Optional[str] = None
    # Pre-trade validation checklist
    setup_conditions_met: bool = False
    sl_is_defined: bool = False
    within_max_trades: bool = False
    # Emotional states
    emotional_before: Optional[EmotionalStateCreate] = None
    emotional_after: Optional[EmotionalStateCreate] = None


class TradeOut(BaseModel):
    id: int
    user_id: int
    trading_plan_id: Optional[int]
    symbol: Optional[str]
    setup_type: Optional[str]
    entry_price: float
    exit_price: Optional[float]
    stop_loss: Optional[float]
    target_price: Optional[float]
    quantity: int
    pnl: Optional[float]
    exit_reason: Optional[ExitReason]
    was_plan_followed: bool
    is_impulse_trade: bool
    setup_conditions_met: bool
    sl_is_defined: bool
    within_max_trades: bool
    notes: Optional[str]
    created_at: datetime
    emotional_states: List[EmotionalStateOut] = []

    class Config:
        from_attributes = True


class TradeResponse(BaseModel):
    """Wraps trade data with warnings from the impulse detector."""
    trade: TradeOut
    warnings: List[str] = []
    blocked: bool = False
    block_reason: Optional[str] = None


# ─── Behaviour Log ────────────────────────────────────────────────────────────

class BehaviourLogCreate(BaseModel):
    event_type: EventType
    description: Optional[str] = None


class BehaviourLogOut(BaseModel):
    id: int
    user_id: int
    event_type: EventType
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Scores ───────────────────────────────────────────────────────────────────

class DailyScoreOut(BaseModel):
    date: date
    total_score: int
    max_score: int
    breakdown: dict
    grade: str


class WeeklyReviewOut(BaseModel):
    week_start: date
    week_end: date
    total_trades: int
    plan_followed_count: int
    plan_followed_pct: float
    impulse_trade_count: int
    total_pnl: float
    avg_daily_score: float
    top_mistake: Optional[str]
    best_habit: Optional[str]
    focus_next_week: str


# ─── AI Coach (V2+) ───────────────────────────────────────────────────────────

class PreTradeCheckRequest(BaseModel):
    symbol: Optional[str] = "NIFTY50"
    setup_type: Optional[str] = None
    entry_price: float = 0.0
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    quantity: Optional[int] = 1
    fomo: Optional[int] = Field(default=5, ge=1, le=10)
    stress: Optional[int] = Field(default=5, ge=1, le=10)
    anger: Optional[int] = Field(default=5, ge=1, le=10)
    confidence: Optional[int] = Field(default=5, ge=1, le=10)
    language: Optional[str] = "en"


class PreTradeCheckResponse(BaseModel):
    risk_level: str
    should_block: bool
    urgency: str
    violations: List[str]
    warnings: List[str]
    voice_message: str
    coaching_message: str
    trade_count_today: int
    max_trades: int
    pnl_today: float
    consecutive_losses: int


class AIChatMessage(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    message: str
    history: Optional[List[AIChatMessage]] = None
    language: Optional[str] = "en"


class AIChatResponse(BaseModel):
    reply: str
    trader_context: dict


class EmotionalAlertRequest(BaseModel):
    fomo: int = Field(default=5, ge=1, le=10)
    stress: int = Field(default=5, ge=1, le=10)
    anger: int = Field(default=5, ge=1, le=10)
    confidence: int = Field(default=5, ge=1, le=10)
    language: Optional[str] = "en"


class EmotionalAlertResponse(BaseModel):
    is_alert: bool
    is_critical: bool
    voice_message: str
    advice: str
    scores: dict


class DailyBriefingResponse(BaseModel):
    briefing: str
    has_plan: bool
    plan_locked: bool
    max_trades: int
    max_loss_amount: float


# ─── Live Trading Terminal & Broker (V2+) ────────────────────────────────────

class BrokerConfigIn(BaseModel):
    broker_name: Optional[str] = "ZERODHA"
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    trading_mode: Optional[str] = "PAPER"  # "PAPER" or "REAL"
    paper_balance: Optional[float] = None


class BrokerConfigOut(BaseModel):
    broker_name: str
    api_key: Optional[str] = None
    api_secret_masked: Optional[str] = None
    has_access_token: bool = False
    trading_mode: str = "PAPER"
    paper_balance: float = 100000.0
    kite_login_url: Optional[str] = None


class BrokerTokenExchangeIn(BaseModel):
    request_token: str


class TerminalOrderCreate(BaseModel):
    symbol: str
    transaction_type: str  # "BUY" or "SELL"
    product: str = "MIS"   # "MIS", "CNC", "NRML"
    order_type: str = "MARKET"  # "MARKET", "LIMIT", "SL", "SL-M"
    quantity: int = Field(gt=0)
    price: Optional[float] = 0.0
    trigger_price: Optional[float] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    setup_type: Optional[str] = None
    override_risk_gate: Optional[bool] = False


class TerminalOrderOut(BaseModel):
    id: int
    broker_order_id: Optional[str] = None
    symbol: str
    trading_mode: str
    transaction_type: str
    product: str
    order_type: str
    quantity: int
    price: float
    trigger_price: Optional[float] = None
    stop_loss: Optional[float] = None
    target_price: Optional[float] = None
    status: str
    average_price: float
    created_at: datetime

    class Config:
        from_attributes = True


class TerminalPositionOut(BaseModel):
    id: int
    symbol: str
    product: str
    trading_mode: str
    quantity: int
    buy_avg_price: float
    sell_avg_price: float
    ltp: float
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    status: str

    class Config:
        from_attributes = True


class MarketInstrumentOut(BaseModel):
    symbol: str
    name: str
    segment: str
    ltp: float
    change: float
    change_percent: float
    high: float
    low: float
    open: float
    close: float
    lot_size: int = 1


class SquareOffRequest(BaseModel):
    symbol: Optional[str] = None  # None = square off all

