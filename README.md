# 🧠 TradeMind OS

> **A Behavioral Operating System for Disciplined Traders**  
> *Not a charting app. A discipline layer between you and the market.*

---

## What Is TradeMind OS?

TradeMind OS is a full-stack web application that helps working traders build the **consistency, discipline, and emotional control** required to become profitable — even with a limited time window during market hours.

Most traders fail not because they lack technical analysis knowledge, but because they lack behavioral discipline. TradeMind OS solves this by:

- **Forcing a daily plan** before you trade — and **locking it** so you can't change it under pressure
- **Blocking impulse trades** in real-time with a 4-layer guard system
- **Scoring your behavior** (not your P&L) every single day
- **Revealing emotional patterns** through correlation charts (FOMO vs P&L, Stress vs P&L)
- **Sending daily email digests** with your discipline score every evening

> 💡 Your success metric is **not daily P&L**. It's your **Trader Behavior Score**.

---

## ✨ Features

### V1 — Core System
| Feature | Description |
|---------|-------------|
| 🔐 JWT Auth | Secure registration & login |
| 📋 Daily Plan | 6-item pre-market checklist with plan lock |
| ⚡ Impulse Detector | 4-layer real-time trade guard |
| 📈 Trade Logger | Multi-step form with emotional state capture |
| 🏆 Discipline Score | Behavioral scoring engine (0–100) |
| 📊 Weekly Review | Patterns, top mistake, focus recommendation |

### V2 — Analytics & Automation
| Feature | Description |
|---------|-------------|
| 📜 Trade History | Filterable table with 7 filter dimensions |
| 🔒 Update Exit UI | Close open trades with live P&L preview |
| 🔍 Behaviour Log | Color-coded event timeline with streak tracking |
| 📈 Insights Charts | FOMO/Stress vs P&L, setup win rates, score trend |
| 🗄️ Alembic Migrations | Schema versioning for PostgreSQL-ready migrations |
| 📧 Email Digest | APScheduler + Gmail SMTP daily score email |
| 📱 Mobile PWA | Installable app with bottom tab bar |

---

## 🏗️ Architecture

```
TraderOS/
├── backend/                    ← FastAPI + SQLAlchemy + SQLite
│   ├── main.py                 ← App entry, CORS, scheduler lifecycle
│   ├── config.py               ← Settings from .env
│   ├── database.py             ← SQLAlchemy engine + session
│   ├── models.py               ← 5 ORM models
│   ├── schemas.py              ← Pydantic schemas (request/response)
│   ├── auth.py                 ← JWT + bcrypt helpers
│   ├── email_service.py        ← HTML email renderer + SMTP sender
│   ├── scheduler.py            ← APScheduler daily digest job
│   ├── requirements.txt
│   ├── .env.example            ← Copy → .env and fill values
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/           ← Migration files
│   └── routers/
│       ├── auth.py             ← /auth/register, /auth/login, /auth/me
│       ├── plans.py            ← /plan CRUD + lock
│       ├── trades.py           ← /trade + impulse detector
│       ├── behaviour.py        ← /behaviour-log + summary
│       ├── scores.py           ← /scores/daily, /scores/weekly
│       ├── history.py          ← /history/trades, /history/stats
│       ├── insights.py         ← /insights/* (chart data endpoints)
│       └── email_settings.py   ← /settings/email
│
└── frontend/                   ← Vite + React
    ├── vite.config.js          ← Vite + PWA plugin config
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx             ← Router + protected routes
        ├── index.css           ← Full design system (dark theme)
        ├── api/
        │   └── client.js       ← Axios + JWT interceptor
        ├── context/
        │   └── AuthContext.jsx ← Global auth state
        ├── components/
        │   ├── Dashboard.jsx
        │   ├── DailyPlan.jsx
        │   ├── TradeForm.jsx
        │   ├── WeeklyReview.jsx
        │   ├── Navbar.jsx
        │   ├── ImpulseAlert.jsx
        │   ├── UpdateExitModal.jsx
        │   └── EmailSettings.jsx
        └── pages/
            ├── LoginPage.jsx
            ├── RegisterPage.jsx
            ├── HistoryPage.jsx
            ├── BehaviourPage.jsx
            ├── InsightsPage.jsx
            └── SettingsPage.jsx
```

---

## 🛡️ Impulse Trade Detector

Every trade submission passes through a **4-layer guard**:

```
Layer 1 → Plan Check         → Is there a locked plan today?
Layer 2 → Trade Limit        → Have you hit your max trades? [HARD BLOCK 🛑]
Layer 3 → Max Loss           → Have you hit your daily loss limit? [HARD BLOCK 🛑]
Layer 4 → Revenge Trading    → 2 consecutive losses? [WARNING ⚠️]
```

---

## 📊 Discipline Score Formula

| Component | Points |
|-----------|--------|
| Pre-market checklist (all 6 items) | +15 |
| Risk limit respected | +20 |
| All trades followed plan setup | +25 |
| Stop-loss respected (no fear/greed exits) | +20 |
| Journal/notes completed | +10 |
| **Per impulse trade** | **−30** |

**Grades:** A+ (90+) · A (80+) · B (70+) · C (60+) · D (40+) · F (<40)

---

## 🚀 Quick Start

See **[SETUP.md](docs/SETUP.md)** for complete installation instructions.

**TL;DR:**
```bash
# Backend
cd backend && cp .env.example .env
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/alembic upgrade head
venv/bin/uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**

---

## 🗺️ Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Score ring, today's stats, plan status |
| `/plan` | Daily Plan | Create & lock today's trading plan |
| `/trade` | Log Trade | 2-step form: checklist → trade details |
| `/history` | Trade History | Filterable trade table + stats |
| `/insights` | Insights | Emotional correlation & performance charts |
| `/behaviour` | Behaviour Log | Timeline of all discipline events |
| `/review` | Weekly Review | 7-day summary with pattern analysis |
| `/settings` | Settings | Email digest config |

---

## 📡 API Endpoints

Full API docs available at **http://localhost:8000/docs** (Swagger UI)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Get JWT token |
| POST | `/plan` | Create today's plan |
| POST | `/plan/{id}/lock` | Lock the plan |
| POST | `/trade` | Log trade + run impulse detector |
| PUT | `/history/trades/{id}/exit` | Close open trade |
| GET | `/scores/daily` | Today's discipline score |
| GET | `/scores/weekly` | 7-day review |
| GET | `/insights/emotional-correlation` | FOMO/stress vs P&L data |
| GET | `/insights/score-trend` | 30-day score trend |
| PUT | `/settings/email` | Toggle/configure email digest |
| POST | `/settings/email/test` | Send test digest immediately |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 8 |
| Styling | Vanilla CSS (dark design system) |
| Charts | Recharts |
| Backend | FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Database | SQLite (→ PostgreSQL ready) |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Scheduler | APScheduler 3.10 |
| Email | smtplib + Gmail SMTP |
| PWA | vite-plugin-pwa + Workbox |

---

## 🔄 Daily Workflow (10 min total)

### Night Before (10 min)
1. Open `/plan` → complete 6-item pre-market checklist
2. Set market, bias, key levels, planned setup
3. Set **max trades** + **max loss limit**
4. Click **Lock Plan** — you're committed for tomorrow

### Morning (5 min)
1. Open Dashboard → check yesterday's discipline score
2. Review your locked plan — no modifications!

### During Market
1. Go to `/trade` → complete pre-trade checklist
2. Rate your emotional state (FOMO, stress, confidence)
3. Submit — Impulse Detector runs automatically
4. Hard blocks and warnings appear before trade can proceed

### Evening (automatic)
- Email digest arrives with your score, breakdown, and weekly stats

---

## 🗄️ Database Migration (Alembic)

```bash
cd backend

# Check current migration status
venv/bin/alembic current

# Apply all pending migrations
venv/bin/alembic upgrade head

# Create a new migration after model changes
venv/bin/alembic revision --autogenerate -m "describe_your_change"

# Roll back one migration
venv/bin/alembic downgrade -1
```

---

## 🗃️ Switching to PostgreSQL

1. Install PostgreSQL and create a database
2. Update `.env`:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/trademind
   ```
3. Install psycopg2:
   ```bash
   venv/bin/pip install psycopg2-binary
   ```
4. Remove `check_same_thread` argument in `database.py` (SQLite-only flag)
5. Run migrations: `venv/bin/alembic upgrade head`

---

## 📧 Email Digest Setup

1. Enable **2-Step Verification** on your Google account
2. Go to: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create an App Password for "Mail"
4. Add to `backend/.env`:
   ```
   SMTP_USER=your.email@gmail.com
   SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   FROM_EMAIL=your.email@gmail.com
   ```
5. In the app, go to **Settings** → toggle **Daily Digest Email** ON
6. Click **Send Test Email** to verify

---

## 📝 License

MIT — build on it, learn from it, trade better with it.

---

*"Discipline is the bridge between goals and accomplishment." — Jim Rohn*
