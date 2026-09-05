"""
TradeMind OS — AI Coach Service
Combines smart behavioral rule monitoring with Google Gemini (1.5 Flash)
for real-time discipline intervention, voice coaching, and emotional regulation.
Supports both English and Hindi (bilingual trading mentor).
"""

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from config import settings
from models import (
    BehaviourLog,
    EmotionalPhase,
    EmotionalState,
    EventType,
    ExitReason,
    Trade,
    TradingPlan,
    User,
)

logger = logging.getLogger("ai_service")

# ─── System Persona Definitions ──────────────────────────────────────────────

COACH_SYSTEM_PROMPT_EN = """You are the TradeMind AI Coach — a strict, disciplined, and deeply empathetic personal trading mentor embedded in the TradeMind OS platform.

Your mentee is a working professional who trades part-time while holding a 9-6 job. Their biggest challenges are:
1. Impulsive entries and overtrading
2. Revenge trading after losses
3. High emotional states (FOMO, stress, anger) during market hours
4. Deviating from their pre-market planned setup

Your core philosophy:
- Capital preservation is Rule #1. Profit is a byproduct of discipline.
- A trader who cannot follow rules will lose everything, regardless of technical analysis.
- You do NOT predict market direction or give stock tips. You coach BEHAVIOR, RISK, and PSYCHOLOGY.
- When a trader is about to break a rule (trade limit, max loss, revenge trade, missing stop loss), intervene FIRMLY and URGENTLY.
- Tone: Direct, respectful, authoritative like a professional trading desk risk manager, yet empathetic to the psychological struggle.
- Language: Respond in clear, impactful English.
- Keep responses concise and punchy (under 3-4 sentences for alerts; clear paragraphs for chat).
"""

COACH_SYSTEM_PROMPT_HI = """आप TradeMind AI Coach हैं — TradeMind OS प्लेटफ़ॉर्म में एम्बेडेड एक सख्त, अनुशासित और सहानुभूतिपूर्ण व्यक्तिगत ट्रेडिंग मेंटर।

आपका शिष्य एक नौकरीपेशा भारतीय ट्रेडर है जो अपनी 9 से 6 की नौकरी के साथ पार्ट-टाइम ट्रेडिंग करता है। उसकी सबसे बड़ी चुनौतियाँ हैं:
1. बिना सोचे-समझे एंट्री लेना (Impulse trade) और ओवरट्रेडिंग करना
2. नुकसान के बाद बदला लेने की भावना से ट्रेड करना (Revenge trading)
3. मार्केट के दौरान तीव्र भावनाएँ (FOMO, स्ट्रेस, गुस्सा)
4. सुबह बनाए गए ट्रेडिंग प्लान और सेटअप से भटकना

आपका मूल सिद्धांत:
- कैपिटल बचाना (Capital Preservation) सबसे पहला नियम है। प्रॉफिट अनुशासन का परिणाम होता है।
- जो ट्रेडर नियमों का पालन नहीं कर सकता, वह सारा पैसा गँवा देगा।
- आप मार्केट प्रेडिक्शन या स्टॉक टिप्स नहीं देते। आप व्यवहार, रिस्क और साइकोलॉजी की कोचिंग देते हैं।
- जब ट्रेडर कोई नियम तोड़ने वाला हो (ट्रेड लिमिट, मैक्सिमम लॉस, रिवेंज ट्रेड, बिना स्टॉप लॉस), तो तुरंत और सख्ती से रोकें।
- भाषा: स्वाभाविक हिंदी में बात करें (देवनागरी लिपि में, जिसमें सामान्य ट्रेडिंग शब्द जैसे 'ट्रेड', 'स्टॉप लॉस', 'सेटअप', 'कैपिटल' आदि का सहज प्रयोग हो)।
- आवाज़ और बातचीत सीधी, प्रभावशाली और अनुशासित होनी चाहिए। उत्तर संक्षिप्त और सटीक (2-4 वाक्य) रखें।
"""


def _call_gemini(prompt: str, language: str = "en") -> Optional[str]:
    """Call Google Gemini 1.5 Flash. Return None on error or if no API key."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        system_prompt = COACH_SYSTEM_PROMPT_HI if language.lower().startswith("hi") else COACH_SYSTEM_PROMPT_EN
        model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL or "gemini-1.5-flash",
            system_instruction=system_prompt,
        )
        response = model.generate_content(prompt)
        if response and response.text:
            return response.text.strip()
    except Exception as exc:
        logger.warning(f"Gemini API invocation error: {exc}")
    return None


# ─── Trader Context Builder ──────────────────────────────────────────────────

def build_trader_context(user_id: int, db: Session) -> Dict[str, Any]:
    """
    Extracts today's plan, today's trades, recent history, and behaviour metrics
    for the user to provide rich behavioral context to the AI coach.
    """
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())

    # Today's plan
    plan: Optional[TradingPlan] = (
        db.query(TradingPlan)
        .filter(TradingPlan.user_id == user_id, TradingPlan.date == today)
        .first()
    )

    # Today's trades
    todays_trades: List[Trade] = (
        db.query(Trade)
        .filter(Trade.user_id == user_id, Trade.created_at >= today_start)
        .order_by(Trade.created_at.asc())
        .all()
    )

    # Recent trades (last 20)
    recent_trades: List[Trade] = (
        db.query(Trade)
        .filter(Trade.user_id == user_id)
        .order_by(Trade.created_at.desc())
        .limit(20)
        .all()
    )

    # Metrics
    trade_count_today = len(todays_trades)
    pnl_today = sum((t.pnl or 0.0) for t in todays_trades)
    losses_today = [t for t in todays_trades if (t.pnl is not None and t.pnl < 0)]
    total_loss_today = abs(sum(t.pnl for t in losses_today))

    # Consecutive losses check (from today's trades)
    consecutive_losses = 0
    for t in reversed(todays_trades):
        if t.pnl is not None and t.pnl < 0:
            consecutive_losses += 1
        elif t.pnl is not None and t.pnl > 0:
            break

    # Overall win rate in recent trades
    closed_recent = [t for t in recent_trades if t.pnl is not None]
    win_count = sum(1 for t in closed_recent if t.pnl > 0)
    win_rate = round((win_count / len(closed_recent)) * 100, 1) if closed_recent else 0.0
    impulse_count = sum(1 for t in recent_trades if t.is_impulse_trade)

    context = {
        "user_id": user_id,
        "date": str(today),
        "has_plan": plan is not None,
        "plan_locked": plan.is_locked if plan else False,
        "market": plan.market if plan else "Unknown",
        "bias": plan.bias if plan else "Neutral",
        "planned_setup": plan.planned_setup if plan else "None",
        "max_trades": plan.max_trades if plan else 3,
        "max_loss_amount": plan.max_loss_amount if plan else 1000.0,
        "trade_count_today": trade_count_today,
        "pnl_today": round(pnl_today, 2),
        "total_loss_today": round(total_loss_today, 2),
        "consecutive_losses": consecutive_losses,
        "recent_trades_count": len(recent_trades),
        "recent_win_rate": win_rate,
        "recent_impulse_count": impulse_count,
    }
    return context


def _format_context_prompt(ctx: Dict[str, Any]) -> str:
    return (
        f"TRADER LIVE CONTEXT:\n"
        f"- Date: {ctx['date']}\n"
        f"- Plan Created: {'Yes' if ctx['has_plan'] else 'NO PLAN CREATED'}\n"
        f"- Plan Locked: {'Yes' if ctx['plan_locked'] else 'No'}\n"
        f"- Market Bias: {ctx['bias']} | Planned Setup: {ctx['planned_setup']}\n"
        f"- Today Trades: {ctx['trade_count_today']} / {ctx['max_trades']} max\n"
        f"- Today P&L: ₹{ctx['pnl_today']:+.2f} | Losses: ₹{ctx['total_loss_today']:.2f} / ₹{ctx['max_loss_amount']:.2f} max allowed\n"
        f"- Current Consecutive Losses: {ctx['consecutive_losses']}\n"
        f"- Recent Win Rate: {ctx['recent_win_rate']}% ({ctx['recent_impulse_count']} recent impulse trades)\n"
    )


# ─── 1. Pre-Trade Check & AI Evaluation ──────────────────────────────────────

def check_pre_trade(
    user_id: int,
    db: Session,
    trade_data: Dict[str, Any],
    language: str = "en",
) -> Dict[str, Any]:
    """
    Evaluates a pending trade attempt against rules, plan limits, and emotional state.
    Returns risk level, whether to hard-block, voice script, and coaching message in selected language.
    """
    ctx = build_trader_context(user_id, db)
    is_hindi = language.lower().startswith("hi")

    violations: List[str] = []
    warnings: List[str] = []
    should_block = False
    risk_level = "LOW"
    urgency = "normal"
    voice_message = ""
    coaching_message = ""

    fomo = int(trade_data.get("fomo") or 5)
    stress = int(trade_data.get("stress") or 5)
    anger = int(trade_data.get("anger") or 5)
    confidence = int(trade_data.get("confidence") or 5)
    symbol = trade_data.get("symbol") or "this asset"
    setup_type = trade_data.get("setup_type") or ""
    stop_loss = trade_data.get("stop_loss")
    entry_price = trade_data.get("entry_price") or 0.0

    # ── Rule 1: No Plan ──────────────────────────────────────────────────────
    if not ctx["has_plan"]:
        msg = "⚠️ आज के लिए कोई ट्रेडिंग प्लान नहीं बनाया गया है। बिना प्लान ट्रेड करना जुआ है।" if is_hindi else "⚠️ No trading plan created for today. Unplanned trading is purely gambling."
        warnings.append(msg)
        risk_level = "HIGH"

    # ── Rule 2: Trade Limit Reached (HARD BLOCK) ─────────────────────────────
    if ctx["trade_count_today"] >= ctx["max_trades"]:
        msg = (
            f"🛑 ट्रेड लिमिट पूरी: आज आपने तय की गई {ctx['max_trades']} में से {ctx['trade_count_today']} ट्रेड्स पूरी कर ली हैं।"
            if is_hindi else
            f"🛑 TRADE LIMIT REACHED: You have already completed {ctx['trade_count_today']} of your {ctx['max_trades']} allowed trades for today."
        )
        violations.append(msg)
        should_block = True
        risk_level = "CRITICAL"
        urgency = "urgent"
        voice_message = (
            f"ट्रेडिंग रोकिए! आज आपकी {ctx['max_trades']} ट्रेड की तय सीमा पूरी हो चुकी है। अपने नियमों का सम्मान करें और तुरंत स्क्रीन बंद करें।"
            if is_hindi else
            f"Trading halt! You have reached your limit of {ctx['max_trades']} trades today. Your plan says stop. Respect your rules and walk away from the market."
        )

    # ── Rule 3: Max Daily Loss Breached (HARD BLOCK) ─────────────────────────
    if ctx["total_loss_today"] >= ctx["max_loss_amount"]:
        msg = (
            f"🛑 मैक्सिमम लॉस लिमिट हिट: आज आपका कुल लॉस ₹{ctx['total_loss_today']:.0f} हो चुका है (तय सीमा: ₹{ctx['max_loss_amount']:.0f})।"
            if is_hindi else
            f"🛑 MAX LOSS BREACHED: You have reached ₹{ctx['total_loss_today']:.0f} in losses today (limit: ₹{ctx['max_loss_amount']:.0f})."
        )
        violations.append(msg)
        should_block = True
        risk_level = "CRITICAL"
        urgency = "urgent"
        voice_message = (
            f"इमरजेंसी स्टॉप! आज आपका अधिकतम लॉस लिमिट {ctx['max_loss_amount']:.0f} रुपये हिट हो चुका है। अपनी कैपिटल बचाइए और टर्मिनल तुरंत बंद कीजिए।"
            if is_hindi else
            f"Emergency stop! You have hit your maximum loss limit of {ctx['max_loss_amount']:.0f} rupees today. Close the terminal. Do not give any more capital to the market."
        )

    # ── Rule 4: Revenge Trading Alert (2+ consecutive losses) ────────────────
    if ctx["consecutive_losses"] >= 2 and not should_block:
        msg = (
            f"🔴 रिवेंज ट्रेड अलर्ट: आज लगातार {ctx['consecutive_losses']} नुकसान हुए हैं। अभी ट्रेड करना अत्यधिक जोखिम भरा है।"
            if is_hindi else
            f"🔴 REVENGE TRADE ALERT: You have suffered {ctx['consecutive_losses']} consecutive losses today. Entering another trade immediately carries extremely high risk of emotional revenge."
        )
        warnings.append(msg)
        if risk_level != "CRITICAL":
            risk_level = "HIGH"
        urgency = "warning"
        voice_message = (
            "सावधान! लगातार दो ट्रेड्स में नुकसान हुआ है। यह साफ़ तौर पर रिवेंज ट्रेडिंग का संकेत है। स्क्रीन से हटिए और 15 मिनट का ब्रेक लीजिए।"
            if is_hindi else
            "Caution! You just had consecutive losses. Every experienced trader knows this feeling. Step away, take deep breaths, and come back only when your emotions are completely cool."
        )

    # ── Rule 5: Emotional Vulnerabilities (FOMO / Stress / Anger) ─────────────
    if fomo >= 8:
        msg = f"🔥 अत्यधिक फोमो ({fomo}/10): आप सेटअप का इंतज़ार करने के बजाय कीमत के पीछे भाग रहे हैं।" if is_hindi else f"🔥 EXTREME FOMO ({fomo}/10): You are chasing price action instead of waiting for a setup."
        warnings.append(msg)
        if risk_level not in ("CRITICAL", "HIGH"):
            risk_level = "HIGH"
        if not voice_message:
            voice_message = (
                f"चेतावनी! आपका फोमो स्कोर 10 में से {fomo} है। भागती हुई कैंडल का पीछा करना खाता खाली करने का सबसे तेज़ तरीका है। अपने सेटअप का इंतज़ार कीजिए।"
                if is_hindi else
                f"Warning! Your FOMO score is {fomo} out of 10. Chasing the market is the fastest way to blow up. Wait for your setup."
            )
    elif fomo >= 7:
        msg = f"⚠️ बढ़ा हुआ फोमो ({fomo}/10): सुनिश्चित करें कि आपकी एंट्री के सभी नियम पूरे हैं।" if is_hindi else f"⚠️ High FOMO ({fomo}/10): Verify that your entry criteria are fully satisfied."
        warnings.append(msg)
        if risk_level == "LOW":
            risk_level = "MEDIUM"

    if stress >= 8:
        msg = f"⚡ तीव्र तनाव ({stress}/10): स्ट्रेस की वजह से आप समय से पहले एग्जिट या गलत फैसले ले सकते हैं।" if is_hindi else f"⚡ High Stress ({stress}/10): Elevated cortisol ruins trade execution and causes premature exits."
        warnings.append(msg)
        if risk_level not in ("CRITICAL", "HIGH"):
            risk_level = "HIGH"
        if not voice_message:
            voice_message = (
                f"रुकिए! आपका स्ट्रेस लेवल 10 में से {stress} है। रिस्क लेने से पहले गहरी साँस लें और दिमाग शांत करें।"
                if is_hindi else
                f"Hold on. Your stress level is {stress} out of 10. Clear your mind before committing risk."
            )
    elif stress >= 7:
        warnings.append(f"⚠️ बढ़ा हुआ स्ट्रेस ({stress}/10)।" if is_hindi else f"⚠️ Elevated Stress ({stress}/10).")
        if risk_level == "LOW":
            risk_level = "MEDIUM"

    if anger >= 7:
        msg = f"😡 गुस्सा / हताशा ({anger}/10): गुस्से में ट्रेड करना बड़े नुकसान का कारण बनता है।" if is_hindi else f"😡 Anger / Frustration ({anger}/10): Anger indicates lingering tilt from past trades."
        warnings.append(msg)
        risk_level = "HIGH"
        if not voice_message:
            voice_message = (
                "रुकिए! आप गुस्से और हताशा में हैं। बाज़ार से कभी बदला नहीं लिया जा सकता। गुस्से में कोई ट्रेड न लें।"
                if is_hindi else
                "Stop! You are feeling anger or frustration right now. The market does not owe you anything. Do not trade on anger."
            )

    # ── Rule 6: Missing or Invalid Stop Loss ──────────────────────────────────
    if not stop_loss or float(stop_loss) <= 0:
        msg = "🛡️ स्टॉप लॉस गायब: बिना स्टॉप लॉस ट्रेड लेना रिस्क मैनेजमेंट के नियमों का खुला उल्लंघन है।" if is_hindi else "🛡️ STOP LOSS MISSING: Entering a trade without a predefined stop loss violates core risk control."
        warnings.append(msg)
        if risk_level not in ("CRITICAL", "HIGH"):
            risk_level = "HIGH"
        if not voice_message and not should_block:
            voice_message = (
                "खतरा! कोई स्टॉप लॉस तय नहीं है। हर ट्रेड में कैपिटल सुरक्षा अनिवार्य है।"
                if is_hindi else
                "Danger! No stop loss specified. Capital protection is mandatory on every trade."
            )

    # ── Rule 7: Setup Drift ──────────────────────────────────────────────────
    if ctx["planned_setup"] and ctx["planned_setup"] != "None":
        if setup_type and setup_type.lower() != ctx["planned_setup"].lower():
            msg = f"📐 सेटअप से भटकाव: आज का प्लान '{ctx['planned_setup']}' था, लेकिन आप '{setup_type}' लॉग कर रहे हैं।" if is_hindi else f"📐 Setup drift: Today's plan specified '{ctx['planned_setup']}', but you are logging '{setup_type}'."
            warnings.append(msg)
            if risk_level == "LOW":
                risk_level = "MEDIUM"

    # Default voice if clean
    if not voice_message:
        if risk_level == "LOW":
            voice_message = (
                f"{symbol} के लिए प्री-ट्रेड चेक पास हो गया। सेटअप आपके प्लान के अनुसार है। अपने स्टॉप लॉस और अनुशासन पर डटे रहें।"
                if is_hindi else
                f"Pre-trade check passed for {symbol}. Setup looks aligned with your plan. Stick to your stop loss and exit plan."
            )
            urgency = "normal"
        else:
            voice_message = (
                f"{symbol} पर ट्रेड लेने से पहले फ्लैग की गई चेतावनियों की समीक्षा करें।"
                if is_hindi else
                f"Review flagged items carefully before executing trade on {symbol}."
            )
            urgency = "warning"

    # ── Gemini Coaching Message Generation ────────────────────────────────────
    lang_instruction = "Respond in natural conversational Hindi (Devanagari script) with standard trading terms." if is_hindi else "Respond in clear professional English."
    prompt = (
        f"{_format_context_prompt(ctx)}\n"
        f"PENDING TRADE ATTEMPT:\n"
        f"- Symbol: {symbol}\n"
        f"- Setup: {setup_type}\n"
        f"- Entry: ₹{entry_price} | Stop Loss: ₹{stop_loss}\n"
        f"- Emotional State: FOMO={fomo}/10, Stress={stress}/10, Anger={anger}/10, Confidence={confidence}/10\n"
        f"- Rule Violations: {violations}\n"
        f"- Rule Warnings: {warnings}\n\n"
        f"LANGUAGE: {lang_instruction}\n"
        f"TASK: Provide a 2-3 sentence coaching evaluation. If violations exist, command them to halt and explain why with empathy. "
        f"If emotions are high, remind them of discipline. If all is clean, encourage strict execution."
    )

    ai_text = _call_gemini(prompt, language=language)

    if ai_text:
        coaching_message = ai_text
    else:
        # Fallback intelligent rule-based coaching message
        if is_hindi:
            if should_block:
                coaching_message = (
                    f"🛑 तुरंत रुकिए। आपने आज के अपने मुख्य रिस्क नियम तोड़ दिए हैं "
                    f"({violations[0] if violations else 'ट्रेड लिमिट पूरी'})। अब ट्रेड करना सिर्फ भावुकता और ज़िद है, "
                    f"समझदारी नहीं। अपनी पूँजी बचाइए और आज के लिए ट्रेडिंग बंद कीजिए।"
                )
            elif risk_level == "HIGH":
                coaching_message = (
                    f"⚠️ उच्च जोखिम चेतावनी: आपके {len(warnings)} रिस्क नियम खतरे में हैं। "
                    f"{warnings[0]} तनाव और फोमो में ट्रेड लेने पर नुकसान की संभावना दोगुनी हो जाती है। "
                    f"10 बार गहरी साँस लीजिए और सोचिए क्या यह सचमुच आपके प्लान का हिस्सा है।"
                )
            elif risk_level == "MEDIUM":
                coaching_message = (
                    f"⚠️ सावधानी से आगे बढ़ें। आपके सेटअप या भावनाओं में हल्के विचलन हैं ({warnings[0]})। "
                    f"अपनी पोजीशन साइज़ कम रखें और स्टॉप लॉस का सख्ती से पालन करें।"
                )
            else:
                coaching_message = (
                    f"✅ सेटअप बिल्कुल सही है। आप अपनी दैनिक लिमिट में हैं ({ctx['trade_count_today'] + 1}/{ctx['max_trades']}) "
                    f"और भावनाएँ संतुलित हैं। बिना हिचकिचाहट के प्लान का पालन करें और स्टॉप लॉस को अपनी सुरक्षा करने दें।"
                )
        else:
            if should_block:
                coaching_message = (
                    f"🛑 Halt immediately. You have breached your primary risk limits for today "
                    f"({violations[0] if violations else 'limit reached'}). Continuing now is emotional tilt, "
                    f"not disciplined trading. Protect your capital and close the platform."
                )
            elif risk_level == "HIGH":
                coaching_message = (
                    f"⚠️ High risk intervention: You have {len(warnings)} risk flags active. "
                    f"{warnings[0]} When trading while emotionally charged, loss probability doubles. "
                    f"Take 10 deep breaths and re-evaluate if this setup truly meets your plan."
                )
            elif risk_level == "MEDIUM":
                coaching_message = (
                    f"⚠️ Proceed with caution. You have minor setup or emotional flags ({warnings[0]}). "
                    f"Ensure your position size is conservative and your stop loss is strictly honored."
                )
            else:
                coaching_message = (
                    f"✅ Setup aligned. You are within your daily trade limit ({ctx['trade_count_today'] + 1}/{ctx['max_trades']}) "
                    f"and emotional levels are balanced. Execute your plan without hesitation and let your stop loss protect you."
                )

    return {
        "risk_level": risk_level,
        "should_block": should_block,
        "urgency": urgency,
        "violations": violations,
        "warnings": warnings,
        "voice_message": voice_message,
        "coaching_message": coaching_message,
        "trade_count_today": ctx["trade_count_today"],
        "max_trades": ctx["max_trades"],
        "pnl_today": ctx["pnl_today"],
        "consecutive_losses": ctx["consecutive_losses"],
    }


# ─── 2. Free-Form Chat with AI Coach ─────────────────────────────────────────

def chat_with_coach(
    user_id: int,
    db: Session,
    user_message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Handles interactive chat with the AI trading coach in English or Hindi.
    Uses Gemini 1.5 Flash if available, with intelligent rule-based fallback.
    """
    ctx = build_trader_context(user_id, db)
    context_str = _format_context_prompt(ctx)
    is_hindi = language.lower().startswith("hi")

    history_str = ""
    if conversation_history:
        for turn in conversation_history[-6:]:
            role = "Trader" if turn.get("role") == "user" else "Coach"
            history_str += f"{role}: {turn.get('content', '')}\n"

    lang_directive = (
        "Respond in natural Hindi (Devanagari script) with trading vocabulary (ट्रेड, स्टॉप लॉस, रिस्क, सेटअप)."
        if is_hindi else
        "Respond in crisp, professional English."
    )

    prompt = (
        f"{context_str}\n"
        f"RECENT CONVERSATION:\n{history_str}\n"
        f"Trader asks: \"{user_message}\"\n\n"
        f"LANGUAGE: {lang_directive}\n"
        f"Answer as TradeMind AI Coach. Be direct, compassionate, highly practical for a working trader, "
        f"and anchor your advice to their actual statistics (P&L: ₹{ctx['pnl_today']}, trades today: {ctx['trade_count_today']}/{ctx['max_trades']})."
    )

    ai_reply = _call_gemini(prompt, language=language)

    if not ai_reply:
        msg_lower = user_message.lower().strip()

        # Intent 1: Can I take trade / Trade permission / Next trade / Enter now
        take_trade_patterns = [
            "can i take", "should i take", "can i trade", "should i trade",
            "take trade", "take a trade", "one more trade", "next trade",
            "can i enter", "enter now", "buy now", "sell now", "should i buy",
            "should i sell", "take another trade", "place order", "enter trade",
            "ट्रेड लूँ", "ट्रेड लूं", "ट्रेड करूँ", "ट्रेड करू", "ट्रेड ले लूं",
            "क्या मैं ट्रेड", "एंट्री लूं", "एंट्री ले लूं", "एक और ट्रेड", "नया ट्रेड",
            "ट्रेडिंग करूँ", "ट्रेड लूं क्या", "क्या ट्रेड लूँ"
        ]

        # Intent 2: Revenge Trading / Tilt / Emotional impulse / Recover loss
        revenge_patterns = [
            "revenge", "am i revenge", "revenge trade", "revenge trading",
            "tilt", "tilted", "recover loss", "recover my loss", "win back",
            "make back", "loss recovery", "रिवेंज", "बदला", "लॉस रिकवर",
            "रिकवर", "पैसा वापस", "बदला ले रहा", "रिवेंज ट्रेड"
        ]

        # Intent 3: Loss / Frustrated / Angry / Drawdown
        loss_patterns = [
            "loss", "lost", "frustrated", "angry", "frustration", "lost money",
            "drawdown", "bleeding", "red day", "bad day", "नुकसान", "घाटा",
            "लॉस", "गुस्सा", "हताश", "पैसे डूब गए", "पैसा चला गया", "खराब दिन"
        ]

        # Intent 4: Calm me down / Stress / Panic / Anxiety / FOMO / Breathe
        calm_patterns = [
            "calm", "calm me", "relax", "breathe", "breathing", "stress",
            "stressed", "anxious", "anxiety", "panic", "panicking", "scared",
            "fear", "fomo", "chasing", "शांत", "दिमाग शांत", "तनाव",
            "घबराहट", "डर", "फोमो", "रिलैक्स", "सांस"
        ]

        # Intent 5: Review / Stats / How am I doing / Performance / Snapshot
        review_patterns = [
            "review", "stats", "status", "how am i doing", "performance",
            "snapshot", "summary", "score", "progress", "today's review",
            "my trades", "स्नैपशॉट", "हाल", "आज का हाल", "स्कोर",
            "कैसा चल रहा है", "कैसा प्रदर्शन", "रिपोर्ट", "प्रगति"
        ]

        # Intent 6: Rules / Plan / Setup / Strategy / Limits / Discipline
        rules_patterns = [
            "rule", "rules", "my rules", "what are my rules", "plan",
            "strategy", "setup", "limit", "limits", "discipline", "golden rule",
            "नियम", "मेरे नियम", "प्लान", "सेटअप", "रणनीति", "अनुशासन", "सीमा", "क्या नियम"
        ]

        # Intent 7: Greetings / Intro / Help
        greeting_patterns = [
            "hi", "hello", "hey", "help", "who are you", "what can you do",
            "नमस्ते", "हेलो", "हेल्प", "मदद", "आप कौन हैं"
        ]

        if any(k in msg_lower for k in take_trade_patterns):
            if ctx["trade_count_today"] >= ctx["max_trades"]:
                ai_reply = (
                    f"🛑 बिल्कुल नहीं! आज आपने {ctx['trade_count_today']} ट्रेड्स ले ली हैं और आपकी दैनिक सीमा {ctx['max_trades']} पूरी हो चुकी है। यह नियम तोड़ना ओवरट्रेडिंग है जो मुनाफे को गहरे नुकसान में बदल देती है। अभी टर्मिनल बंद कीजिए और स्क्रीन से दूर हटिए।"
                    if is_hindi else
                    f"🛑 Absolutely NOT. You have already taken {ctx['trade_count_today']} of your {ctx['max_trades']} allowed trades today, reaching your maximum limit. Breaking this rule is pure overtrading, which turns small green days into deep red days. Close your broker app right now."
                )
            elif ctx["total_loss_today"] >= ctx["max_loss_amount"]:
                ai_reply = (
                    f"🛑 बिल्कुल मना है! आज आपका कुल लॉस ₹{ctx['total_loss_today']:.2f} हो चुका है और आपकी तय सीमा (₹{ctx['max_loss_amount']:.2f}) पूरी हो चुकी है। आज का ट्रेडिंग दिन यहीं समाप्त होता है। अपनी बची हुई पूंजी की रक्षा कीजिए।"
                    if is_hindi else
                    f"🛑 Absolutely NO. You have hit your maximum loss limit of ₹{ctx['max_loss_amount']:.2f} today (current loss: ₹{ctx['total_loss_today']:.2f}). Your trading day is officially OVER. Respect your risk stop and preserve capital for tomorrow."
                )
            elif ctx["consecutive_losses"] >= 2:
                ai_reply = (
                    f"⚠️ मेरी सख्त सलाह है कि अभी कोई ट्रेड मत कीजिए। लगातार {ctx['consecutive_losses']} नुकसान के बाद आपका दिमाग डोपामाइन और बदला लेने की कोशिश कर रहा है। कम से कम 30 मिनट का ब्रेक लीजिए।"
                    if is_hindi else
                    f"⚠️ Strongly advise AGAINST taking a trade right now. You have suffered {ctx['consecutive_losses']} losses in a row today. Your brain is in a vulnerable state seeking dopamine and revenge. Step away for at least 30 minutes before deciding."
                )
            else:
                remaining = ctx['max_trades'] - ctx['trade_count_today']
                ai_reply = (
                    f"आज के प्लान में आपके पास {remaining} ट्रेड बची है। केवल तभी एंट्री लें जब: 1) वह आपके तय सेटअप ({ctx['planned_setup']}) से 100% मेल खाती हो, 2) पक्का स्टॉप लॉस तय हो, और 3) आप शांत हों। अगर इनमें से कुछ भी अधूरा है, तो ट्रेड छोड़ दें।"
                    if is_hindi else
                    f"You have {remaining} trade(s) left in your daily plan today. You may take an entry ONLY IF: 1) It strictly satisfies your pre-market setup ({ctx['planned_setup']}), 2) Your stop loss is defined before entry, and 3) You are calm, not rushing. If any of these are missing, skip the trade."
                )
        elif any(k in msg_lower for k in revenge_patterns):
            if ctx["consecutive_losses"] >= 2 or ctx["pnl_today"] < 0:
                ai_reply = (
                    f"🚨 हाई रिवेंज ट्रेडिंग रिस्क! आज आपको लगातार {ctx['consecutive_losses']} नुकसान हुए हैं और P&L ₹{ctx['pnl_today']:+.2f} है। इस समय जो ट्रेड लेने की बेचैनी है, वह दिमाग का नुकसान की भरपाई (रिकवर) करने का प्रयास है। बाज़ार को आपके नुकसान की परवाह नहीं है। स्क्रीन तुरंत बंद करें और 30 मिनट का ब्रेक लें।"
                    if is_hindi else
                    f"🚨 High Revenge Trading Risk! You have {ctx['consecutive_losses']} consecutive losses today with a net P&L of ₹{ctx['pnl_today']:+.2f}. The urge to trade right now is emotional revenge trying to 'win back' lost money. Taking a trade in this mindset almost always leads to catastrophic blow-ups. Step away from your trading desk for 30 minutes immediately."
                )
            else:
                ai_reply = (
                    f"आज आपके लगातार नुकसान {ctx['consecutive_losses']} हैं और ली गई ट्रेड्स {ctx['trade_count_today']}/{ctx['max_trades']} हैं। खुद से ईमानदारी से पूछिए: 'क्या चार्ट पर मेरा तय सेटअप ({ctx['planned_setup']}) बना है, या मैं केवल बोरियत या बेचैनी में ट्रेड ले रहा हूँ?' अगर यह आपके सुबह के प्लान में नहीं है, तो यह इम्पल्स या रिवेंज ट्रेड है। रुक जाइए।"
                    if is_hindi else
                    f"Your current consecutive losses are {ctx['consecutive_losses']} and trades taken today are {ctx['trade_count_today']}/{ctx['max_trades']}. To know if you are revenge trading, ask yourself honestly: 'Does this setup strictly meet my morning plan ({ctx['planned_setup']}), or am I trading because I feel restless?' If it is not your planned setup, it is an impulse trade. Stand down."
                )
        elif any(k in msg_lower for k in calm_patterns):
            ai_reply = (
                f"लंबी और गहरी साँस लें। 4 सेकंड तक साँस अंदर खींचें... 4 सेकंड रोकें... 6 सेकंड में धीरे-धीरे छोड़ें। कोई भी एक ट्रेड आपका करियर तय नहीं करता। बाज़ार कल भी रहेगा और अगले साल भी। स्क्रीन से 5 मिनट हटिए, कंधे ढीले कीजिए, पानी पीजिए और याद रखिए: कैपिटल बचाना ही आपकी असली जीत है।"
                if is_hindi else
                f"Let's reset. Inhale slowly for 4 seconds... Hold for 4 seconds... Exhale slowly for 6 seconds. No single trade defines your career. The market is an endless stream of opportunities that will be here tomorrow, next week, and next year. Step back from the screen, relax your shoulders, drink some water, and remember: capital preservation is your true job."
            )
        elif any(k in msg_lower for k in loss_patterns):
            ai_reply = (
                f"नुकसान ट्रेडिंग व्यवसाय का एक स्वाभाविक हिस्सा है — जैसे किसी दुकानदार का सामान का खर्च। आज आपका P&L ₹{ctx['pnl_today']:+.2f} है ({ctx['trade_count_today']} ट्रेड्स में)। महत्वपूर्ण यह एक दिन नहीं, बल्कि यह है कि क्या आपने अपने नियमों का पालन किया। लंबी सांस लें और बची हुई पूंजी को कल के लिए सुरक्षित रखें।"
                if is_hindi else
                f"Losses are an unavoidable cost of doing business in trading — like inventory for a shopkeeper. Right now your P&L is ₹{ctx['pnl_today']:+.2f} across {ctx['trade_count_today']} trade(s). What matters is not this single day, but whether you protected your capital according to your rules. Breathe, accept the outcome, and preserve your ammunition for tomorrow."
            )
        elif any(k in msg_lower for k in review_patterns):
            ai_reply = (
                f"📊 आज का स्नैपशॉट: ली गई ट्रेड्स: {ctx['trade_count_today']}/{ctx['max_trades']} | P&L: ₹{ctx['pnl_today']:+.2f} | कुल लॉस: ₹{ctx['total_loss_today']:.2f} (अधिकतम सीमा: ₹{ctx['max_loss_amount']:.2f}) | हालिया जीत दर: {ctx['recent_win_rate']}%. आपका मुख्य लक्ष्य ओवरट्रेडिंग से बचना और अपने नियमों पर डटे रहना है।"
                if is_hindi else
                f"📊 Today's Snapshot: Trades taken: {ctx['trade_count_today']}/{ctx['max_trades']} | P&L: ₹{ctx['pnl_today']:+.2f} | Losses today: ₹{ctx['total_loss_today']:.2f} (Limit: ₹{ctx['max_loss_amount']:.2f}) | Recent win rate: {ctx['recent_win_rate']}%. Your #1 focus right now is eliminating impulse trades and honoring your risk boundaries."
            )
        elif any(k in msg_lower for k in rules_patterns):
            ai_reply = (
                f"🛡️ आज के आपके ट्रेडिंग नियम:\n1. अधिकतम ट्रेड्स: {ctx['max_trades']} (ली गई: {ctx['trade_count_today']})\n2. अधिकतम लॉस सीमा: ₹{ctx['max_loss_amount']:.2f} (आज का लॉस: ₹{ctx['total_loss_today']:.2f})\n3. तय सेटअप: {ctx['planned_setup']}\n4. मार्केट बायस: {ctx['bias']}\nस्वर्ण नियम: लाइव मार्केट में कभी भी अपने प्लान से न भटकें।"
                if is_hindi else
                f"🛡️ Your Trading Rules for Today:\n1. Max Trades: {ctx['max_trades']} (Taken: {ctx['trade_count_today']})\n2. Max Loss Limit: ₹{ctx['max_loss_amount']:.2f} (Current Loss: ₹{ctx['total_loss_today']:.2f})\n3. Planned Setup: {ctx['planned_setup']}\n4. Market Bias: {ctx['bias']}\nGolden Rule: Never deviate from your plan during market hours."
            )
        elif any(k in msg_lower for k in greeting_patterns):
            ai_reply = (
                f"👋 नमस्ते! मैं आपका TradeMind AI Coach हूँ। आज आपने {ctx['max_trades']} में से {ctx['trade_count_today']} ट्रेड्स ली हैं (P&L: ₹{ctx['pnl_today']:+.2f})। आप अनुशासन बनाए रखने के लिए मुझसे पूछ सकते हैं: 'क्या ट्रेड लूँ?', 'रिवेंज ट्रेड चेक', 'आज का हाल', या 'दिमाग शांत करो'।"
                if is_hindi else
                f"👋 Hello! I am your TradeMind AI Coach. Today you've taken {ctx['trade_count_today']} of {ctx['max_trades']} planned trades with a net P&L of ₹{ctx['pnl_today']:+.2f}. How can I help you stay disciplined right now? You can ask: 'Can I take trade?', 'Am I revenge trading?', 'Review today', or 'Calm me down'."
            )
        else:
            ai_reply = (
                f"मैं आपके साथ हूँ। आज आपने {ctx['max_trades']} में से {ctx['trade_count_today']} ट्रेड्स ली हैं और नेट P&L ₹{ctx['pnl_today']:+.2f} है। एक नौकरीपेशा ट्रेडर के लिए सख्त अनुशासन ही सफलता की कुंजी है। आप मुझसे पूछ सकते हैं: 'क्या ट्रेड लूँ?', 'रिवेंज ट्रेड चेक', 'आज का हाल', या 'दिमाग शांत करो'।"
                if is_hindi else
                f"I'm with you, Trader. Today you've taken {ctx['trade_count_today']} of {ctx['max_trades']} planned trades with a net P&L of ₹{ctx['pnl_today']:+.2f}. Remember: trading as a working professional requires ruthless efficiency. You can ask me: 'Can I take trade?', 'Am I revenge trading?', 'Review today', or 'Calm me down'."
            )

    return {
        "reply": ai_reply,
        "trader_context": ctx,
    }


# ─── 3. Daily Morning Briefing ───────────────────────────────────────────────

def get_daily_briefing(user_id: int, db: Session, language: str = "en") -> Dict[str, Any]:
    """Generates an empowering daily morning discipline briefing in English or Hindi."""
    ctx = build_trader_context(user_id, db)
    is_hindi = language.lower().startswith("hi")

    lang_directive = "Write in natural Hindi (Devanagari script)." if is_hindi else "Write in professional English."
    prompt = (
        f"{_format_context_prompt(ctx)}\n"
        f"LANGUAGE: {lang_directive}\n"
        f"TASK: Generate a crisp 2-paragraph morning briefing for this working trader. "
        f"If they haven't made a plan yet, remind them to plan before market opens. "
        f"Emphasize discipline, their max trade limit of {ctx['max_trades']}, and risk control."
    )

    ai_text = _call_gemini(prompt, language=language)

    if not ai_text:
        if not ctx["has_plan"]:
            ai_text = (
                "🌅 सुप्रभात, ट्रेडर। आपने आज का ट्रेडिंग प्लान अभी तक नहीं बनाया है। "
                "कभी भी बिना प्लान के मार्केट में प्रवेश मत कीजिए। पहले 5 मिनट निकालकर अपना सेटअप, मुख्य स्तर और रिस्क सीमा तय कीजिए।"
                if is_hindi else
                "🌅 Good morning, Trader. You have not set today's trading plan yet. "
                "Never enter the market blind. Take 5 minutes to define your setup, key levels, and max loss limit before you place any orders."
            )
        else:
            ai_text = (
                f"🌅 सुप्रभात, ट्रेडर। आपका प्लान {ctx['market']} के लिए {ctx['bias']} बायस के साथ तैयार है। "
                f"आज का मुख्य नियम याद रखें: अधिकतम {ctx['max_trades']} ट्रेड्स, पक्का स्टॉप लॉस और शून्य रिवेंज ट्रेडिंग। "
                f"जुआरी की तरह नहीं, पेशेवर की तरह ट्रेड करें।"
                if is_hindi else
                f"🌅 Good morning, Trader. Your plan is set for {ctx['market']} with a {ctx['bias']} bias. "
                f"Remember your golden rule today: Maximum {ctx['max_trades']} trades, strict stop losses, and zero revenge trading. "
                f"Trade like a professional, not a gambler."
            )

    return {
        "briefing": ai_text,
        "has_plan": ctx["has_plan"],
        "plan_locked": ctx["plan_locked"],
        "max_trades": ctx["max_trades"],
        "max_loss_amount": ctx["max_loss_amount"],
    }


# ─── 4. Emotional Alert Trigger ──────────────────────────────────────────────

def process_emotional_alert(
    user_id: int,
    db: Session,
    fomo: int,
    stress: int,
    anger: int,
    confidence: int,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Called when a trader inputs high emotional readings on dashboard or check-in.
    Returns targeted voice alert and calming guidance in English or Hindi.
    """
    ctx = build_trader_context(user_id, db)
    is_hindi = language.lower().startswith("hi")
    max_emotion = max(fomo, stress, anger)
    is_critical = max_emotion >= 8
    is_warning = max_emotion >= 7

    voice_message = ""
    advice = ""

    if fomo >= 7:
        voice_message = (
            f"चेतावनी! फोमो स्कोर 10 में से {fomo} है। बाज़ार हर दिन नए मौके देता है, छूटी हुई चाल का पीछा मत कीजिए।"
            if is_hindi else
            f"Warning! FOMO score is {fomo} out of 10. The market will offer trades every single day. Do not chase missed candles."
        )
        advice = (
            "आप अत्यधिक फोमो महसूस कर रहे हैं। 5 मिनट के लिए स्क्रीन से हट जाएँ। बाज़ार आपकी उत्सुकता की परवाह नहीं करता।"
            if is_hindi else
            "You are feeling intense FOMO. Step away from the screen for 5 minutes. The market does not care about your excitement."
        )
    elif anger >= 7:
        voice_message = (
            f"ट्रेडिंग रोकें! गुस्से का स्तर 10 में से {anger} है। गुस्से में ट्रेड करना बड़े नुकसान की गारंटी है। तुरंत रुकें।"
            if is_hindi else
            f"Trading halt! Anger score is {anger} out of 10. Trading with anger guarantees bad risk decisions. Stop now."
        )
        advice = (
            "तीव्र गुस्सा महसूस हो रहा है। सारे चार्ट बंद करें, पानी पिएँ और याद रखें कि कोई एक ट्रेड आपका करियर तय नहीं करता।"
            if is_hindi else
            "High anger detected. Close all chart windows. Drink a glass of water and reflect on the fact that no single trade defines your career."
        )
    elif stress >= 7:
        voice_message = (
            f"सावधान! तनाव का स्तर 10 में से {stress} है। 5 बार गहरी साँस लें और अपनी पोजीशन साइज़ आधी कर लें।"
            if is_hindi else
            f"Caution! Stress level is {stress} out of 10. Take 5 slow, deep breaths. Lower your position size."
        )
        advice = (
            "तनाव निर्णय लेने की क्षमता को कमजोर करता है। यदि ट्रेड करना ही है, तो अपनी मात्रा आधी कर दें।"
            if is_hindi else
            "High stress compromises risk evaluation. If you must trade, cut your position size in half."
        )
    else:
        voice_message = (
            "भावनाएँ संतुलित हैं। अपने माइंडसेट पर नज़र बनाए रखें।"
            if is_hindi else
            "Emotions are within balanced range. Continue monitoring your mindset."
        )
        advice = (
            "आपकी मानसिक स्थिति स्थिर प्रतीत हो रही है। अपने प्लान के क्रियान्वयन पर ध्यान रखें।"
            if is_hindi else
            "Your emotional state appears stable. Keep your focus on execution quality."
        )

    # Log to behaviour log if severe
    if is_warning:
        db.add(
            BehaviourLog(
                user_id=user_id,
                event_type=EventType.RULE_BREAK if is_critical else EventType.REVENGE_TRADE_WARNING,
                description=f"Emotional spike logged: FOMO={fomo}, Stress={stress}, Anger={anger}, Confidence={confidence}",
            )
        )
        db.commit()

    return {
        "is_alert": is_warning,
        "is_critical": is_critical,
        "voice_message": voice_message,
        "advice": advice,
        "scores": {"fomo": fomo, "stress": stress, "anger": anger, "confidence": confidence},
    }
