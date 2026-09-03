"""
Email Settings Router — manage daily digest preferences.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from email_service import send_digest_email
from models import User
from routers.scores import calculate_daily_score, score_to_grade
from models import Trade, TradingPlan
from datetime import date, datetime

router = APIRouter(prefix="/settings", tags=["settings"])


class EmailSettingsUpdate(BaseModel):
    email_digest_enabled: bool
    digest_send_hour: int = Field(default=21, ge=0, le=23)


class EmailSettingsOut(BaseModel):
    email_digest_enabled: bool
    digest_send_hour: int
    email: str


@router.get("/email", response_model=EmailSettingsOut)
def get_email_settings(
    current_user: User = Depends(get_current_user),
):
    return EmailSettingsOut(
        email_digest_enabled=current_user.email_digest_enabled or False,
        digest_send_hour=current_user.digest_send_hour if current_user.digest_send_hour is not None else 21,
        email=current_user.email,
    )


@router.put("/email", response_model=EmailSettingsOut)
def update_email_settings(
    payload: EmailSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.email_digest_enabled = payload.email_digest_enabled
    current_user.digest_send_hour = payload.digest_send_hour
    db.commit()
    db.refresh(current_user)
    return EmailSettingsOut(
        email_digest_enabled=current_user.email_digest_enabled,
        digest_send_hour=current_user.digest_send_hour,
        email=current_user.email,
    )


@router.post("/email/test")
def send_test_digest(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a test digest email immediately to the logged-in user."""
    from config import settings as cfg
    if not cfg.SMTP_USER or not cfg.SMTP_PASSWORD:
        raise HTTPException(400, detail="SMTP not configured. Add SMTP_USER and SMTP_PASSWORD to .env")

    today = date.today()
    day_start = datetime.combine(today, datetime.min.time())
    plan = db.query(TradingPlan).filter(
        TradingPlan.user_id == current_user.id, TradingPlan.date == today
    ).first()
    trades = db.query(Trade).filter(
        Trade.user_id == current_user.id, Trade.created_at >= day_start
    ).all()
    breakdown, total = calculate_daily_score(plan, trades)
    score_data = {"total_score": total, "grade": score_to_grade(total), "breakdown": breakdown}

    ok = send_digest_email(current_user.email, current_user.username, score_data)
    if ok:
        return {"message": f"✅ Test digest sent to {current_user.email}"}
    else:
        raise HTTPException(500, detail="Failed to send email. Check SMTP credentials in .env")
