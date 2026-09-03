import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match'); return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters'); return;
    }
    setLoading(true); setError('');
    const result = await register({ username: form.username, email: form.email, password: form.password });
    if (result.success) {
      // Auto-login after register
      await login(form.username, form.password);
      navigate('/');
    } else {
      setError(typeof result.error === 'string' ? result.error : 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }} className="animate-in">

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 60, height: 60,
            background: 'linear-gradient(135deg, var(--accent-blue), #6366f1)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.8rem',
            margin: '0 auto 14px',
            boxShadow: 'var(--shadow-glow-blue)',
          }}>🧠</div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: 4 }}>Start Your Journey</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Build discipline, track behavior, become a better trader
          </p>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 24, fontSize: '1.2rem' }}>Create your account</h2>

          {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>❌ {error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                id="reg-username"
                className="form-input"
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="your_username"
                required minLength={3}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                id="reg-email"
                className="form-input"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                id="reg-password"
                className="form-input"
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 6 characters"
                required minLength={6}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                id="reg-confirm-password"
                className="form-input"
                type="password"
                value={form.confirmPassword}
                onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Repeat your password"
                required
              />
            </div>

            <button
              id="reg-submit"
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? <><div className="spinner" /> Creating account...</> : 'Create Account →'}
            </button>
          </form>

          <div className="divider" />
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
