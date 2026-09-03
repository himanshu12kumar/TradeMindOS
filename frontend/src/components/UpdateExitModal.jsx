import { useState } from 'react';
import { historyAPI } from '../api/client';

const EXIT_REASONS = [
  { value: 'TARGET',    label: '🎯 Target Hit'   },
  { value: 'STOP_LOSS', label: '✂️ Stop Loss'    },
  { value: 'FEAR',      label: '😰 Fear (emotional)' },
  { value: 'GREED',     label: '🤑 Greed (emotional)' },
  { value: 'MANUAL',    label: '🖐️ Manual Exit'  },
];

export default function UpdateExitModal({ trade, onSaved, onClose }) {
  const [exitPrice, setExitPrice] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const estimatedPnL = exitPrice && trade
    ? ((parseFloat(exitPrice) - trade.entry_price) * trade.quantity)
    : null;

  const handleSave = async () => {
    if (!exitPrice || !exitReason) { setError('Exit price and reason are required'); return; }
    setSaving(true);
    try {
      await historyAPI.updateExit(trade.id, parseFloat(exitPrice), exitReason);
      onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Error saving exit');
    } finally { setSaving(false); }
  };

  const isEmotional = exitReason === 'FEAR' || exitReason === 'GREED';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(7,12,24,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      animation: 'fadeInUp 0.25s ease',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-xl)',
        padding: '36px 32px',
        maxWidth: 440, width: '100%',
        boxShadow: 'var(--shadow-glow-blue)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔒</span> Close Trade
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {trade.symbol || 'Trade'} · Entry: ₹{trade.entry_price} · Qty: {trade.quantity}
          </p>
        </div>

        {error && <div className="alert alert-danger" style={{ marginBottom: 16, fontSize: '0.85rem' }}>❌ {error}</div>}

        {/* Exit Price */}
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Exit Price</label>
          <input
            type="number" step="0.05" className="form-input"
            value={exitPrice} onChange={e => setExitPrice(e.target.value)}
            placeholder="e.g. 22400.50" autoFocus
          />
        </div>

        {/* P&L Preview */}
        {estimatedPnL !== null && (
          <div className="alert" style={{
            marginBottom: 16, fontSize: '0.9rem',
            ...(estimatedPnL >= 0
              ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }
              : { background: 'rgba(239,68,68,0.1)',  border: '1px solid rgba(239,68,68,0.3)',  color: '#fca5a5' }),
          }}>
            {estimatedPnL >= 0 ? '▲' : '▼'} P&L: <strong>₹{estimatedPnL.toFixed(2)}</strong>
            {estimatedPnL >= 0 ? ' — Profit! 🎉' : ' — Loss'}
          </div>
        )}

        {/* Exit Reason */}
        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label">Exit Reason</label>
          <select className="form-select" value={exitReason} onChange={e => setExitReason(e.target.value)}>
            <option value="">Select reason...</option>
            {EXIT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Emotional exit warning */}
        {isEmotional && (
          <div className="alert alert-warning" style={{ marginBottom: 20, fontSize: '0.85rem' }}>
            ⚠️ This exit will be logged as a <strong>rule break</strong> in your behaviour log.
            Emotional exits erode your edge over time.
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost btn-full" onClick={onClose}>Cancel</button>
          <button
            className={`btn btn-full ${isEmotional ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleSave} disabled={saving}
          >
            {saving ? <><div className="spinner" /> Saving...</> : 'Save Exit'}
          </button>
        </div>
      </div>
    </div>
  );
}
