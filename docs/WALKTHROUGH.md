# 📋 TradeMind OS — Project Walkthrough

Complete technical documentation of what was built, decisions made, and how it all fits together.

---

## Project Origin

Built for a developer who started trading 2 months ago while working a full-time 9-6 job.

**Core Problem:** Not lack of technical analysis knowledge, but:
- No time for deep market analysis before/during work
- Emotional trading (FOMO, revenge trading after losses)
- Inconsistency — different rules on different days
- No feedback loop to measure behavioral discipline

**Solution:** A behavioral OS that runs in 10 minutes/night + 5 minutes/morning.

---

## V1 — Core Discipline System

### What Was Built

#### Backend (FastAPI)

**Data Models (`models.py`):**
- `User` — credentials + email digest preferences
- `TradingPlan` — daily plan with 6-item checklist, risk params, lock state
- `Trade` — entry/exit details, impulse flag, plan-followed flag
- `EmotionalState` — BEFORE/AFTER emotional ratings per trade
- `BehaviourLog` — event log for all discipline events

**Impulse Trade Detector (`routers/trades.py`):**
```
POST /trade → run_impulse_detector() →
  Layer 1: Is there a locked plan today?          → if no: flag as impulse
  Layer 2: Exceeded max_trades for the day?       → HARD BLOCK
  Layer 3: Exceeded max_loss_amount for the day?  → HARD BLOCK  
  Layer 4: 2+ consecutive losses (revenge trade)? → WARNING
```

**Discipline Score Engine (`routers/scores.py`):**
- Runs on GET /scores/daily
- Queries plan + all today's trades
- Calculates score from 5 positive behaviors minus impulse penalties
- Returns breakdown + grade (A+ through F)

**Weekly Review (`routers/scores.py`):**
- Last 7 days of trades
- Plan adherence %, top repeated mistake, best habit
- AI-generated focus recommendation for next week

#### Frontend (React + Vite)

**Design System (`index.css`):**
- Dark navy theme (#070c18 base)
- CSS custom properties for all colors, radii, shadows
- Glassmorphism cards with backdrop-filter
- Animation keyframes: fadeInUp, pulse, shimmer, spin

**Key Components:**
- `Dashboard.jsx` — Animated SVG score ring, today's stats
- `DailyPlan.jsx` — 6-item checklist form + lock button (fields disable on lock)
- `TradeForm.jsx` — 2-step multi-part form: pre-trade checklist + emotional sliders → trade details
- `ImpulseAlert.jsx` — Modal overlay for hard blocks (🛑) and warnings (⚠️) with confirmation checkbox
- `WeeklyReview.jsx` — Stats cards, plan adherence bar, mistake/habit cards

**Auth Flow:**
- `AuthContext.jsx` stores JWT in localStorage
- Axios interceptor attaches `Authorization: Bearer <token>` to all requests
- 401 response auto-clears token and redirects to `/login`

---

## V2 — Analytics & Automation

### Feature 1: Trade History (`/history`)

**Backend (`routers/history.py`):**
- `GET /history/trades` — 7 filter params, pagination (20/page)
- `GET /history/stats` — aggregate win rate, avg P&L, best/worst trade, open count
- `PUT /history/trades/{id}/exit` — close open trade, recalculate P&L, log emotional exits

**Frontend (`pages/HistoryPage.jsx`):**
- Stats bar (5 pills: trades, win rate, P&L, avg P&L, open)
- Filter row (symbol, impulse, plan-followed, status, date range)
- Table with color-coded P&L, badges for impulse/plan, "Close Trade" button
- `UpdateExitModal.jsx` — live P&L preview, emotional exit warning

### Feature 2: Behaviour Log (`/behaviour`)

**Backend (`routers/behaviour.py`):**
- Added filter params: `event_type`, `date_from`, `date_to`
- New `GET /behaviour-log/summary` — violation count, clean-day streak, breakdown

**Frontend (`pages/BehaviourPage.jsx`):**
- Timeline with color-coded icons per event type
- Category filter pills: All / Violations / Trades / Plans
- Violation breakdown chips showing count per violation type

### Feature 3: Insights (`/insights`)

**Backend (`routers/insights.py`):**
- `/emotional-correlation` — trades with emotional before/after + P&L
- `/setup-performance` — win rate + avg P&L grouped by setup type
- `/time-of-day` — count + win rate by hour
- `/score-trend` — 30-day daily scores
- `/emotion-summary` — avg emotions split by win vs loss trades

**Frontend (`pages/InsightsPage.jsx`):**
- 30-day score trend line chart (Recharts LineChart)
- FOMO vs P&L scatter (green/red dots = win/loss)
- Stress vs P&L scatter
- Win rate by setup — bar chart + detail table
- Win/Loss emotion comparison — grouped bar chart

### Feature 4: Alembic Migrations

```
backend/alembic/
├── env.py          ← imports our models, reads DATABASE_URL from config
└── versions/
    └── a7bca21b9814_v2_user_email_digest_fields.py
        ← adds email_digest_enabled + digest_send_hour to users table
```

**Run:** `alembic upgrade head`

### Feature 5: Daily Email Digest

**`email_service.py`:**
- Renders dark-themed HTML email with score, breakdown table, weekly stats, motivational quote
- Sends via Gmail SMTP + TLS using Python's built-in `smtplib`

**`scheduler.py`:**
- APScheduler `BackgroundScheduler` with `Asia/Kolkata` timezone
- Cron job: daily at 21:00 (9 PM IST)
- Queries all users with `email_digest_enabled=True`
- Calculates score inline (avoids circular imports from router)
- Calls `send_digest_email()` for each user

**`routers/email_settings.py`:**
- `GET /settings/email` — return current preferences
- `PUT /settings/email` — toggle digest, set send hour
- `POST /settings/email/test` — send test email immediately

### Feature 6: Mobile PWA

**`vite.config.js` with `vite-plugin-pwa`:**
- Auto-generates service worker via Workbox
- Manifest: standalone mode, dark theme, app shortcuts
- Runtime caching: NetworkFirst for API calls (5-min TTL)

**CSS additions:**
- `.hide-on-mobile` / `.show-on-mobile` visibility helpers
- `@media (max-width: 768px)` breakpoints
- `@keyframes slideInRight` for mobile drawer
- Bottom tab bar (fixed position, z-index 900)

---

## Decisions & Trade-offs

| Decision | Choice | Reason |
|----------|--------|--------|
| Database | SQLite | Zero-config, easy to develop, Alembic makes PostgreSQL migration trivial |
| Auth | JWT stateless | No server session state, works with mobile PWA |
| Email | smtplib (stdlib) | No extra dependency, works with Gmail App Passwords |
| Scheduler | APScheduler background | Runs inside FastAPI process, no separate worker needed for MVP |
| CSS | Vanilla CSS variables | Full control, no framework overhead, easy dark theme |
| Charts | Recharts | Best React charts library, good scatter plot support |

---

## Known Bugs Fixed

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| bcrypt 500 error on register | `passlib` ↔ `bcrypt` version mismatch | Pinned `bcrypt==4.0.1` |
| `GET /settings/email` 422 error | Alembic added columns but existing rows had NULL | Code guard `or False` + DB backfill |
| Navbar 3-row stacking | CSS classes (`.navbar`, `.nav-link`) never defined in index.css | Rewrote Navbar with 100% inline styles + two-tier layout |
| Hamburger showing on desktop | `display: 'flex'` inline style overriding `.show-on-mobile { display: none }` CSS class | Added `!important` to `.show-on-mobile` base rule |
| Vite `.vite/` cache permission error | Cache owned by root (sudo npm install) | `sudo rm -rf node_modules/.vite` |

---

## API Flow — Full Trade Lifecycle

```
1. Register/Login → JWT token stored in localStorage

2. POST /plan → Create today's plan (unloced)
   └── POST /plan/{id}/lock → Lock plan (fields disabled in UI)

3. POST /trade → Impulse Detector runs →
   │   ├── HARD BLOCK? → 403 response → ImpulseAlert modal (🛑 red)
   │   ├── WARNING?    → 200 with warnings[] → ImpulseAlert modal (⚠️ yellow)  
   │   └── CLEAN?      → 200 trade saved → success toast
   │
   └── Trade saved with:
       - was_plan_followed (bool)
       - is_impulse_trade (bool)
       - emotional_states (BEFORE + AFTER)
       - pnl = (exit_price - entry_price) × quantity

4. GET /scores/daily → Calculates from plan + today's trades
5. GET /scores/weekly → 7-day aggregation
6. GET /insights/* → Chart data for behavior analysis
```

---

## File Change Log

### V1 Files Created
- `backend/main.py`, `config.py`, `database.py`, `auth.py`
- `backend/models.py`, `schemas.py`
- `backend/routers/auth.py`, `plans.py`, `trades.py`, `behaviour.py`, `scores.py`
- `frontend/src/index.css` (full design system)
- `frontend/src/api/client.js`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/components/Navbar.jsx`, `Dashboard.jsx`, `DailyPlan.jsx`, `TradeForm.jsx`, `WeeklyReview.jsx`, `ImpulseAlert.jsx`
- `frontend/src/pages/LoginPage.jsx`, `RegisterPage.jsx`
- `frontend/src/App.jsx`, `main.jsx`

### V2 Files Added
- `backend/email_service.py`
- `backend/scheduler.py`
- `backend/routers/history.py`, `insights.py`, `email_settings.py`
- `backend/alembic/` (init + migration)
- `frontend/src/pages/HistoryPage.jsx`, `BehaviourPage.jsx`, `InsightsPage.jsx`, `SettingsPage.jsx`
- `frontend/src/components/UpdateExitModal.jsx`, `EmailSettings.jsx`
- `frontend/public/icons/icon-192.svg`, `icon-512.svg`
- `frontend/vite.config.js` (updated with VitePWA)

### V2 Files Modified
- `backend/main.py` (added V2 routers + scheduler lifecycle)
- `backend/models.py` (added email fields to User)
- `backend/config.py` (added email settings)
- `backend/routers/behaviour.py` (added filters + summary endpoint)
- `frontend/src/App.jsx` (4 new routes)
- `frontend/src/api/client.js` (historyAPI, insightsAPI, settingsAPI)
- `frontend/src/components/Navbar.jsx` (two-tier redesign)
- `frontend/src/index.css` (badges, mobile breakpoints, PWA styles)
