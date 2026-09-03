import { useState, useEffect, useCallback } from 'react';
import { historyAPI } from '../api/client';
import UpdateExitModal from '../components/UpdateExitModal';

const EXIT_REASON_LABELS = {
  TARGET: { label: 'Target Hit', color: 'var(--success)', icon: '🎯' },
  STOP_LOSS: { label: 'Stop Loss', color: '#94a3b8', icon: '✂️' },
  FEAR: { label: 'Fear', color: 'var(--danger)', icon: '😰' },
  GREED: { label: 'Greed', color: 'var(--danger)', icon: '🤑' },
  MANUAL: { label: 'Manual', color: 'var(--accent-blue)', icon: '🖐️' },
};

function StatPill({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '14px 20px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export default function HistoryPage() {
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exitModal, setExitModal] = useState(null); // { trade }

  // Filters
  const [filters, setFilters] = useState({
    symbol: '', is_impulse: '', plan_followed: '', exit_reason: '', is_open: '',
    date_from: '', date_to: '',
  });
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.symbol)       params.symbol       = filters.symbol;
      if (filters.is_impulse !== '')   params.is_impulse   = filters.is_impulse === 'true';
      if (filters.plan_followed !== '') params.plan_followed = filters.plan_followed === 'true';
      if (filters.exit_reason)  params.exit_reason  = filters.exit_reason;
      if (filters.is_open !== '')      params.is_open      = filters.is_open === 'true';
      if (filters.date_from)    params.date_from    = filters.date_from;
      if (filters.date_to)      params.date_to      = filters.date_to;

      const [tradesRes, statsRes] = await Promise.all([
        historyAPI.getTrades(params),
        historyAPI.getStats(filters.date_from ? { date_from: filters.date_from, date_to: filters.date_to } : {}),
      ]);
      setTrades(tradesRes.data || []);
      setStats(statsRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

  const handleExitSaved = () => { setExitModal(null); fetchData(); };

  const pnlColor = (pnl) => pnl == null ? 'var(--text-muted)' : pnl > 0 ? 'var(--success)' : 'var(--danger)';
  const pnlStr = (pnl) => pnl == null ? 'Open' : `${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(0)}`;

  return (
    <div className="page-wrapper">
      <div className="container">

        {exitModal && (
          <UpdateExitModal
            trade={exitModal}
            onSaved={handleExitSaved}
            onClose={() => setExitModal(null)}
          />
        )}

        {/* Header */}
        <div style={{ marginBottom: 32 }} className="animate-in">
          <h1>📜 Trade History</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '0.9rem' }}>
            Filter, analyze, and close open trades.
          </p>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }} className="animate-in">
            <StatPill label="Total Trades" value={stats.total} />
            <StatPill label="Win Rate" value={`${stats.win_rate}%`} color={stats.win_rate >= 50 ? 'var(--success)' : 'var(--danger)'} />
            <StatPill label="Total P&L" value={`${stats.total_pnl >= 0 ? '+' : ''}₹${stats.total_pnl.toFixed(0)}`} color={stats.total_pnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
            <StatPill label="Avg P&L" value={`₹${stats.avg_pnl?.toFixed(0) || 0}`} color={stats.avg_pnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
            <StatPill label="Open Trades" value={stats.open_trades} color={stats.open_trades > 0 ? 'var(--accent-gold)' : 'var(--text-muted)'} />
          </div>
        )}

        {/* Filters */}
        <div className="card animate-in" style={{ marginBottom: 24, padding: '20px 24px' }}>
          <p className="section-title" style={{ marginBottom: 14 }}>Filters</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1fr 1fr', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group">
              <label className="form-label">Symbol</label>
              <input className="form-input" value={filters.symbol}
                onChange={e => handleFilter('symbol', e.target.value)} placeholder="NIFTY50..." />
            </div>
            <div className="form-group">
              <label className="form-label">Impulse Trade</label>
              <select className="form-select" value={filters.is_impulse} onChange={e => handleFilter('is_impulse', e.target.value)}>
                <option value="">All</option>
                <option value="false">Clean ✅</option>
                <option value="true">Impulse ⚡</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Plan Followed</label>
              <select className="form-select" value={filters.plan_followed} onChange={e => handleFilter('plan_followed', e.target.value)}>
                <option value="">All</option>
                <option value="true">Yes 🎯</option>
                <option value="false">No ⚠️</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={filters.is_open} onChange={e => handleFilter('is_open', e.target.value)}>
                <option value="">All</option>
                <option value="true">Open 🔓</option>
                <option value="false">Closed ✓</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">From</label>
              <input type="date" className="form-input" value={filters.date_from} onChange={e => handleFilter('date_from', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">To</label>
              <input type="date" className="form-input" value={filters.date_to} onChange={e => handleFilter('date_to', e.target.value)} />
            </div>
          </div>
          {Object.values(filters).some(Boolean) && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}
              onClick={() => { setFilters({ symbol:'',is_impulse:'',plan_followed:'',exit_reason:'',is_open:'',date_from:'',date_to:'' }); setPage(1); }}>
              ✕ Clear Filters
            </button>
          )}
        </div>

        {/* Trade Table */}
        <div className="card animate-in" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : trades.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
              <p>No trades found for the selected filters.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                    {['Date', 'Symbol', 'Setup', 'Entry', 'Exit', 'P&L', 'Exit Reason', 'Plan', 'Impulse', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => {
                    const er = EXIT_REASON_LABELS[t.exit_reason];
                    return (
                      <tr key={t.id} style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'}
                      >
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.symbol || '—'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{t.setup_type || '—'}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>₹{t.entry_price}</td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{t.exit_price ? `₹${t.exit_price}` : <span style={{ color: 'var(--accent-gold)' }}>Open</span>}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: pnlColor(t.pnl), fontFamily: 'monospace' }}>{pnlStr(t.pnl)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {er ? <span style={{ color: er.color }}>{er.icon} {er.label}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {t.was_plan_followed
                            ? <span className="badge badge-green">✓ Yes</span>
                            : <span className="badge badge-red">✗ No</span>}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {t.is_impulse_trade
                            ? <span className="badge badge-red">⚡ Yes</span>
                            : <span className="badge badge-green">— No</span>}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {!t.exit_price && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setExitModal(t)}>
                              Close Trade
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '6px 0' }}>Page {page}</span>
          <button className="btn btn-ghost btn-sm" disabled={trades.length < 20} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>

      </div>
    </div>
  );
}
