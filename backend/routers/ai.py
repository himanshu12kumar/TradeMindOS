"""
TradeMind OS — AI Coach API Router
Provides endpoints for pre-trade risk checks, free-form chat coaching,
daily discipline briefings, and real-time emotional intervention.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from schemas import (
    AIChatRequest,
    AIChatResponse,
    DailyBriefingResponse,
    EmotionalAlertRequest,
    EmotionalAlertResponse,
    PreTradeCheckRequest,
    PreTradeCheckResponse,
)
import ai_service

router = APIRouter(prefix="/ai", tags=["ai_coach"])


@router.post("/pre-trade-check", response_model=PreTradeCheckResponse)
def pre_trade_check(
    payload: PreTradeCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluates a pending trade before submission against daily plan limits,
    impulse trade rules, and emotional triggers. Returns voice coaching guidance.
    """
    result = ai_service.check_pre_trade(
        user_id=current_user.id,
        db=db,
        trade_data=payload.model_dump(),
        language=payload.language or "en",
    )
    return result


@router.post("/chat", response_model=AIChatResponse)
def ai_chat(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Free-form interactive chat with the AI Trading Coach.
    Provides context-aware discipline, mindset, and performance coaching.
    """
    history_dicts = [h.model_dump() for h in payload.history] if payload.history else None
    result = ai_service.chat_with_coach(
        user_id=current_user.id,
        db=db,
        user_message=payload.message,
        conversation_history=history_dicts,
        language=payload.language or "en",
    )
    return result


@router.get("/daily-briefing", response_model=DailyBriefingResponse)
def daily_briefing(
    language: str = "en",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns today's morning discipline briefing tailored to the trader's plan status.
    """
    result = ai_service.get_daily_briefing(
        user_id=current_user.id,
        db=db,
        language=language,
    )
    return result


@router.post("/emotional-alert", response_model=EmotionalAlertResponse)
def emotional_alert(
    payload: EmotionalAlertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Triggers an emotional intervention when FOMO, stress, or anger levels spike.
    """
    result = ai_service.process_emotional_alert(
        user_id=current_user.id,
        db=db,
        fomo=payload.fomo,
        stress=payload.stress,
        anger=payload.anger,
        confidence=payload.confidence,
        language=payload.language or "en",
    )
    return result
