import { useState, useEffect } from 'react';
import { planAPI } from '../api/client';

const CHECKLIST = [
  { key: 'slept_well',             label: 'I slept at least 6 hours last night' },
  { key: 'know_max_risk',          label: 'I know my maximum loss limit for today' },
  { key: 'reviewed_key_levels',    label: 'I have identified key support & resistance levels' },
  { key: 'no_emotional_baggage',   label: 'I am not carrying emotions from yesterday' },
  { key: 'checked_economic_calendar', label: 'I checked today\'s economic calendar / news' },
  { key: 'reviewed_yesterday_trades', label: 'I reviewed and learned from yesterday\'s trades' },
];

const BIAS_OPTIONS = ['BULLISH', 'BEARISH', 'NEUTRAL'];
const SETUP_OPTIONS = ['Breakout', 'Retest / Pullback', 'Reversal', 'Range Bound', 'Momentum', 'Gap Fill', 'Other'];

function CheckboxItem({ id, label, checked, onChange, disabled }) {
  return (
    <label
      htmlFor={id}
      className={`checkbox-item ${checked ? 'checked' : ''}`}
      style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div className="checkbox-box" style={{
        background: checked ? 'var(--success)' : 'var(--bg-elevated)',
        borderColor: checked ? 'var(--success)' : 'var(--border)',
      }}>
        {checked && <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>✓</span>}
      </div>
      <span className="checkbox-text">{label}</span>
    </label>
  );
}

export default function DailyPlan() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [lockViolation, setLockViolation] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    market: 'NIFTY50',
    bias: 'BULLISH',
    key_levels: '',
    planned_setup: '',
    notes: '',
    max_trades: 3,
    max_loss_amount: 1000,
    slept_well: false,
    know_max_risk: false,
    reviewed_key_levels: false,
    no_emotional_baggage: false,
    checked_economic_calendar: false,
    reviewed_yesterday_trades: false,
  });

  useEffect(() => {
    planAPI.getToday()
      .then(res => {
        if (res.data) {
          setPlan(res.data);
          setForm({ ...res.data });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const showMsg = (msg, isError = false) => {
    if (isError) setErrorMsg(msg); else setSuccessMsg(msg);
    setTimeout(() => { setSuccessMsg(''); setErrorMsg(''); }, 4000);
  };

  const handleField = (key, val) => {
    if (plan?.is_locked) {
      setLockViolation(true);
      return;
    }
    setForm(f => ({ ...f, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let res;
      if (plan) {
        res = await planAPI.update(plan.id, form);
      } else {
        res = await planAPI.create(form);
      }
      setPlan(res.data);
      setForm(res.data);
      showMsg(plan ? '✅ Plan updated!' : '✅ Plan created!');
    } catch (err) {
      showMsg(err.response?.data?.detail || 'Error saving plan', true);
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    if (!plan) return;
    setLocking(true);
    try {
      const res = await planAPI.lock(plan.id);
      setPlan(res.data);
      showMsg('🔒 Plan locked! Stay disciplined.');
    } catch (err) {
      showMsg(err.response?.data?.detail || 'Could not lock plan', true);
    } finally {
      setLocking(false);
    }
  };

  const checklistDone = CHECKLIST.filter(c => form[c.key]).length;
  const isLocked = plan?.is_locked;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12 }}>
      <div className="spinner" /> <span style={{ color: 'var(--text-muted)' }}>Loading plan...</span>
    </div>
  );

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: 760 }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }} className="animate-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1>Daily Trading Plan</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '0.9rem' }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            {isLocked && (
              <div className="locked-banner">
                <span style={{ fontSize: '1.4rem' }}>🔒</span>
                <div>
                  <div style={{ fontWeight: 700 }}>Plan Locked</div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.8 }}>
                    Locked at {new Date(plan.locked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lock Violation Warning */}
        {lockViolation && (
          <div className="alert alert-danger animate-in" style={{ marginBottom: 20 }}>
            <span>🛑</span>
            <div>
              <strong>Plan is locked!</strong> Modifying a locked plan will be logged as a <em>plan violation</em> in your behaviour log.
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button className="btn btn-sm btn-danger" onClick={() => { setLockViolation(false); setPlan(p => ({ ...p, is_locked: false })); }}>
                  Modify Anyway (log violation)
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setLockViolation(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {successMsg && <div className="alert alert-success animate-in" style={{ marginBottom: 20 }}>✅ {successMsg}</div>}
        {errorMsg   && <div className="alert alert-danger animate-in"  style={{ marginBottom: 20 }}>❌ {errorMsg}</div>}

        {/* Pre-Market Checklist */}
        <div className="card animate-in" style={{ marginBottom: 24, animationDelay: '0.05s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>☀️</span> Pre-Market Checklist
            </h3>
            <span className={`badge ${checklistDone === 6 ? 'badge-green' : checklistDone > 3 ? 'badge-gold' : 'badge-gray'}`}>
              {checklistDone} / 6 complete
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CHECKLIST.map(item => (
              <CheckboxItem
                key={item.key}
                id={item.key}
                label={item.label}
                checked={!!form[item.key]}
                onChange={(val) => handleField(item.key, val)}
                disabled={isLocked}
              />
            ))}
          </div>
        </div>

        {/* Market Context */}
        <div className="card animate-in" style={{ marginBottom: 24, animationDelay: '0.1s' }}>
          <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🎯</span> Market Context
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Market / Instrument</label>
              <input
                className="form-input"
                value={form.market}
                onChange={e => handleField('market', e.target.value)}
                placeholder="NIFTY50, BANKNIFTY, RELIANCE..."
                disabled={isLocked}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Bias</label>
              <select className="form-select" value={form.bias} onChange={e => handleField('bias', e.target.value)} disabled={isLocked}>
                {BIAS_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Key Levels (Support / Resistance)</label>
            <textarea
              className="form-textarea"
              value={form.key_levels || ''}
              onChange={e => handleField('key_levels', e.target.value)}
              placeholder="e.g. Support: 22200, 22000 | Resistance: 22500, 22750"
              disabled={isLocked}
            />
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Planned Trade Setup</label>
            <select className="form-select" value={form.planned_setup || ''} onChange={e => handleField('planned_setup', e.target.value)} disabled={isLocked}>
              <option value="">Select a setup...</option>
              {SETUP_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Risk Parameters */}
        <div className="card animate-in" style={{ marginBottom: 24, animationDelay: '0.15s' }}>
          <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛡️</span> Risk Parameters
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Max Trades Today</label>
              <input
                type="number" min="1" max="20"
                className="form-input"
                value={form.max_trades}
                onChange={e => handleField('max_trades', parseInt(e.target.value))}
                disabled={isLocked}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Max Loss (₹)</label>
              <input
                type="number" min="0" step="100"
                className="form-input"
                value={form.max_loss_amount}
                onChange={e => handleField('max_loss_amount', parseFloat(e.target.value))}
                disabled={isLocked}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card animate-in" style={{ marginBottom: 32, animationDelay: '0.2s' }}>
          <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📝</span> Notes
          </h3>
          <textarea
            className="form-textarea"
            style={{ minHeight: 80 }}
            value={form.notes || ''}
            onChange={e => handleField('notes', e.target.value)}
            placeholder="Market observations, reminders, anything on your mind..."
            disabled={isLocked}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }} className="animate-in">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSave}
            disabled={saving || isLocked}
            style={{ flex: 1, minWidth: 160 }}
          >
            {saving ? <><div className="spinner" /> Saving...</> : plan ? '💾 Update Plan' : '✨ Create Plan'}
          </button>

          {plan && !isLocked && (
            <button
              className="btn btn-gold btn-lg"
              onClick={handleLock}
              disabled={locking}
              style={{ flex: 1, minWidth: 160 }}
            >
              {locking ? <><div className="spinner" /> Locking...</> : '🔒 Lock Plan'}
            </button>
          )}
        </div>

        {!isLocked && plan && (
          <p style={{ marginTop: 16, fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            💡 Lock your plan to commit to your intent. Modifications after locking will be flagged.
          </p>
        )}
      </div>
    </div>
  );
}
