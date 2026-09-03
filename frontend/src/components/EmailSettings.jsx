import { useState, useEffect } from 'react';
import { settingsAPI } from '../api/client';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i;
  const label = `${h.toString().padStart(2, '0')}:00 (${h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`})`;
  return { value: h, label };
});

export default function EmailSettings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');

  useEffect(() => {
    settingsAPI.getEmail().then(res => setSettings(res.data)).catch(() => {});
  }, []);

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  };

  const handleToggle = async (enabled) => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await settingsAPI.updateEmail({ ...settings, email_digest_enabled: enabled });
      setSettings(res.data);
      showMsg(enabled ? '✅ Email digest enabled!' : '✅ Digest disabled.');
    } catch (e) { showMsg(e.response?.data?.detail || 'Error saving', 'error'); }
    setSaving(false);
  };

  const handleHourChange = async (hour) => {
    if (!settings) return;
    const updated = { ...settings, digest_send_hour: parseInt(hour) };
    setSettings(updated);
    try {
      const res = await settingsAPI.updateEmail(updated);
      setSettings(res.data);
    } catch (e) { console.error(e); }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      const res = await settingsAPI.testEmail();
      showMsg(res.data.message || '✅ Test email sent!');
    } catch (e) { showMsg(e.response?.data?.detail || 'Failed to send. Check SMTP config in .env', 'error'); }
    setTesting(false);
  };

  if (!settings) return (
    <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {msg && (
        <div className={`alert ${msgType === 'error' ? 'alert-danger' : 'alert-success'}`}>
          {msg}
        </div>
      )}

      {/* Toggle */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📧 Daily Digest Email</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Receive your discipline score + weekly summary every evening<br />
            Delivered to: <strong style={{ color: 'var(--text-secondary)' }}>{settings.email}</strong>
          </div>
        </div>
        {/* Toggle switch */}
        <label style={{ position: 'relative', display: 'inline-block', width: 52, height: 28, cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={settings.email_digest_enabled}
            onChange={e => handleToggle(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} disabled={saving} />
          <span style={{
            position: 'absolute', inset: 0,
            background: settings.email_digest_enabled ? 'var(--accent-blue)' : 'var(--border)',
            borderRadius: 99,
            transition: 'background 0.2s',
          }}>
            <span style={{
              position: 'absolute', top: 3, left: settings.email_digest_enabled ? 27 : 3,
              width: 22, height: 22, borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </span>
        </label>
      </div>

      {/* Send Time */}
      {settings.email_digest_enabled && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⏰ Send Time</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            What time should we send your daily recap?
          </p>
          <select className="form-select" value={settings.digest_send_hour}
            onChange={e => handleHourChange(e.target.value)} style={{ maxWidth: 260 }}>
            {HOUR_OPTIONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>
            📌 Default is 9:00 PM IST — after market close.
          </p>
        </div>
      )}

      {/* SMTP Status */}
      <div className="card" style={{ padding: '20px 24px', background: 'rgba(59,130,246,0.04)' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🔧 SMTP Configuration</div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          To send emails, add your Gmail credentials to <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: '0.78rem' }}>/backend/.env</code>:
        </p>
        <pre style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '14px 16px',
          fontSize: '0.8rem', color: '#93c5fd', lineHeight: 1.7,
          overflowX: 'auto', margin: '0 0 16px',
        }}>{`SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
FROM_EMAIL=your.email@gmail.com`}</pre>
        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '0.82rem', color: 'var(--accent-blue)' }}>
          → Get a Gmail App Password ↗
        </a>

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={handleTestEmail} disabled={testing}>
            {testing ? <><div className="spinner" /> Sending...</> : '📤 Send Test Email'}
          </button>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
            Sends today's digest to {settings.email} immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
