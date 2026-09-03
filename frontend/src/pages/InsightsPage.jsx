import { useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, Bar, Cell, LineChart, Line, Legend,
} from 'recharts';
import { insightsAPI } from '../api/client';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#06b6d4'];

// ─── Custom Tooltip ─────────────────────────────────────────────────────────
const ScatterTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>Trade #{d?.trade_id} — {d?.symbol || '—'}</p>
      <p style={{ color: d?.pnl >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>P&L: ₹{d?.pnl}</p>
      <p style={{ color: 'var(--text-muted)' }}>Score: {payload[0]?.value}</p>
    </div>
  );
};

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 4 }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{sub}</p>
    </div>
  );
}

function EmptyChart({ message = 'Log more trades to see data here.' }) {
  return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: '2rem' }}>📊</span>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>{message}</p>
    </div>
  );
}

export default function InsightsPage() {
  const [correlation, setCorrelation] = useState([]);
  const [setupPerf, setSetupPerf] = useState([]);
  const [scoreTrend, setScoreTrend] = useState([]);
  const [emotionSummary, setEmotionSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      insightsAPI.emotionalCorrelation().catch(() => ({ data: [] })),
      insightsAPI.setupPerformance().catch(() => ({ data: [] })),
      insightsAPI.scoreTrend().catch(() => ({ data: [] })),
      insightsAPI.emotionSummary().catch(() => ({ data: null })),
    ]).then(([corr, perf, trend, emo]) => {
      setCorrelation(corr.data || []);
      setSetupPerf(perf.data || []);
      setScoreTrend(trend.data || []);
      setEmotionSummary(emo.data);
      setLoading(false);
    });
  }, []);

  // Prepare scatter data for FOMO vs PnL
  const fomoData = correlation
    .filter(d => d.before?.fomo != null)
    .map(d => ({ trade_id: d.trade_id, symbol: d.symbol, pnl: d.pnl, x: d.before.fomo, y: d.pnl, is_win: d.is_win }));

  const stressData = correlation
    .filter(d => d.before?.stress != null)
    .map(d => ({ trade_id: d.trade_id, symbol: d.symbol, pnl: d.pnl, x: d.before.stress, y: d.pnl, is_win: d.is_win }));

  // Win vs Loss emotion comparison
  const emoCompData = emotionSummary ? [
    { name: 'Confidence', wins: emotionSummary.wins.before?.confidence, losses: emotionSummary.losses.before?.confidence },
    { name: 'Stress',     wins: emotionSummary.wins.before?.stress,     losses: emotionSummary.losses.before?.stress     },
    { name: 'FOMO',       wins: emotionSummary.wins.before?.fomo,       losses: emotionSummary.losses.before?.fomo       },
    { name: 'Patience',   wins: emotionSummary.wins.before?.patience,   losses: emotionSummary.losses.before?.patience   },
  ].filter(d => d.wins != null && d.losses != null) : [];

  const trendColor = (score) => score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12 }}>
      <div className="spinner" /> <span style={{ color: 'var(--text-muted)' }}>Analyzing your data...</span>
    </div>
  );

  return (
    <div className="page-wrapper">
      <div className="container">

        {/* Header */}
        <div style={{ marginBottom: 36 }} className="animate-in">
          <h1>📈 Insights & Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: '0.9rem' }}>
            Discover patterns between your emotions, setups, and P&L outcomes.
          </p>
        </div>

        {/* ── Chart 1: 30-Day Discipline Score Trend ─────────────────── */}
        <div className="card animate-in" style={{ marginBottom: 28 }}>
          <SectionHeader
            title="📊 30-Day Discipline Score Trend"
            sub="Track how your behavioral consistency evolves over time."
          />
          {scoreTrend.length < 3 ? <EmptyChart message="Complete at least 3 days of trading to see your trend." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={scoreTrend} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.82rem' }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                  formatter={(val) => [`${val}/100`, 'Discipline Score']} />
                <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Good', fill: '#f59e0b', fontSize: 11 }} />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2.5}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    return <circle key={cy} cx={cx} cy={cy} r={4} fill={trendColor(payload.score)} stroke="none" />;
                  }}
                  activeDot={{ r: 6, fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Row: Scatter Charts ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>

          {/* Chart 2: FOMO vs P&L */}
          <div className="card animate-in" style={{ animationDelay: '0.05s' }}>
            <SectionHeader
              title="😰 FOMO vs P&L"
              sub="High FOMO before entry — does it hurt your returns?"
            />
            {fomoData.length < 3 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" dataKey="x" domain={[1, 10]} name="FOMO Score"
                    label={{ value: 'FOMO Before Entry', position: 'insideBottom', offset: -3, fill: '#64748b', fontSize: 11 }}
                    tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis type="number" dataKey="y" name="P&L" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Tooltip content={<ScatterTooltip />} />
                  <Scatter data={fomoData}
                    fill="#f59e0b"
                    shape={(props) => {
                      const { cx, cy, payload } = props;
                      return <circle key={cx} cx={cx} cy={cy} r={5} fill={payload.is_win ? '#10b981' : '#ef4444'} opacity={0.75} />;
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
              <span style={{ color: '#10b981' }}>● Green = winning trade</span> &nbsp;
              <span style={{ color: '#ef4444' }}>● Red = losing trade</span>
            </p>
          </div>

          {/* Chart 3: Stress vs P&L */}
          <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
            <SectionHeader
              title="😤 Stress vs P&L"
              sub="Are your stressed trades costing you money?"
            />
            {stressData.length < 3 ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" dataKey="x" domain={[1, 10]} name="Stress"
                    label={{ value: 'Stress Before Entry', position: 'insideBottom', offset: -3, fill: '#64748b', fontSize: 11 }}
                    tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis type="number" dataKey="y" name="P&L" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Tooltip content={<ScatterTooltip />} />
                  <Scatter data={stressData}
                    shape={(props) => {
                      const { cx, cy, payload } = props;
                      return <circle key={cx} cx={cx} cy={cy} r={5} fill={payload.is_win ? '#10b981' : '#ef4444'} opacity={0.75} />;
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
              <span style={{ color: '#10b981' }}>● Winning trade</span> &nbsp;
              <span style={{ color: '#ef4444' }}>● Losing trade</span>
            </p>
          </div>
        </div>

        {/* ── Chart 4: Setup Performance ─────────────────────────────── */}
        <div className="card animate-in" style={{ marginBottom: 28, animationDelay: '0.15s' }}>
          <SectionHeader
            title="🎯 Win Rate by Setup Type"
            sub="Which setups actually work for you? Data beats opinion."
          />
          {setupPerf.length === 0 ? <EmptyChart message="Log trades with setup types to see performance here." /> : (
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={setupPerf} margin={{ top: 5, right: 20, left: -20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="setup" tick={{ fontSize: 11, fill: '#64748b' }} angle={-25} textAnchor="end" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.82rem' }}
                    formatter={(val, name, props) => [`${val}% (${props.payload.total} trades)`, 'Win Rate']} />
                  <Bar dataKey="win_rate" radius={[6, 6, 0, 0]}>
                    {setupPerf.map((entry, i) => (
                      <Cell key={i} fill={entry.win_rate >= 50 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Setup detail table */}
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Setup', 'Total', 'Wins', 'Win Rate', 'Avg P&L'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {setupPerf.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.setup}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{s.total}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--success)' }}>{s.wins}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: s.win_rate >= 50 ? 'var(--success)' : 'var(--danger)' }}>{s.win_rate}%</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: s.avg_pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{s.avg_pnl >= 0 ? '+' : ''}₹{s.avg_pnl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Win vs Loss Emotion Comparison ─────────────────────────── */}
        {emotionSummary && emoCompData.length > 0 && (
          <div className="card animate-in" style={{ animationDelay: '0.2s' }}>
            <SectionHeader
              title="🧠 Winning vs Losing Trade Emotions"
              sub="Average emotional state before your wins vs losses."
            />
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div className="badge badge-green">✅ {emotionSummary.wins.count} wins</div>
              <div className="badge badge-red">❌ {emotionSummary.losses.count} losses</div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={emoCompData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.82rem' }} />
                <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
                <Bar dataKey="wins" name="Winning Trades" fill="#10b981" radius={[4,4,0,0]} />
                <Bar dataKey="losses" name="Losing Trades" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12 }}>
              💡 Higher stress and FOMO scores before losing trades indicate emotional trading. Lower patience before losses suggests rushing entries.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
