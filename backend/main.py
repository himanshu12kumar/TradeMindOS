from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import auth, plans, trades, behaviour, scores
from routers import history, insights, email_settings, ai
from scheduler import start_scheduler, stop_scheduler

# ─── Create / migrate tables ──────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="TradeMind OS API",
    description=(
        "Behavioral Operating System for Traders. "
        "V2: Trade History, Insights, Email Digest, Behaviour Analytics."
    ),
    version="2.0.0",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Lifecycle ────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(plans.router)
app.include_router(trades.router)
app.include_router(behaviour.router)
app.include_router(scores.router)
# V2 routers
app.include_router(history.router)
app.include_router(insights.router)
app.include_router(email_settings.router)
app.include_router(ai.router)


@app.get("/", tags=["health"])
def root():
    return {
        "app": "TradeMind OS",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
