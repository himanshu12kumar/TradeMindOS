import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_LINKS = [
  { to: '/',         icon: '🏠', label: 'Dashboard'  },
  { to: '/terminal', icon: '⚡', label: 'Trade Live', isLive: true },
  { to: '/plan',     icon: '📋', label: 'Daily Plan'  },
  { to: '/trade',    icon: '📝', label: 'Log Trade'   },
  { to: '/history',  icon: '📜', label: 'History'     },
  { to: '/insights', icon: '📈', label: 'Insights'    },
  { to: '/behaviour',icon: '🔍', label: 'Behaviour'   },
  { to: '/review',   icon: '🏆', label: 'Weekly'      },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); setDrawerOpen(false); };
  const isActive = (to) => location.pathname === to;

  return (
    <>
      {/* ── Top Bar ───────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 1000,
        background: 'rgba(7,12,24,0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Brand row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', height: 56,
          maxWidth: 1400, margin: '0 auto',
        }}>
          {/* Brand */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', boxShadow: '0 0 14px rgba(59,130,246,0.35)',
              flexShrink: 0,
            }}>🧠</div>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700, fontSize: '1.05rem', color: '#f1f5f9',
              letterSpacing: '-0.01em',
            }}>
              Trade<span style={{ color: '#3b82f6' }}>Mind</span>
              <span style={{ color: '#475569', fontWeight: 400, marginLeft: 4, fontSize: '0.72rem', letterSpacing: '0.08em' }}>OS</span>
            </span>
          </Link>

          {/* Desktop: User + Settings + Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className="hide-on-mobile">
            {/* Direct Live Terminal Launcher Button */}
            <Link
              to="/terminal"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                color: '#ffffff',
                textDecoration: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.4)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 0 22px rgba(245, 158, 11, 0.6)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(245, 158, 11, 0.4)'; }}
            >
              <span>⚡</span> Trade Live
            </Link>

            <Link to="/settings" title="Settings" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 8,
              background: isActive('/settings') ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: `1px solid ${isActive('/settings') ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
              color: isActive('/settings') ? '#3b82f6' : '#64748b',
              textDecoration: 'none', fontSize: '1rem',
              transition: 'all 0.2s',
            }}>⚙️</Link>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(13,20,37,0.8)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 99, padding: '4px 12px 4px 6px',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>{user?.username?.charAt(0).toUpperCase()}</div>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username}
              </span>
            </div>

            <button onClick={handleLogout} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, color: '#64748b', cursor: 'pointer',
              padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
              transition: 'all 0.2s', fontFamily: "'Inter', sans-serif",
            }}
              onMouseEnter={e => { e.target.style.borderColor = 'rgba(239,68,68,0.4)'; e.target.style.color = '#fca5a5'; }}
              onMouseLeave={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.color = '#64748b'; }}
            >Sign out</button>
          </div>

          {/* Mobile: Hamburger */}
          <button onClick={() => setDrawerOpen(o => !o)} className="show-on-mobile" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 8, display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                display: 'block', width: 22, height: 2, background: '#94a3b8',
                borderRadius: 99, transformOrigin: 'center', transition: 'transform 0.2s ease',
                transform: drawerOpen
                  ? i === 0 ? 'translateY(7px) rotate(45deg)'
                    : i === 1 ? 'scaleX(0)' : 'translateY(-7px) rotate(-45deg)'
                  : 'none',
              }} />
            ))}
          </button>
        </div>

        {/* Nav links strip (desktop only) */}
        <div className="hide-on-mobile" style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(13,20,37,0.5)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            maxWidth: 1400, margin: '0 auto',
            padding: '0 20px', gap: 2,
          }}>
            {NAV_LINKS.map(item => {
              const active = isActive(item.to);
              if (item.isLive) {
                return (
                  <Link key={item.to} to={item.to} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px',
                    margin: '3px 4px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontSize: '0.8rem', fontWeight: 800,
                    color: '#ffffff',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(239, 68, 68, 0.25))',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    boxShadow: '0 0 10px rgba(245, 158, 11, 0.15)',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}>
                    <span>⚡</span>
                    {item.label}
                  </Link>
                );
              }
              return (
                <Link key={item.to} to={item.to} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px',
                  textDecoration: 'none',
                  fontSize: '0.82rem', fontWeight: active ? 700 : 500,
                  color: active ? '#3b82f6' : '#64748b',
                  borderBottom: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
                  background: active ? 'rgba(59,130,246,0.06)' : 'transparent',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'transparent'; } }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ─────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(7,12,24,0.85)', backdropFilter: 'blur(8px)',
          }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 56, right: 0, bottom: 0,
              width: 270, background: '#0d1425',
              borderLeft: '1px solid rgba(255,255,255,0.07)',
              padding: '20px 12px',
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.2s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* User pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(255,255,255,0.04)', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.07)',
              padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, color: '#fff',
              }}>{user?.username?.charAt(0).toUpperCase()}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f1f5f9' }}>{user?.username}</div>
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>{user?.email}</div>
              </div>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[...NAV_LINKS, { to: '/settings', icon: '⚙️', label: 'Settings' }].map(item => {
                const active = isActive(item.to);
                return (
                  <Link key={item.to} to={item.to} onClick={() => setDrawerOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px', borderRadius: 10, textDecoration: 'none',
                    fontWeight: active ? 700 : 500, fontSize: '0.9rem',
                    background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                    color: active ? '#3b82f6' : '#94a3b8',
                    border: `1px solid ${active ? 'rgba(59,130,246,0.2)' : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <button onClick={handleLogout} style={{
              marginTop: 12, width: '100%', padding: '11px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, color: '#fca5a5',
              fontSize: '0.88rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}>Sign Out</button>
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Tab Bar ─────────────────────────────────── */}
      <nav className="show-on-mobile" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
        display: 'flex',
        background: '#0d1425',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        {NAV_LINKS.slice(0, 5).map(item => {
          const active = isActive(item.to);
          return (
            <Link key={item.to} to={item.to} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, padding: '8px 4px',
              textDecoration: 'none',
              color: active ? '#3b82f6' : '#475569',
              borderTop: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
              fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: '1.15rem' }}>{item.icon}</span>
              <span>{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
