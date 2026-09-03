# 📡 TradeMind OS — API Reference

Full API documentation. Also available interactively at **http://localhost:8000/docs**

---

## Authentication

All protected endpoints require a JWT Bearer token in the `Authorization` header.

```
Authorization: Bearer <your_token>
```

### POST `/auth/register`
Register a new user.

**Request Body:**
```json
{
  "username": "your_username",
  "email": "you@example.com",
  "password": "yourpassword"
}
```

**Response (201):**
```json
{
  "id": 1,
  "username": "your_username",
  "email": "you@example.com",
  "created_at": "2026-09-01T10:00:00"
}
```

---

### POST `/auth/login`
Get a JWT token. Uses form encoding (not JSON).

**Request (form data):**
```
username=your_username&password=yourpassword
Content-Type: application/x-www-form-urlencoded
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

---

### GET `/auth/me`
Get current user details. Requires auth.

---

## Trading Plans

### POST `/plan`
Create today's trading plan.

**Request Body:**
```json
{
  "market": "NIFTY50",
  "bias": "BULLISH",
  "key_levels": "22000, 22200, 22400",
  "planned_setup": "Breakout",
  "notes": "Watch for 9:20 open",
  "max_trades": 2,
  "max_loss_amount": 2000,
  "slept_well": true,
  "know_max_risk": true,
  "reviewed_key_levels": true,
  "no_emotional_baggage": true,
  "checked_economic_calendar": true,
  "reviewed_yesterday_trades": true
}
```

**Response (201):** Plan object with `id`, `is_locked: false`

---

### GET `/plan/today`
Get today's plan (if any).

---

### PUT `/plan/{plan_id}`
Update plan. If plan is locked, logs a `plan_modified_after_lock` behaviour event.

---

### POST `/plan/{plan_id}/lock`
Lock the plan. Returns updated plan with `is_locked: true`.

---

## Trades

### POST `/trade`
Log a new trade. Runs the Impulse Detector before saving.

**Request Body:**
```json
{
  "symbol": "NIFTY50",
  "setup_type": "Breakout",
  "entry_price": 22300,
  "exit_price": 22450,
  "stop_loss": 22200,
  "target_price": 22500,
  "quantity": 50,
  "exit_reason": "TARGET",
  "setup_conditions_met": true,
  "sl_is_defined": true,
  "within_max_trades": true,
  "notes": "Clean entry on first retest",
  "emotional_before": {
    "phase": "BEFORE",
    "confidence": 8,
    "stress": 3,
    "fomo": 2,
    "anger": 1,
    "patience": 8
  },
  "emotional_after": {
    "phase": "AFTER",
    "confidence": 9,
    "stress": 2,
    "fomo": 1,
    "anger": 1,
    "patience": 9
  }
}
```

**Response (200/403):**
```json
{
  "blocked": false,
  "block_reason": null,
  "warnings": ["⚠️ This is your 2nd consecutive loss. Take a break."],
  "trade": { ... }
}
```

If blocked (403):
```json
{
  "blocked": true,
  "block_reason": "🛑 You've reached your daily trade limit of 2 trades.",
  "trade": null
}
```

**Exit Reason Values:** `TARGET` | `STOP_LOSS` | `FEAR` | `GREED` | `MANUAL`

---

### GET `/trade`
List all trades (most recent first).

---

## Trade History (V2)

### GET `/history/trades`
Paginated, filtered trade list.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `date_from` | date | YYYY-MM-DD start |
| `date_to` | date | YYYY-MM-DD end |
| `symbol` | string | Contains filter |
| `is_impulse` | bool | true/false |
| `plan_followed` | bool | true/false |
| `exit_reason` | enum | TARGET/STOP_LOSS/FEAR/GREED/MANUAL |
| `is_open` | bool | true = no exit price |
| `page` | int | Default: 1 |
| `limit` | int | Default: 20, max: 100 |

---

### GET `/history/stats`
Aggregate statistics.

**Response:**
```json
{
  "total": 10,
  "wins": 6,
  "losses": 4,
  "win_rate": 60.0,
  "total_pnl": 8500.0,
  "avg_pnl": 850.0,
  "best_trade": 4500.0,
  "worst_trade": -2000.0,
  "impulse_count": 1,
  "open_trades": 0
}
```

---

### PUT `/history/trades/{trade_id}/exit`
Close an open trade and recalculate P&L.

**Query Parameters:**
- `exit_price` (float, required)
- `exit_reason` (enum, required)

---

## Scores

### GET `/scores/daily`
Today's discipline score.

**Response:**
```json
{
  "date": "2026-09-01",
  "total_score": 75,
  "grade": "B 👍",
  "breakdown": {
    "pre_market_checklist": 15,
    "risk_limit_respected": 20,
    "plan_setup_followed": 25,
    "stop_loss_respected": 20,
    "journal_completed": 0,
    "impulse_trade_penalty": 0
  },
  "trades_today": 2,
  "impulse_trades_today": 0
}
```

---

### GET `/scores/weekly`
7-day review.

**Response:**
```json
{
  "week_start": "2026-08-26",
  "week_end": "2026-09-01",
  "total_trades": 8,
  "plan_followed_count": 7,
  "plan_followed_pct": 87.5,
  "impulse_trade_count": 1,
  "total_pnl": 12000.0,
  "avg_daily_score": 72,
  "top_mistake": "Taking impulse trades",
  "best_habit": "Locking plan before market open",
  "focus_next_week": "Excellent week! Focus on maintaining 0 impulse trades."
}
```

---

## Insights (V2)

### GET `/insights/emotional-correlation`
Trades with before/after emotions for scatter charts.

**Query:** `?days=90`

---

### GET `/insights/setup-performance`
Win rate per setup type.

---

### GET `/insights/score-trend`
Daily scores for the last N days.

**Query:** `?days=30`

---

### GET `/insights/emotion-summary`
Average emotional scores: wins vs losses.

---

## Behaviour Log

### GET `/behaviour-log`
Filtered event list.

**Query Parameters:** `event_type`, `date_from`, `date_to`, `limit`, `page`

**Event Types:** `plan_created` | `plan_locked` | `plan_modified_after_lock` | `impulse_trade` | `trade_limit_reached` | `revenge_trade_warning` | `trade_logged` | `rule_break`

---

### GET `/behaviour-log/summary`
Summary stats for the last N days.

**Query:** `?days=7`

**Response:**
```json
{
  "period_days": 7,
  "total_events": 15,
  "violations": 2,
  "positive_events": 5,
  "clean_day_streak": 3,
  "violation_breakdown": {
    "impulse_trade": 1,
    "revenge_trade_warning": 1
  }
}
```

---

## Settings (V2)

### GET `/settings/email`
Get current digest preferences.

### PUT `/settings/email`
Update digest preferences.

```json
{
  "email_digest_enabled": true,
  "digest_send_hour": 21
}
```

### POST `/settings/email/test`
Send a test digest email immediately to the logged-in user's email address.
Requires SMTP configured in `.env`.
