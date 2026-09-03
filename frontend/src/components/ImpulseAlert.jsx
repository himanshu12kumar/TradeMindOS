import { useState } from 'react';

export default function ImpulseAlert({ type, message, onConfirm, onDismiss }) {
  const [confirmed, setConfirmed] = useState(false);

  const isBlocked = type === 'blocked';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(7,12,24,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      animation: 'fadeInUp 0.3s ease',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isBlocked ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.4)'}`,
        borderRadius: 'var(--radius-xl)',
        padding: '40px 36px',
        maxWidth: '480px',
        width: '100%',
        boxShadow: isBlocked
          ? '0 0 40px rgba(239,68,68,0.2)'
          : '0 0 40px rgba(245,158,11,0.15)',
        animation: 'pulse-glow 2s infinite',
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64,
          borderRadius: '50%',
          background: isBlocked ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem',
          margin: '0 auto 24px',
        }}>
          {isBlocked ? '🛑' : '⚠️'}
        </div>

        {/* Title */}
        <h2 style={{
          textAlign: 'center',
          color: isBlocked ? 'var(--danger)' : 'var(--accent-gold)',
          marginBottom: '16px',
          fontSize: '1.35rem',
        }}>
          {isBlocked ? 'Trade Blocked' : 'Impulse Alert'}
        </h2>

        {/* Message */}
        <p style={{
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: 1.7,
          marginBottom: '28px',
          fontSize: '0.95rem',
        }}>
          {message}
        </p>

        {/* Warning confirmation (only for non-blocked) */}
        {!isBlocked && (
          <label className="checkbox-item" style={{ marginBottom: '24px' }}
            onClick={() => setConfirmed(!confirmed)}>
            <div className={`checkbox-box ${confirmed ? 'checked' : ''}`} style={{
              background: confirmed ? 'var(--success)' : 'var(--bg-elevated)',
              borderColor: confirmed ? 'var(--success)' : 'var(--border)',
            }}>
              {confirmed && <span style={{ color: '#fff', fontSize: '0.7rem' }}>✓</span>}
            </div>
            <span className="checkbox-text">
              I acknowledge this warning and take full responsibility
            </span>
          </label>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn btn-ghost btn-full"
            onClick={onDismiss}
          >
            {isBlocked ? 'Go Back' : 'Cancel Trade'}
          </button>
          {!isBlocked && (
            <button
              className="btn btn-danger btn-full"
              disabled={!confirmed}
              onClick={onConfirm}
            >
              Proceed Anyway
            </button>
          )}
        </div>

        {isBlocked && (
          <p style={{
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            marginTop: '16px',
          }}>
            Your discipline is your edge. Protect it. 🧘
          </p>
        )}
      </div>
    </div>
  );
}
