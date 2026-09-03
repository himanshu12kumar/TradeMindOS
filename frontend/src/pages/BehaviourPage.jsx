import { useState, useEffect, useCallback } from 'react';
import { behaviourAPI } from '../api/client';

const EVENT_CONFIG = {
  plan_created:              { icon: '📋', color: '#3b82f6',  label: 'Plan Created',            category: 'plan'      },
  plan_locked:               { icon: '🔒', color: '#10b981',  label: 'Plan Locked',             category: 'plan'      },
  plan_modified_after_lock:  { icon: '⚠️', color: '#f59e0b',  label: 'Plan Modified After Lock',category: 'violation' },
  impulse_trade:             { icon: '⚡', color: '#ef4444',  label: 'Impulse Trade',           category: 'violation' },
  trade_limit_reached:       { icon: '🛑', color: '#ef4444',  label: 'Trade Limit Reached',     category: 'violation' },
  revenge_trade_warning:     { icon: '🔴', color: '#f97316',  label: 'Revenge Trade Warning',   category: 'violation' },
  trade_logged:              { icon: '📈', color: '#10b981',  label: 'Trade Logged',            category: 'trade'     },
  rule_break:                { icon: '💔', color: '#ef4444',  label: 'Rule Break',              category: 'violation' },
};

const CATEGORIES = [
  { key: 'all',       label: 'All Events',   color: '#94a3b8' },
  { key: 'violation', label: '🚨 Violations', color: '#ef4444' },
  { key: 'trade',     label: '📈 Trades',     color: '#10b981' },
  { key: 'plan',      label: '📋 Plans',      color: '#3b82f6' },
];

function SummaryCard({ icon, label, value, color, sub }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: '1.3rem' }}>{icon}</span>
        <span className="stat-label" style={{ marginBottom: 0 }}>{label}</span>
      </div>
      <div className="stat-value" style={{ color: color || 'var(--text-primary)', fontSize: '1.7rem' }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function TimelineItem({ log }) {
  const config = EVENT_CONFIG[log.event_type] || { icon: '📌', color: '#94a3b8', label: log.event_type };
  const isViolation = config.category === 'violation';

  return (
    <div style={{
      display: 'flex', gap: 16, padding: '16px 0',
      borderBottom: '1px solid var(--border)',
      animation: 'fadeInUp 0.3s ease',
    }}>
      {/* Icon column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          background: `${config.color}18`,
          border: `2px solid ${config.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem',
        }}>
          {config.icon}
        </div>
        <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 8 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
          <span style={{
            fontWeight: 700,
            fontSize: '0.9rem',
            color: isViolation ? config.color : 'var(--text-primary)',
          }}>
            {config.label}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {new Date(log.created_at).toLocaleString('en-IN', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </div>
        {log.description && (
          <p style={{
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            background: isViolation ? `${config.color}08` : 'transparent',
            padding: isViolation ? '8px 12px' : 0,
            borderRadius: isViolation ? 6 : 0,
            borderLeft: isViolation ? `3px solid ${config.color}40` : 'none',
            paddingLeft: isViolation ? 12 : 0,
            margin: 0,
          }}>
            {log.description}
          </p>
        )}
      </div>
    </div>
  );
}

export default function BehaviourPage() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const [logsRes, summaryRes] = await Promise.all([
        behaviourAPI.list(params),
        behaviourAPI.summary(),
      ]);
      setLogs(logsRes.data || []);
      setSummary(summaryRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredLogs = logs.filter(log => {
    if (activeCategory === 'all') return true;
    const config = EVENT_CONFIG[log.event_type];
    return config?.category === activeCategory;
  });

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: 800 }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }} className="animate-in">
          <h1>🔍 Behaviour Log</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '0.9rem' }}>
            A complete record of every discipline event, violation, and action.
          </p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }} className="animate-in">
            <SummaryCard icon="📊" label="Total Events" value={summary.total_events} sub={`Last ${summary.period_days} days`} />
            <SummaryCard icon="🚨" label="Violations" value={summary.violations}
              color={summary.violations > 3 ? 'var(--danger)' : summary.violations > 0 ? 'var(--accent-gold)' : 'var(--success)'}
              sub={summary.violations === 0 ? 'Clean week! 🧘' : 'review these'} />
            <SummaryCard icon="✅" label="Positive Events" value={summary.positive_events} color="var(--success)" sub="Plans locked" />
            <SummaryCard icon="🔥" label="Clean Day Streak" value={`${summary.clean_day_streak}d`}
              color={summary.clean_day_streak >= 3 ? 'var(--success)' : 'var(--accent-gold)'}
              sub={`days without violation`} />
          </div>
        )}

        {/* Category Filter Chips + Date Filter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }} className="animate-in">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className="btn btn-sm"
                style={{
                  background: activeCategory === cat.key ? `${cat.color}20` : 'var(--bg-elevated)',
                  border: `1px solid ${activeCategory === cat.key ? `${cat.color}50` : 'var(--border)'}`,
                  color: activeCategory === cat.key ? cat.color : 'var(--text-muted)',
                  fontWeight: activeCategory === cat.key ? 700 : 500,
                }}>
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" className="form-input" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '7px 10px', width: 'auto' }} />
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <input type="date" className="form-input" value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '7px 10px', width: 'auto' }} />
          </div>
        </div>

        {/* Violation breakdown */}
        {summary?.violation_breakdown && Object.keys(summary.violation_breakdown).length > 0 && (
          <div className="card animate-in" style={{ marginBottom: 24, padding: '18px 24px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="section-title" style={{ color: '#ef4444', marginBottom: 12 }}>Violation Breakdown (Last 7 Days)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {Object.entries(summary.violation_breakdown).map(([key, count]) => {
                const cfg = EVENT_CONFIG[key] || {};
                return (
                  <div key={key} style={{
                    background: `${cfg.color || '#ef4444'}15`,
                    border: `1px solid ${cfg.color || '#ef4444'}30`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 14px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>{cfg.icon}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{cfg.label || key}</span>
                    <span style={{ fontWeight: 700, color: cfg.color || '#ef4444' }}>×{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <p className="section-title" style={{ marginBottom: 0 }}>Event Timeline</p>
            <span className="badge badge-gray">{filteredLogs.length} events</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
              <p>No events found for this category.</p>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Start trading and locking plans to see events here.</p>
            </div>
          ) : (
            filteredLogs.map(log => <TimelineItem key={log.id} log={log} />)
          )}
        </div>

      </div>
    </div>
  );
}
