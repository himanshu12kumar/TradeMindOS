import React, { useState, useEffect } from 'react';
import { terminalAPI } from '../api/client';

export default function BrokerSettingsModal({ isOpen, onClose, onConfigUpdated }) {
  const [config, setConfig] = useState({
    broker_name: 'ZERODHA',
    api_key: '',
    api_secret: '',
    trading_mode: 'PAPER',
    paper_balance: 100000,
    api_secret_masked: '',
    has_access_token: false,
    kite_login_url: '',
  });
  const [requestToken, setRequestToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      setMsg({ text: '', type: '' });
      setRequestToken('');
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    try {
      setIsLoading(true);
      const res = await terminalAPI.getBrokerConfig();
      setConfig((prev) => ({
        ...prev,
        ...res.data,
        api_key: res.data.api_key || '',
        api_secret: '', // never expose full secret
      }));
    } catch (err) {
      setMsg({ text: 'Failed to load broker configuration', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setMsg({ text: '', type: '' });
      const payload = {
        broker_name: 'ZERODHA',
        api_key: config.api_key || null,
        trading_mode: config.trading_mode,
        paper_balance: Number(config.paper_balance) || 100000,
      };
      if (config.api_secret) {
        payload.api_secret = config.api_secret;
      }
      const res = await terminalAPI.updateBrokerConfig(payload);
      setConfig((prev) => ({
        ...prev,
        ...res.data,
        api_key: res.data.api_key || '',
        api_secret: '',
      }));
      setMsg({ text: 'Settings saved successfully!', type: 'success' });
      if (onConfigUpdated) onConfigUpdated(res.data);
    } catch (err) {
      setMsg({ text: err.response?.data?.detail || 'Failed to save settings', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExchangeToken = async () => {
    if (!requestToken.trim()) {
      setMsg({ text: 'Please enter the request_token from Zerodha login redirect', type: 'error' });
      return;
    }
    try {
      setIsLoading(true);
      setMsg({ text: '', type: '' });
      const res = await terminalAPI.exchangeKiteToken(requestToken.trim());
      setMsg({ text: res.data?.message || 'Zerodha Kite connected successfully!', type: 'success' });
      setRequestToken('');
      fetchConfig();
      if (onConfigUpdated) onConfigUpdated();
    } catch (err) {
      setMsg({ text: err.response?.data?.detail || 'Token exchange failed', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const isReal = config.trading_mode === 'REAL';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(3, 7, 18, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          background: '#0d1424',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(59, 130, 246, 0.15)',
          color: '#f1f5f9',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                Broker & Execution Settings
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                Configure Paper Trading simulation or live Zerodha Kite Connect v3
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Feedback Alert */}
        {msg.text && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              background: msg.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              border: `1px solid ${msg.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
              color: msg.type === 'error' ? '#fca5a5' : '#86efac',
            }}
          >
            {msg.text}
          </div>
        )}

        <div style={{ padding: '20px 24px', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Mode Selector Tabs */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
              Execution Mode
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '4px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <button
                type="button"
                onClick={() => setConfig({ ...config, trading_mode: 'PAPER' })}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: !isReal ? '#3b82f6' : 'transparent',
                  color: !isReal ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <span>📝</span> Paper Trading (Simulated)
              </button>
              <button
                type="button"
                onClick={() => setConfig({ ...config, trading_mode: 'REAL' })}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: isReal ? '#10b981' : 'transparent',
                  color: isReal ? '#ffffff' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <span>⚡</span> Zerodha Kite (Real)
              </button>
            </div>
          </div>

          {/* Mode Details */}
          {!isReal ? (
            /* Paper Mode Settings */
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px' }}>
                <span>🛡️</span> Zero-Risk Simulation Active
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 14px', lineHeight: 1.4 }}>
                Orders are executed instantaneously with realistic market slippage against live Indian stock & index ticks.
                All trades auto-sync into TradeMind OS.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  Starting Virtual Capital (₹)
                </label>
                <input
                  type="number"
                  value={config.paper_balance}
                  onChange={(e) => setConfig({ ...config, paper_balance: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#070c18',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          ) : (
            /* Zerodha Kite Live Mode Settings */
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, fontSize: '0.9rem' }}>
                  <span>🟢</span> Zerodha Kite Connect v3
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '99px',
                    background: config.has_access_token ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: config.has_access_token ? '#34d399' : '#fca5a5',
                    border: `1px solid ${config.has_access_token ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  }}
                >
                  {config.has_access_token ? 'ACTIVE SESSION' : 'NOT AUTHENTICATED'}
                </span>
              </div>

              {/* API Key */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '5px' }}>
                  Kite API Key
                </label>
                <input
                  type="text"
                  placeholder="e.g. abcd1234efgh5678"
                  value={config.api_key}
                  onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#070c18',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* API Secret */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                    Kite API Secret {config.api_secret_masked && <span style={{ color: '#94a3b8' }}>(Saved: {config.api_secret_masked})</span>}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showSecret ? 'text' : 'password'}
                  placeholder={config.api_secret_masked ? 'Leave blank to keep existing secret' : 'Paste your API Secret'}
                  value={config.api_secret}
                  onChange={(e) => setConfig({ ...config, api_secret: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#070c18',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* OAuth Login & Token Exchange Step */}
              {config.api_key && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '14px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    borderRadius: '10px',
                    border: '1px dashed rgba(59, 130, 246, 0.3)',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#93c5fd', marginBottom: '8px' }}>
                    Daily Authentication Step (Zerodha Kite)
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: '0 0 10px' }}>
                    1. Click below to login to Zerodha. You will be redirected with a <code>request_token</code> in the URL.
                  </p>
                  <a
                    href={config.kite_login_url || `https://kite.zerodha.com/connect/login?v=3&api_key=${config.api_key}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#2563eb',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '7px 14px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      marginBottom: '14px',
                    }}
                  >
                    <span>🔑</span> 1. Open Zerodha Kite Login
                  </a>

                  <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: '0 0 6px' }}>
                    2. Copy the <code>request_token</code> parameter from the URL and paste here:
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Paste request_token here"
                      value={requestToken}
                      onChange={(e) => setRequestToken(e.target.value)}
                      style={{
                        flex: 1,
                        background: '#070c18',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        color: '#f8fafc',
                        fontSize: '0.82rem',
                      }}
                    />
                    <button
                      type="button"
                      disabled={isLoading || !requestToken}
                      onClick={handleExchangeToken}
                      style={{
                        background: '#10b981',
                        border: 'none',
                        color: '#ffffff',
                        padding: '7px 14px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: isLoading || !requestToken ? 'not-allowed' : 'pointer',
                        opacity: isLoading || !requestToken ? 0.6 : 1,
                      }}
                    >
                      Authorize Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSaveConfig}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
              }}
            >
              {isLoading ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
