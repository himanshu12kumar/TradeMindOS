import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { scoreAPI, planAPI, tradeAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── Score Ring Component ────────────────────────────────────────────────────
function ScoreRing({ score, grade }) {
  const radius = 80;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';

  return (
    <div className="score-ring-wrap">
      <div style={{ position: 'relative', width: 200, height: 200 }}>
        <svg width={200} height={200} className="score-ring-svg" style={{ transform: 'rotate(-90deg)' }}>
          <circle className="score-ring-track" cx={100} cy={100} r={radius} strokeWidth={stroke} />
          <circle
            className="score-ring-progress"
            cx={100} cy={100} r={radius}
            strokeWidth={stroke}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="score-value" style={{ color }}>{score}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ 100</span>
        </div>
      </div>
      <span className="score-grade" style={{ color }}>{grade}</span>
    </div>
  );
}

// ─── Score Breakdown Bar ─────────────────────────────────────────────────────
function BreakdownBar({ label, value, max, color }) {
  const pct = Math.max(0, (Math.abs(value) / Math.abs(max)) * 100);
  const isNeg = value < 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isNeg ? 'var(--danger)' : 'var(--success)' }}>
          {isNeg ? '' : '+'}{value}
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 1s ease' }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [scoreData, setScoreData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      scoreAPI.daily().catch(() => null),
      planAPI.getToday().catch(() => null),
      tradeAPI.list().catch(() => null),
    ]).then(([score, planRes, tradesRes]) => {
      if (score) setScoreData(score.data);
      if (planRes) setPlan(planRes.data);
      if (tradesRes) setTrades(tradesRes.data?.slice(0, 5) || []);
      setLoading(false);
    });
  }, []);

  const todayTrades = trades.filter(t => {
    const d = new Date(t.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  const todayPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const impulseCount = todayTrades.filter(t => t.is_impulse_trade).length;

  const breakdownLabels = {
    pre_market_checklist: { label: 'Pre-Market Checklist', max: 15, color: '#10b981' },
    risk_limit_respected: { label: 'Risk Limit Respected', max: 20, color: '#3b82f6' },
    plan_setup_followed:  { label: 'Plan Setup Followed',  max: 25, color: '#6366f1' },
    stop_loss_respected:  { label: 'Stop-Loss Respected',  max: 20, color: '#f59e0b' },
    journal_completed:    { label: 'Journal Completed',    max: 10, color: '#06b6d4' },
    impulse_trade_penalty:{ label: 'Impulse Penalty',      max: -30, color: '#ef4444' },
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
      <div className="spinner" /> <span style={{ color: 'var(--text-muted)' }}>Loading your dashboard...</span>
    </div>
  );

  return (
    <div className="page-wrapper">
      <div className="container">
        {/* Header */}
        <div style={{ marginBottom: 36 }} className="animate-in">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 4 }}>
            {greeting()}, <strong style={{ color: 'var(--accent-blue)' }}>{user?.username}</strong> 👋
          </p>
          <h1>Trader Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: '0.95rem' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Main Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

          {/* Score Ring */}
          <div className="card animate-in" style={{ textAlign: 'center', animationDelay: '0.05s' }}>
            <p className="section-title" style={{ textAlign: 'center', marginBottom: 20 }}>Today's Discipline Score</p>
            {scoreData ? (
              <ScoreRing score={scoreData.total_score} grade={scoreData.grade} />
            ) : (
              <div style={{ color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.9rem' }}>
                No score yet.<br />Complete your plan & trades.
              </div>
            )}
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="animate-in">
              <div className="stat-card">
                <div className="stat-label">Trades Today</div>
                <div className="stat-value">{todayTrades.length}</div>
                <div className="stat-sub">{plan ? `of ${plan.max_trades} planned` : 'No plan yet'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Today's P&L</div>
                <div className={`stat-value ${todayPnL >= 0 ? 'stat-positive' : 'stat-negative'}`}>
                  {todayPnL >= 0 ? '▲' : '▼'} ₹{Math.abs(todayPnL).toFixed(0)}
                </div>
                <div className="stat-sub">{todayPnL >= 0 ? 'Profitable' : 'In loss'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Impulse Trades</div>
                <div className={`stat-value ${impulseCount > 0 ? 'stat-negative' : 'stat-positive'}`}>{impulseCount}</div>
                <div className="stat-sub">{impulseCount === 0 ? 'Clean session 🧘' : 'Review these'}</div>
              </div>
            </div>

            {/* Plan Status */}
            <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p className="section-title" style={{ marginBottom: 0 }}>Today's Plan</p>
                {plan?.is_locked && <span className="badge badge-gold">🔒 Locked</span>}
              </div>
              {plan ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { k: 'Market', v: plan.market },
                    { k: 'Bias', v: plan.bias },
                    { k: 'Setup', v: plan.planned_setup || '—' },
                    { k: 'Max Trades', v: plan.max_trades },
                    { k: 'Max Loss', v: `₹${plan.max_loss_amount}` },
                    { k: 'Checklist', v: [plan.slept_well, plan.know_max_risk, plan.reviewed_key_levels, plan.no_emotional_baggage, plan.checked_economic_calendar, plan.reviewed_yesterday_trades].filter(Boolean).length + ' / 6 done' },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{String(v)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
                    You haven't created today's plan yet. Start here.
                  </p>
                  <Link to="/plan" className="btn btn-primary">Create Today's Plan →</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        {scoreData && scoreData.breakdown && (
          <div className="card animate-in" style={{ marginTop: 24, animationDelay: '0.15s' }}>
            <p className="section-title">Score Breakdown</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {Object.entries(scoreData.breakdown).map(([key, val]) => {
                const meta = breakdownLabels[key];
                if (!meta) return null;
                return (
                  <BreakdownBar
                    key={key}
                    label={meta.label}
                    value={val}
                    max={meta.max}
                    color={meta.color}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="animate-in" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, animationDelay: '0.2s' }}>
          {[
            { to: '/plan',   label: 'Update Plan',    icon: '📋', desc: 'Review & lock your plan',   cls: 'btn-ghost'   },
            { to: '/trade',  label: 'Log a Trade',    icon: '⚡', desc: 'Pre-validate your entry',   cls: 'btn-primary' },
            { to: '/review', label: 'Weekly Review',  icon: '🏆', desc: 'Analyze your week',         cls: 'btn-ghost'   },
          ].map(({ to, label, icon, desc, cls }) => (
            <Link key={to} to={to} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>{icon}</div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
