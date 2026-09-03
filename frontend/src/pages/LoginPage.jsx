import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    const result = await login(form.username, form.password);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }} className="animate-in">

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64,
            background: 'linear-gradient(135deg, var(--accent-blue), #6366f1)',
            borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
            margin: '0 auto 16px',
            boxShadow: 'var(--shadow-glow-blue)',
          }}>🧠</div>
          <h1 style={{ fontSize: '2rem', marginBottom: 6 }}>TradeMind OS</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Your behavioral trading system
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 6, fontSize: '1.3rem' }}>Welcome back</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 28 }}>
            Sign in to review your discipline data
          </p>

          {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>❌ {error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                id="login-username"
                className="form-input"
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="your_username"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                id="login-password"
                className="form-input"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? <><div className="spinner" /> Signing in...</> : 'Sign In →'}
            </button>
          </form>

          <div className="divider" />
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
              Create one
            </Link>
          </p>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          "Discipline is the bridge between goals and accomplishment."
        </p>
      </div>
    </div>
  );
}
