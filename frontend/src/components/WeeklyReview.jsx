import { useEffect, useState } from 'react';
import { scoreAPI } from '../api/client';

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '1.3rem' }}>{icon}</span>
        <span className="stat-label" style={{ marginBottom: 0 }}>{label}</span>
      </div>
      <div className="stat-value" style={{ color: color || 'var(--text-primary)', fontSize: '1.6rem' }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 99 }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 1s ease' }} />
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color, minWidth: 28 }}>{score}</span>
    </div>
  );
}

export default function WeeklyReview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scoreAPI.weekly()
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12 }}>
      <div className="spinner" /> <span style={{ color: 'var(--text-muted)' }}>Analyzing your week...</span>
    </div>
  );

  if (!data) return (
    <div className="page-wrapper">
      <div className="container" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>📊</div>
        <h2>No Data Yet</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>Start logging trades to see your weekly review.</p>
      </div>
    </div>
  );

  const pnlPositive = data.total_pnl >= 0;
  const adherencePct = data.plan_followed_pct;

  const adherenceColor = adherencePct >= 80 ? '#10b981' : adherencePct >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="page-wrapper">
      <div className="container">

        {/* Header */}
        <div style={{ marginBottom: 36 }} className="animate-in">
          <h1>🏆 Weekly Review</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '0.9rem' }}>
            {new Date(data.week_start).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} –{' '}
            {new Date(data.week_end).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Top Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }} className="animate-in">
          <StatCard icon="📊" label="Total Trades" value={data.total_trades} sub="this week" />
          <StatCard
            icon="💰" label="Total P&L"
            value={`${pnlPositive ? '▲' : '▼'} ₹${Math.abs(data.total_pnl).toFixed(0)}`}
            color={pnlPositive ? 'var(--success)' : 'var(--danger)'}
          />
          <StatCard
            icon="🎯" label="Plan Adherence"
            value={`${data.plan_followed_pct}%`}
            color={adherenceColor}
            sub={`${data.plan_followed_count} of ${data.total_trades} trades`}
          />
          <StatCard
            icon="⚡" label="Impulse Trades"
            value={data.impulse_trade_count}
            color={data.impulse_trade_count > 0 ? 'var(--danger)' : 'var(--success)'}
            sub={data.impulse_trade_count === 0 ? 'Perfect! 🧘' : 'Review these'}
          />
        </div>

        {/* Main content grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Average Discipline Score */}
          <div className="card animate-in" style={{ animationDelay: '0.05s' }}>
            <p className="section-title">Avg. Discipline Score</p>
            <div style={{
              fontSize: '3rem', fontWeight: 800,
              fontFamily: "'Space Grotesk', sans-serif",
              color: data.avg_daily_score >= 70 ? 'var(--success)' : data.avg_daily_score >= 50 ? 'var(--accent-gold)' : 'var(--danger)',
              marginBottom: 8,
            }}>
              {data.avg_daily_score.toFixed(0)}
              <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {data.avg_daily_score >= 80
                ? 'Excellent discipline this week! 🏆'
                : data.avg_daily_score >= 60
                  ? 'Good progress. Keep building consistency.'
                  : 'Work on sticking to your plan.'}
            </p>
          </div>

          {/* Plan Adherence Bar */}
          <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
            <p className="section-title">Plan Adherence</p>
            <div style={{ marginBottom: 12 }}>
              <ScoreBar score={Math.round(adherencePct)} />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              {data.plan_followed_count} out of {data.total_trades} trades followed your plan
            </p>
            {adherencePct < 60 && (
              <div className="alert alert-warning" style={{ marginTop: 12, fontSize: '0.82rem' }}>
                ⚠️ Low adherence. Focus on pre-market planning next week.
              </div>
            )}
          </div>

          {/* Top Mistake */}
          <div className="card animate-in" style={{
            border: data.top_mistake ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--border)',
            animationDelay: '0.15s',
          }}>
            <p className="section-title">Top Repeated Mistake</p>
            {data.top_mistake ? (
              <>
                <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🔴</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>
                  {data.top_mistake}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  This was your most common behavioural issue this week. Awareness is the first step.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>✨</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)' }}>
                  No recurring mistakes detected!
                </div>
              </>
            )}
          </div>

          {/* Best Habit */}
          <div className="card animate-in" style={{
            border: '1px solid rgba(16,185,129,0.2)',
            animationDelay: '0.2s',
          }}>
            <p className="section-title">Best Habit This Week</p>
            {data.best_habit ? (
              <>
                <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🌟</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                  {data.best_habit}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Keep reinforcing this. Good habits compound over time.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>📈</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Log more trades to identify habits.
                </div>
              </>
            )}
          </div>
        </div>

        {/* Focus for Next Week */}
        <div className="card animate-in" style={{
          marginTop: 24,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.06))',
          border: '1px solid rgba(59,130,246,0.2)',
          animationDelay: '0.25s',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 48, height: 48, flexShrink: 0,
              background: 'rgba(59,130,246,0.15)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem',
            }}>🎯</div>
            <div>
              <p className="section-title" style={{ marginBottom: 6 }}>Focus for Next Week</p>
              <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {data.focus_next_week}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
