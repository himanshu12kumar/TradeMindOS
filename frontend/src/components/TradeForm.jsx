import { useState, useEffect } from 'react';
import { tradeAPI, planAPI } from '../api/client';
import ImpulseAlert from './ImpulseAlert';

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
  const [step, setStep] = useState(1); // 1 = Pre-Trade Checklist, 2 = Trade Entry
  const [plan, setPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = () => {
    // Basic validation
    if (!trade.entry_price || !trade.quantity) {
      showError('Entry price and quantity are required');
      return;
    }
    doSubmit();
  };

  const resetForm = () => {
    setStep(1);
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
          <div className={`step ${step >= 2 ? 'active' : ''}`}>
            <div className="step-num">2</div>
            <span>Trade Entry</span>
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
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <><div className="spinner" /> Logging...</>
                  : !checklistAll
                    ? '⚡ Log Trade (Flagged)'
                    : '⚡ Log Trade'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
