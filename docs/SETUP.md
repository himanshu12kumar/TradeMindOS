# 🛠️ TradeMind OS — Setup Guide

Complete installation and configuration guide for running TradeMind OS locally.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Python | 3.10+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | any | `git --version` |

---

## 1. Clone the Repository

```bash
git clone https://github.com/himanshu12kumar/TradeMindOS.git
cd TradeMindOS
```

---

## 2. Backend Setup

### 2a. Create Python Virtual Environment

```bash
cd backend
python3 -m venv venv
```

### 2b. Activate Virtual Environment

```bash
# Linux / macOS
source venv/bin/activate

# Windows (Command Prompt)
venv\Scripts\activate.bat

# Windows (PowerShell)
venv\Scripts\Activate.ps1
```

### 2c. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2d. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env
```

Now open `.env` and configure:

```env
# Required — change the SECRET_KEY to something random and long
DATABASE_URL=sqlite:///./trademind.db
SECRET_KEY=your-super-secret-key-min-32-chars

# Optional — fill in only if you want email digest
SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
FROM_EMAIL=your.email@gmail.com
```

> ⚠️ **IMPORTANT:** Never commit your real `.env` file. It's in `.gitignore` for safety.

**Generate a strong SECRET_KEY:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 2e. Run Database Migrations

```bash
# From inside backend/ with venv activated
alembic upgrade head
```

This creates the SQLite database (`trademind.db`) with all tables.

### 2f. Start the Backend Server

```bash
# Development (with auto-reload)
uvicorn main:app --reload --port 8000

# Or without venv activated
venv/bin/uvicorn main:app --reload --port 8000
```

Backend is running at: **http://localhost:8000**  
Swagger API docs: **http://localhost:8000/docs**

---

## 3. Frontend Setup

Open a **new terminal** and navigate to the frontend directory:

```bash
# From project root
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend is running at: **http://localhost:5173**

---

## 4. Verify Everything Works

1. Open **http://localhost:5173**
2. Click **"Create one"** to register a new account
3. After registration you're auto-logged in
4. You should see the **Dashboard** with a 0/100 score ring

### Quick API check:
```bash
curl http://localhost:8000/
# Should return: {"app":"TradeMind OS","version":"2.0.0","status":"running"}
```

---

## 5. First Use — Create Your Trading Plan

1. Navigate to **Daily Plan** (`/plan`)
2. Fill in:
   - Market (e.g., NIFTY50)
   - Market Bias (Bullish/Bearish/Neutral)
   - Planned Setup (e.g., Breakout, Reversal)
   - Max Trades (recommended: 2-3)
   - Max Loss Amount (your hard stop for the day)
3. Complete all 6 pre-market checklist items
4. Click **Lock Plan** — this commits you to your plan for the day

---

## Configuration Reference

### `backend/.env` — All Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | `sqlite:///./trademind.db` | Yes | Database connection string |
| `SECRET_KEY` | (change this!) | Yes | JWT signing secret — must be unique and random |
| `ALGORITHM` | `HS256` | No | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | No | Session duration |
| `SMTP_HOST` | `smtp.gmail.com` | No | SMTP server host |
| `SMTP_PORT` | `587` | No | SMTP server port (587 = TLS) |
| `SMTP_USER` | — | No | Email address for sending digests |
| `SMTP_PASSWORD` | — | No | Gmail App Password |
| `FROM_EMAIL` | — | No | Sender email (usually same as SMTP_USER) |
| `FROM_NAME` | `TradeMind OS` | No | Sender display name |

### `frontend/vite.config.js` — Key Settings

No changes needed for local development. For production:
- Update `allow_origins` in `backend/main.py` to match your domain
- Build the frontend: `npm run build`

---

## Running in Production

### Backend (with Gunicorn)
```bash
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend (build static files)
```bash
cd frontend
npm run build
# Serve the dist/ folder with nginx or any static host
```

### Environment for Production
```env
DATABASE_URL=postgresql://user:password@localhost:5432/trademind
SECRET_KEY=<generate-with-secrets.token_hex(32)>
```

---

## Alembic Migration Commands

```bash
cd backend

# See current migration state
alembic current

# Apply all pending migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1

# Auto-generate migration from model changes
alembic revision --autogenerate -m "add_column_xyz"

# View migration history
alembic history --verbose
```

---

## Troubleshooting

### `bcrypt` version error on startup
```bash
pip install bcrypt==4.0.1
```

### Port already in use
```bash
# Find what's using port 8000
lsof -i :8000
kill -9 <PID>
```

### CORS errors in browser
- Make sure backend is running on port 8000
- Make sure frontend is running on port 5173
- Check `allow_origins` in `backend/main.py`

### Database reset (start fresh)
```bash
cd backend
rm trademind.db
alembic upgrade head
```

### Frontend cache issues
```bash
cd frontend
rm -rf node_modules/.vite
npm run dev
```

---

## Tech Stack Versions

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
alembic==1.13.1
bcrypt==4.0.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-dotenv==1.0.1
pydantic[email]==2.7.1
APScheduler==3.10.4
aiosmtplib==3.0.1

Node.js 18+
React 18
Vite 8
recharts (latest)
vite-plugin-pwa (latest)
```
