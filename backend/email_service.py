"""
Email Digest Service
Renders and sends the daily discipline score digest to users.
"""
import smtplib
import ssl
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from config import settings


# ─── HTML Email Template ──────────────────────────────────────────────────────

def _score_color(score: int) -> str:
    if score >= 80: return "#10b981"
    if score >= 60: return "#f59e0b"
    if score >= 40: return "#f97316"
    return "#ef4444"


def render_digest_html(username: str, score_data: dict, weekly_data: Optional[dict] = None) -> str:
    score = score_data.get("total_score", 0)
    grade = score_data.get("grade", "—")
    breakdown = score_data.get("breakdown", {})
    color = _score_color(score)
    today_str = date.today().strftime("%A, %d %B %Y")

    breakdown_rows = ""
    labels = {
        "pre_market_checklist": ("☀️ Pre-Market Checklist", 15),
        "risk_limit_respected":  ("🛡️ Risk Limit Respected",  20),
        "plan_setup_followed":   ("🎯 Plan Setup Followed",   25),
        "stop_loss_respected":   ("✂️ Stop-Loss Respected",   20),
        "journal_completed":     ("📝 Journal Completed",      10),
        "impulse_trade_penalty": ("⚡ Impulse Trade Penalty", -30),
    }
    for key, (label, max_pts) in labels.items():
        val = breakdown.get(key, 0)
        val_str = f"+{val}" if val >= 0 else str(val)
        val_color = "#10b981" if val >= 0 else "#ef4444"
        breakdown_rows += f"""
        <tr>
          <td style="padding:10px 16px;color:#94a3b8;font-size:14px;">{label}</td>
          <td style="padding:10px 16px;text-align:right;font-weight:700;color:{val_color};font-size:14px;">{val_str}</td>
          <td style="padding:10px 16px;text-align:right;color:#475569;font-size:13px;">/{max_pts}</td>
        </tr>"""

    weekly_block = ""
    if weekly_data:
        w = weekly_data
        pnl_color = "#10b981" if w.get("total_pnl", 0) >= 0 else "#ef4444"
        pnl_sign = "▲" if w.get("total_pnl", 0) >= 0 else "▼"
        weekly_block = f"""
        <div style="background:#0d1425;border-radius:12px;padding:24px;margin-top:24px;border:1px solid rgba(255,255,255,0.07);">
          <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 16px;">This Week's Summary</p>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
            <div>
              <div style="color:#64748b;font-size:11px;margin-bottom:4px;">TOTAL TRADES</div>
              <div style="color:#f1f5f9;font-size:1.5rem;font-weight:700;">{w.get('total_trades', 0)}</div>
            </div>
            <div>
              <div style="color:#64748b;font-size:11px;margin-bottom:4px;">TOTAL P&amp;L</div>
              <div style="color:{pnl_color};font-size:1.5rem;font-weight:700;">{pnl_sign} ₹{abs(w.get('total_pnl', 0)):.0f}</div>
            </div>
            <div>
              <div style="color:#64748b;font-size:11px;margin-bottom:4px;">PLAN ADHERENCE</div>
              <div style="color:#f1f5f9;font-size:1.5rem;font-weight:700;">{w.get('plan_followed_pct', 0):.0f}%</div>
            </div>
          </div>
          {f'<div style="margin-top:16px;padding:12px;background:rgba(239,68,68,0.08);border-radius:8px;border-left:3px solid #ef4444;"><span style="color:#fca5a5;font-size:13px;">🔴 Top mistake: {w["top_mistake"]}</span></div>' if w.get("top_mistake") else ""}
          <div style="margin-top:16px;padding:12px;background:rgba(59,130,246,0.08);border-radius:8px;border-left:3px solid #3b82f6;">
            <span style="color:#93c5fd;font-size:13px;">🎯 Focus: {w.get("focus_next_week", "Keep building consistency!")}</span>
          </div>
        </div>"""

    motivational_quotes = [
        "The secret of getting ahead is getting started.",
        "Discipline is choosing between what you want now and what you want most.",
        "A consistent edge compounded over time creates extraordinary results.",
        "Your only competition is who you were yesterday.",
        "The market rewards patience. Impatience rewards the market.",
    ]
    import random; quote = random.choice(motivational_quotes)

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TradeMind Daily Digest</title></head>
<body style="margin:0;padding:0;background:#070c18;font-family:'Segoe UI',system-ui,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-flex;align-items:center;gap:10px;background:#0d1425;padding:12px 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
      <span style="font-size:1.5rem;">🧠</span>
      <span style="color:#f1f5f9;font-weight:700;font-size:1.1rem;">TradeMind <span style="color:#3b82f6;">OS</span></span>
    </div>
    <p style="color:#475569;font-size:13px;margin:12px 0 0;">Daily Discipline Digest — {today_str}</p>
  </div>

  <!-- Greeting -->
  <div style="background:#0d1425;border-radius:16px;padding:28px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.07);">
    <p style="color:#94a3b8;font-size:15px;margin:0 0 8px;">Hey <strong style="color:#f1f5f9;">{username}</strong> 👋</p>
    <p style="color:#64748b;font-size:14px;margin:0;">Here's your trading discipline recap for today.</p>
  </div>

  <!-- Score Card -->
  <div style="background:#0d1425;border-radius:16px;padding:32px;margin-bottom:20px;text-align:center;border:1px solid {color}40;">
    <p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 16px;">Today's Discipline Score</p>
    <div style="font-size:5rem;font-weight:800;color:{color};line-height:1;margin-bottom:8px;">{score}</div>
    <div style="font-size:1.5rem;color:{color};font-weight:600;margin-bottom:12px;">{grade}</div>
    <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden;">
      <div style="height:100%;width:{score}%;background:{color};border-radius:99px;"></div>
    </div>
  </div>

  <!-- Breakdown -->
  <div style="background:#0d1425;border-radius:16px;overflow:hidden;margin-bottom:20px;border:1px solid rgba(255,255,255,0.07);">
    <div style="padding:16px 16px 8px;"><p style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Score Breakdown</p></div>
    <table style="width:100%;border-collapse:collapse;">
      {breakdown_rows}
    </table>
  </div>

  {weekly_block}

  <!-- Quote -->
  <div style="text-align:center;margin-top:32px;padding:0 20px;">
    <p style="color:#334155;font-size:13px;font-style:italic;line-height:1.6;">"{quote}"</p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;margin-top:24px;">
    <p style="color:#1e293b;font-size:12px;">TradeMind OS · Your behavioral trading system</p>
    <p style="color:#1e293b;font-size:11px;margin-top:4px;">
      To unsubscribe, log in and toggle off the digest in Settings.
    </p>
  </div>
</div>
</body></html>"""


# ─── Email Sender ─────────────────────────────────────────────────────────────

def send_digest_email(to_email: str, username: str, score_data: dict, weekly_data: dict = None) -> bool:
    """
    Send daily digest email via SMTP (sync, runs in thread from scheduler).
    Returns True on success, False on failure.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print("[EmailService] SMTP not configured — skipping email send")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"📊 TradeMind Daily Digest — Score: {score_data.get('total_score', 0)}/100 {score_data.get('grade', '')}"
        msg["From"] = f"{settings.FROM_NAME} <{settings.FROM_EMAIL or settings.SMTP_USER}>"
        msg["To"] = to_email

        html_body = render_digest_html(username, score_data, weekly_data)
        msg.attach(MIMEText(html_body, "html"))

        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to_email, msg.as_string())

        print(f"[EmailService] ✅ Digest sent to {to_email}")
        return True
    except Exception as e:
        print(f"[EmailService] ❌ Failed to send to {to_email}: {e}")
        return False
