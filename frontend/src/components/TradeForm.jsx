import { useState, useEffect } from 'react';
import { tradeAPI, planAPI, aiAPI } from '../api/client';
import ImpulseAlert from './ImpulseAlert';
import voiceAlert from '../services/VoiceAlert';

const SETUP_TYPES = ['Breakout', 'Retest / Pullback', 'Reversal', 'Range Bound', 'Momentum', 'Gap Fill', 'Other'];
const EXIT_REASONS = ['TARGET', 'STOP_LOSS', 'FEAR', 'GREED', 'MANUAL'];

function EmotionalSlider({ label, value, onChange }) {
  const color = value <= 3 ? '#10b981' : value <= 6 ? '#f59e0b' : '#ef4444';
  return (
    <div className="slider-wrap">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-val" style={{ color }}>{value}/10</span>
      </div>
      <input
        type="range" min="1" max="10" value={value}
        onChange={e => onChange(parseInt(e.target.value))}
      />
    </div>
  );
}

const defaultEmotional = { confidence: 5, stress: 5, fomo: 5, anger: 5, patience: 5 };

export default function TradeForm() {
  const [step, setStep] = useState(1); // 1 = Pre-Trade Checklist, 2 = Trade Entry, 3 = AI Review
  const [plan, setPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReview, setAiReview] = useState(null);
  const [overrideBlock, setOverrideBlock] = useState(false);
  const [alert, setAlert] = useState(null); // { type, message, onConfirm }
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Pre-trade checklist (Step 1)
  const [checklist, setChecklist] = useState({
    setup_conditions_met: false,
    sl_is_defined: false,
    within_max_trades: false,
  });
  const [emotionalBefore, setEmotionalBefore] = useState({ ...defaultEmotional });

  // Trade data (Step 2)
  const [trade, setTrade] = useState({
    symbol: '',
    setup_type: '',
    entry_price: '',
    exit_price: '',
    stop_loss: '',
    target_price: '',
    quantity: '',
    exit_reason: '',
    notes: '',
  });
  const [emotionalAfter, setEmotionalAfter] = useState({ ...defaultEmotional });

  useEffect(() => {
    planAPI.getToday().then(res => res.data && setPlan(res.data)).catch(() => {});
  }, []);

  const checklistAll = Object.values(checklist).every(Boolean);

  const setCheck = (key, val) => setChecklist(c => ({ ...c, [key]: val }));
  const setField = (key, val) => setTrade(t => ({ ...t, [key]: val }));
  const setEmoBefore = (key, val) => setEmotionalBefore(e => ({ ...e, [key]: val }));
  const setEmoAfter  = (key, val) => setEmotionalAfter(e => ({ ...e, [key]: val }));

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 5000); };
  const showError   = (msg) => { setErrorMsg(msg);   setTimeout(() => setErrorMsg(''), 5000);   };

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        symbol: trade.symbol || null,
        setup_type: trade.setup_type || null,
        entry_price: parseFloat(trade.entry_price),
        exit_price:  trade.exit_price  ? parseFloat(trade.exit_price)  : null,
        stop_loss:   trade.stop_loss   ? parseFloat(trade.stop_loss)   : null,
        target_price: trade.target_price ? parseFloat(trade.target_price) : null,
        quantity: parseInt(trade.quantity),
        exit_reason: trade.exit_reason || null,
        notes: trade.notes || null,
        setup_conditions_met: checklist.setup_conditions_met,
        sl_is_defined: checklist.sl_is_defined,
        within_max_trades: checklist.within_max_trades,
        emotional_before: { phase: 'BEFORE', ...emotionalBefore },
        emotional_after:  { phase: 'AFTER',  ...emotionalAfter  },
      };

      const { data } = await tradeAPI.log(payload);

      // Hard block
      if (data.blocked) {
        setAlert({ type: 'blocked', message: data.block_reason, onConfirm: null });
        return;
      }

      // Warnings (revenge trade etc.)
      if (data.warnings?.length) {
        // Show warning, let user confirm then show success
        setAlert({
          type: 'warning',
          message: data.warnings.join('\n\n'),
          onConfirm: () => {
            setAlert(null);
            showSuccess(`✅ Trade logged! ${data.trade.is_impulse_trade ? '(Flagged as impulse trade)' : ''}`);
            resetForm();
          },
        });
        return;
      }

      showSuccess(`✅ Trade logged! PnL: ${data.trade.pnl != null ? `₹${data.trade.pnl.toFixed(2)}` : 'Open'}`);
      resetForm();
    } catch (err) {
      showError(err.response?.data?.detail || 'Error logging trade');
    } finally {
      setSubmitting(false);
    }
  };

  const runAIReview = async () => {
    if (!trade.entry_price || !trade.quantity) {
      showError('Entry price and quantity are required');
      return;
    }
    setAiLoading(true);
    try {
      const currentLang = localStorage.getItem('tm_bot_lang') || 'en';
      const payload = {
        symbol: trade.symbol || (plan?.market || 'NIFTY50'),
        setup_type: trade.setup_type || null,
        entry_price: parseFloat(trade.entry_price) || 0,
        stop_loss: trade.stop_loss ? parseFloat(trade.stop_loss) : null,
        target_price: trade.target_price ? parseFloat(trade.target_price) : null,
        quantity: parseInt(trade.quantity) || 1,
        fomo: emotionalBefore.fomo,
        stress: emotionalBefore.stress,
        anger: emotionalBefore.anger,
        confidence: emotionalBefore.confidence,
        language: currentLang,
      };
      const { data } = await aiAPI.preTradeCheck(payload);
      setAiReview(data);
      setStep(3);

      if (data?.voice_message) {
        voiceAlert.speak(data.voice_message, data.urgency || 'normal', currentLang);
      }
    } catch (err) {
      // Fallback: proceed directly to submit if AI call fails
      doSubmit();
    } finally {
      setAiLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setAiReview(null);
    setOverrideBlock(false);
    setChecklist({ setup_conditions_met: false, sl_is_defined: false, within_max_trades: false });
    setEmotionalBefore({ ...defaultEmotional });
    setTrade({ symbol: '', setup_type: '', entry_price: '', exit_price: '', stop_loss: '', target_price: '', quantity: '', exit_reason: '', notes: '' });
    setEmotionalAfter({ ...defaultEmotional });
  };

  const CheckItem = ({ id, label, desc }) => (
    <label
      className={`checkbox-item ${checklist[id] ? 'checked' : ''}`}
      style={{ cursor: 'pointer', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}
      onClick={() => setCheck(id, !checklist[id])}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <div className="checkbox-box" style={{
          background: checklist[id] ? 'var(--success)' : 'var(--bg-elevated)',
          borderColor: checklist[id] ? 'var(--success)' : 'var(--border)',
          flexShrink: 0,
        }}>
          {checklist[id] && <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>✓</span>}
        </div>
        <span className="checkbox-text" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      </div>
      {desc && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: 34 }}>{desc}</span>}
    </label>
  );

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: 700 }}>

        {/* Alert Modal */}
        {alert && (
          <ImpulseAlert
            type={alert.type}
            message={alert.message}
            onConfirm={alert.onConfirm}
            onDismiss={() => setAlert(null)}
          />
        )}

        {/* Header */}
        <div style={{ marginBottom: 32 }} className="animate-in">
          <h1>Log a Trade</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '0.9rem' }}>
            The discipline layer between you and your entry.
          </p>
        </div>

        {/* Plan context banner */}
        {plan && (
          <div className="alert alert-info animate-in" style={{ marginBottom: 24 }}>
            <span>📋</span>
            <span>
              Today's Plan: <strong>{plan.market}</strong> | Bias: <strong>{plan.bias}</strong> |
              Setup: <strong>{plan.planned_setup || 'Not set'}</strong> |
              Trades left: <strong>{plan.max_trades - 0}</strong>
              {plan.is_locked && ' | 🔒 Locked'}
            </span>
          </div>
        )}

        {/* Step indicator */}
        <div className="steps animate-in" style={{ marginBottom: 32 }}>
          <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <div className="step-num">{step > 1 ? '✓' : '1'}</div>
            <span>Pre-Trade Check</span>
          </div>
          <div className="step-divider" />
          <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
            <div className="step-num">{step > 2 ? '✓' : '2'}</div>
            <span>Trade Entry</span>
          </div>
          <div className="step-divider" />
          <div className={`step ${step >= 3 ? 'active' : ''}`}>
            <div className="step-num">3</div>
            <span>AI Review</span>
          </div>
        </div>

        {successMsg && <div className="alert alert-success animate-in" style={{ marginBottom: 20 }}>✅ {successMsg}</div>}
        {errorMsg   && <div className="alert alert-danger animate-in"  style={{ marginBottom: 20 }}>❌ {errorMsg}</div>}

        {/* ── STEP 1: Pre-Trade Validation ──────────────────────────── */}
        {step === 1 && (
          <div className="animate-in">
            {!checklistAll && (
              <div className="alert alert-warning" style={{ marginBottom: 20 }}>
                ⚠️ Incomplete checklist will flag this as an <strong>impulse trade</strong> in your behaviour log.
              </div>
            )}

            {/* Validation checklist */}
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✅</span> Pre-Trade Validation
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CheckItem
                  id="setup_conditions_met"
                  label="My setup conditions are fully met"
                  desc="All technical criteria for my planned setup are satisfied"
                />
                <CheckItem
                  id="sl_is_defined"
                  label="My Stop-Loss is clearly defined"
                  desc="I know exactly where I will exit if I'm wrong"
                />
                <CheckItem
                  id="within_max_trades"
                  label="This trade is within my daily limit"
                  desc="I have not exceeded my planned maximum trades"
                />
              </div>
            </div>

            {/* Emotional state before */}
            <div className="card" style={{ marginBottom: 32 }}>
              <h3 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🧘</span> Your State of Mind Right Now
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 20 }}>
                Be honest. This data helps you find patterns between emotions and trade outcomes.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {[
                  ['Confidence', 'confidence'],
                  ['Stress',     'stress'],
                  ['FOMO',       'fomo'],
                  ['Anger',      'anger'],
                  ['Patience',   'patience'],
                ].map(([label, key]) => (
                  <EmotionalSlider key={key} label={label} value={emotionalBefore[key]}
                    onChange={val => setEmoBefore(key, val)} />
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={() => setStep(2)}
            >
              Next: Enter Trade Details →
            </button>
          </div>
        )}

        {/* ── STEP 2: Trade Entry ────────────────────────────────────── */}
        {step === 2 && (
          <div className="animate-in">
            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📈</span> Trade Details
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Symbol</label>
                  <input className="form-input" value={trade.symbol}
                    onChange={e => setField('symbol', e.target.value)}
                    placeholder="NIFTY50, RELIANCE..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Setup Type</label>
                  <select className="form-select" value={trade.setup_type}
                    onChange={e => setField('setup_type', e.target.value)}>
                    <option value="">Select...</option>
                    {SETUP_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Entry Price *</label>
                  <input type="number" step="0.05" className="form-input" value={trade.entry_price}
                    onChange={e => setField('entry_price', e.target.value)}
                    placeholder="e.g. 22350.50" />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity *</label>
                  <input type="number" min="1" className="form-input" value={trade.quantity}
                    onChange={e => setField('quantity', e.target.value)}
                    placeholder="e.g. 50" />
                </div>
                <div className="form-group">
                  <label className="form-label">Stop-Loss</label>
                  <input type="number" step="0.05" className="form-input" value={trade.stop_loss}
                    onChange={e => setField('stop_loss', e.target.value)}
                    placeholder="e.g. 22280.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Target Price</label>
                  <input type="number" step="0.05" className="form-input" value={trade.target_price}
                    onChange={e => setField('target_price', e.target.value)}
                    placeholder="e.g. 22500.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Exit Price (leave blank if open)</label>
                  <input type="number" step="0.05" className="form-input" value={trade.exit_price}
                    onChange={e => setField('exit_price', e.target.value)}
                    placeholder="Leave empty if still in trade" />
                </div>
                <div className="form-group">
                  <label className="form-label">Exit Reason</label>
                  <select className="form-select" value={trade.exit_reason}
                    onChange={e => setField('exit_reason', e.target.value)}>
                    <option value="">Select...</option>
                    {EXIT_REASONS.map(r => (
                      <option key={r} value={r}>
                        {r === 'FEAR' ? '😰 Fear' : r === 'GREED' ? '🤑 Greed' : r.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Estimated P&L preview */}
              {trade.entry_price && trade.exit_price && trade.quantity && (
                <div className="alert alert-info" style={{ marginTop: 16 }}>
                  Estimated P&L: <strong style={{
                    color: (parseFloat(trade.exit_price) - parseFloat(trade.entry_price)) * parseInt(trade.quantity) >= 0
                      ? 'var(--success)' : 'var(--danger)'
                  }}>
                    ₹{((parseFloat(trade.exit_price) - parseFloat(trade.entry_price)) * parseInt(trade.quantity)).toFixed(2)}
                  </strong>
                </div>
              )}

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Notes / Observations</label>
                <textarea className="form-textarea" value={trade.notes}
                  onChange={e => setField('notes', e.target.value)}
                  placeholder="What did you observe? What triggered the entry?" />
              </div>
            </div>

            {/* Emotional state after */}
            <div className="card" style={{ marginBottom: 32 }}>
              <h3 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🧠</span> State of Mind After Trade
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 20 }}>
                Skip if the trade is still open — you can update this later.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {[
                  ['Confidence', 'confidence'],
                  ['Stress',     'stress'],
                  ['FOMO',       'fomo'],
                  ['Anger',      'anger'],
                  ['Patience',   'patience'],
                ].map(([label, key]) => (
                  <EmotionalSlider key={key} label={label} value={emotionalAfter[key]}
                    onChange={val => setEmoAfter(key, val)} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-ghost btn-lg" onClick={() => setStep(1)} style={{ flex: 0.4 }}>
                ← Back
              </button>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={runAIReview}
                disabled={aiLoading || submitting}
              >
                {aiLoading ? (
                  <><div className="spinner" /> AI Coach Reviewing...</>
                ) : (
                  '🤖 Run AI Pre-Trade Review →'
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: AI Pre-Trade Review ───────────────────────────── */}
        {step === 3 && aiReview && (
          <div className="animate-in">
            {/* Risk Badge Card */}
            <div
              className="card"
              style={{
                marginBottom: 24,
                border: `1px solid ${
                  aiReview.risk_level === 'CRITICAL'
                    ? 'rgba(239, 68, 68, 0.5)'
                    : aiReview.risk_level === 'HIGH'
                    ? 'rgba(245, 158, 11, 0.5)'
                    : aiReview.risk_level === 'MEDIUM'
                    ? 'rgba(56, 189, 248, 0.4)'
                    : 'rgba(34, 197, 94, 0.4)'
                }`,
                backgroundColor:
                  aiReview.risk_level === 'CRITICAL'
                    ? 'rgba(239, 68, 68, 0.08)'
                    : aiReview.risk_level === 'HIGH'
                    ? 'rgba(245, 158, 11, 0.08)'
                    : 'rgba(15, 23, 42, 0.7)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background:
                        aiReview.risk_level === 'CRITICAL'
                          ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                          : aiReview.risk_level === 'HIGH'
                          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                          : 'linear-gradient(135deg, #0284c7, #10b981)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)',
                    }}
                  >
                    🤖
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>TradeMind Coach Assessment</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Pre-Trade Discipline & Risk Verification
                    </div>
                  </div>
                </div>

                {/* Risk Level Chip */}
                <div
                  style={{
                    padding: '6px 14px',
                    borderRadius: 9999,
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    letterSpacing: '0.5px',
                    backgroundColor:
                      aiReview.risk_level === 'CRITICAL'
                        ? 'rgba(239, 68, 68, 0.25)'
                        : aiReview.risk_level === 'HIGH'
                        ? 'rgba(245, 158, 11, 0.25)'
                        : aiReview.risk_level === 'MEDIUM'
                        ? 'rgba(56, 189, 248, 0.2)'
                        : 'rgba(34, 197, 94, 0.2)',
                    color:
                      aiReview.risk_level === 'CRITICAL'
                        ? '#ef4444'
                        : aiReview.risk_level === 'HIGH'
                        ? '#f59e0b'
                        : aiReview.risk_level === 'MEDIUM'
                        ? '#38bdf8'
                        : '#22c55e',
                    border: `1px solid ${
                      aiReview.risk_level === 'CRITICAL'
                        ? '#ef4444'
                        : aiReview.risk_level === 'HIGH'
                        ? '#f59e0b'
                        : '#22c55e'
                    }`,
                  }}
                >
                  {aiReview.risk_level} RISK
                </div>
              </div>

              {/* Coaching Message */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: 12,
                  backgroundColor: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: 16,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Coach Guidance
                  </span>
                  <button
                    onClick={() => voiceAlert.speak(aiReview.voice_message || aiReview.coaching_message, aiReview.urgency, localStorage.getItem('tm_bot_lang') || 'en')}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    🔊 Hear Voice Alert
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.5', color: '#f8fafc' }}>
                  "{aiReview.coaching_message}"
                </p>
              </div>

              {/* Violations List (if any) */}
              {aiReview.violations?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>
                    Rule Violations:
                  </div>
                  {aiReview.violations.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        fontSize: '0.84rem',
                        marginBottom: 6,
                      }}
                    >
                      {v}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings List (if any) */}
              {aiReview.warnings?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>
                    Cautionary Flags:
                  </div>
                  {aiReview.warnings.map((w, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        backgroundColor: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        color: '#fde68a',
                        fontSize: '0.82rem',
                        marginBottom: 6,
                      }}
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Trader Today Summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Trades Today</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                    {aiReview.trade_count_today} / {aiReview.max_trades}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Consecutive Losses</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: aiReview.consecutive_losses >= 2 ? '#ef4444' : '#f8fafc' }}>
                    {aiReview.consecutive_losses}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Today P&L</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: aiReview.pnl_today >= 0 ? '#10b981' : '#ef4444' }}>
                    ₹{aiReview.pnl_today?.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* If Blocked: Override option or cancel */}
            {aiReview.should_block && (
              <div
                className="card"
                style={{
                  marginBottom: 24,
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: '20px' }}>🛑</span>
                  <div style={{ fontWeight: 700, color: '#ef4444' }}>Trade Blocked by Discipline Rules</div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                  The TradeMind Coach strongly advises walking away from the market. If you must proceed, you must consciously acknowledge that this is a rule breach.
                </p>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    color: '#fca5a5',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={overrideBlock}
                    onChange={(e) => setOverrideBlock(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  I consciously acknowledge I am violating my trading plan and accept this penalty.
                </label>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-ghost btn-lg"
                onClick={() => setStep(2)}
                style={{ flex: 0.4 }}
              >
                ← Back & Edit
              </button>
              <button
                className="btn btn-primary btn-lg"
                style={{
                  flex: 1,
                  background:
                    aiReview.should_block && !overrideBlock
                      ? 'rgba(255, 255, 255, 0.1)'
                      : aiReview.risk_level === 'CRITICAL'
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : undefined,
                  cursor: aiReview.should_block && !overrideBlock ? 'not-allowed' : 'pointer',
                }}
                onClick={doSubmit}
                disabled={submitting || (aiReview.should_block && !overrideBlock)}
              >
                {submitting ? (
                  <><div className="spinner" /> Logging Trade...</>
                ) : aiReview.should_block ? (
                  overrideBlock ? '⚠️ Force Log Rule-Breach Trade' : '🛑 Blocked (Rule Limit)'
                ) : (
                  '⚡ Execute & Log Trade'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
