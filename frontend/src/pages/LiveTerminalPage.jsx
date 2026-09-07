import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  terminalAPI,
  planAPI,
  tradeAPI,
} from '../api/client';
import voiceAlert from '../services/VoiceAlert';
import BrokerSettingsModal from '../components/BrokerSettingsModal';
import InteractiveChart from '../components/InteractiveChart';

export default function LiveTerminalPage() {
  const navigate = useNavigate();

  // Market Watch & Active Symbol
  const [watchlist, setWatchlist] = useState([]);
  const [activeSymbol, setActiveSymbol] = useState('NIFTY 50');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSegment, setFilterSegment] = useState('ALL'); // 'ALL' | 'INDICES' | 'NSE_EQ'

  // Chart Data & Timeframe
  const [timeframe, setTimeframe] = useState('5m');
  const [chartCandles, setChartCandles] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Order Pad State
  const [txnType, setTxnType] = useState('BUY'); // 'BUY' | 'SELL'
  const [productType, setProductType] = useState('MIS'); // 'MIS' | 'CNC'
  const [orderType, setOrderType] = useState('MARKET'); // 'MARKET' | 'LIMIT' | 'SL'
  const [quantity, setQuantity] = useState(25);
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Bottom Tabs & Data
  const [activeBottomTab, setActiveBottomTab] = useState('positions'); // 'positions' | 'orders' | 'history' | 'synclog'
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [brokerConfig, setBrokerConfig] = useState(null);

  // TradeMind Live Health HUD
  const [planStats, setPlanStats] = useState({
    maxTrades: 3,
    maxLoss: 1000,
    tradeCount: 0,
    totalLoss: 0,
    pnlToday: 0,
  });

  // Modals & Interceptions
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [riskAlertModal, setRiskAlertModal] = useState(null); // { title, message, onProceed, actionLabel, canOverride }
  const [hasDailyPlan, setHasDailyPlan] = useState(null); // null = checking, false = no plan, true = plan set
  const [toast, setToast] = useState({ show: false, text: '', type: 'info' });

  const pollIntervalRef = useRef(null);

  const showToast = (text, type = 'info') => {
    setToast({ show: true, text, type });
    setTimeout(() => setToast({ show: false, text: '', type: 'info' }), 4000);
  };

  const handleApplyPositionLevels = (sl, target) => {
    if (sl) setStopLoss(String(sl));
    if (target) setTargetPrice(String(target));
    showToast(`Chart setup synced: SL ₹${sl} | Target ₹${target} applied to Order Pad!`, 'info');
  };

  const activeSymbolRef = useRef(activeSymbol);
  const timeframeRef = useRef(timeframe);

  useEffect(() => {
    activeSymbolRef.current = activeSymbol;
  }, [activeSymbol]);

  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  // ── 1. Initial Load & Polling ─────────────────────────────────────────────
  useEffect(() => {
    // Auto-detect redirect from Zerodha Kite Login
    const params = new URLSearchParams(window.location.search);
    const reqToken = params.get('request_token');
    const authStatus = params.get('status');

    if (reqToken && authStatus !== 'cancelled') {
      showToast('Authenticating Zerodha Kite session...', 'info');
      terminalAPI
        .exchangeKiteToken(reqToken)
        .then((res) => {
          showToast(res.data?.message || 'Zerodha Kite connected successfully! Real mode active.', 'success');
          voiceAlert.speak('Zerodha Kite connected successfully. Real trading mode is active.', 'normal');
          fetchBrokerConfig();
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((err) => {
          showToast(err.response?.data?.detail || 'Kite token authorization failed', 'error');
        });
    }

    fetchMarketWatch();
    fetchPositions();
    fetchOrders();
    fetchBrokerConfig();
    fetchTradeMindPlan();

    // Fast 1.5s polling for realistic live market ticks and smooth candles
    pollIntervalRef.current = setInterval(() => {
      fetchMarketWatch(true);
      fetchPositions(true);
    }, 1500);

    return () => clearInterval(pollIntervalRef.current);
  }, []);

  // ── 2. Load Chart when symbol/timeframe changes ───────────────────────────
  useEffect(() => {
    fetchChart(activeSymbol, timeframe);
  }, [activeSymbol, timeframe]);

  // Sync lot size when active symbol changes
  useEffect(() => {
    const activeInst = watchlist.find((w) => w.symbol === activeSymbol);
    if (activeInst) {
      setQuantity(activeInst.lot_size || 1);
      if (!limitPrice || orderType === 'MARKET') {
        setLimitPrice(activeInst.ltp.toFixed(2));
      }
    }
  }, [activeSymbol, watchlist]);

  const fetchMarketWatch = async (isBackground = false) => {
    try {
      const res = await terminalAPI.getMarketWatch();
      const watchData = res.data || [];
      setWatchlist(watchData);

      // Live candle real-time tick streaming into the active chart
      const curSymbol = activeSymbolRef.current;
      const curTf = timeframeRef.current;
      const activeTick = watchData.find((w) => w.symbol === curSymbol);

      if (activeTick && activeTick.ltp) {
        setChartCandles((prevCandles) => {
          if (!prevCandles || prevCandles.length === 0) return prevCandles;
          const candlesCopy = [...prevCandles];
          const lastCandle = { ...candlesCopy[candlesCopy.length - 1] };
          const nowSec = Math.floor(Date.now() / 1000);

          const tfSecMap = {
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '1h': 3600,
            '1D': 86400,
          };
          const intervalSec = tfSecMap[curTf] || 300;

          // If candle interval has expired, spawn a brand new live candle smoothly
          if (nowSec - (lastCandle.time || 0) >= intervalSec) {
            const newCandle = {
              time: nowSec,
              open: activeTick.ltp,
              high: activeTick.ltp,
              low: activeTick.ltp,
              close: activeTick.ltp,
              volume: Math.floor(Math.random() * 80 + 30),
            };
            candlesCopy.push(newCandle);
            if (candlesCopy.length > 250) candlesCopy.shift();
          } else {
            // Live micro-movement on active candle
            lastCandle.close = activeTick.ltp;
            lastCandle.high = Math.max(lastCandle.high, activeTick.ltp);
            lastCandle.low = Math.min(lastCandle.low, activeTick.ltp);
            lastCandle.volume = (lastCandle.volume || 100) + Math.floor(Math.random() * 25 + 5);
            candlesCopy[candlesCopy.length - 1] = lastCandle;
          }

          return candlesCopy;
        });
      }
    } catch (err) {
      if (!isBackground) showToast('Failed to fetch market watch', 'error');
    }
  };

  const fetchChart = async (symbol, tf) => {
    try {
      setChartLoading(true);
      const res = await terminalAPI.getChart(symbol, tf);
      setChartCandles(res.data?.candles || []);
    } catch (err) {
      // ignore
    } finally {
      setChartLoading(false);
    }
  };

  const fetchPositions = async (isBackground = false) => {
    try {
      const res = await terminalAPI.getPositions();
      setPositions(res.data || []);
    } catch (err) {
      if (!isBackground) showToast('Failed to fetch positions', 'error');
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await terminalAPI.getOrders();
      setOrders(res.data || []);
    } catch (err) {
      // ignore
    }
  };

  const fetchBrokerConfig = async () => {
    try {
      const res = await terminalAPI.getBrokerConfig();
      setBrokerConfig(res.data);
    } catch (err) {
      // ignore
    }
  };

  const fetchTradeMindPlan = async () => {
    try {
      const [pRes, tRes] = await Promise.allSettled([
        planAPI.getToday(),
        tradeAPI.list(),
      ]);
      const plan = pRes.status === 'fulfilled' ? pRes.value.data : null;
      setHasDailyPlan(!!plan);
      const trades = tRes.status === 'fulfilled' ? tRes.value.data : [];

      const todayStr = new Date().toISOString().slice(0, 10);
      const todaysTrades = trades.filter((t) => t.created_at?.startsWith(todayStr));
      const pnlSum = todaysTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
      const lossSum = Math.abs(
        todaysTrades.filter((t) => t.pnl !== null && t.pnl < 0).reduce((acc, t) => acc + (t.pnl || 0), 0)
      );

      setPlanStats({
        maxTrades: plan?.max_trades || 3,
        maxLoss: plan?.max_loss_amount || 1000,
        tradeCount: todaysTrades.length,
        totalLoss: lossSum,
        pnlToday: pnlSum,
      });
    } catch (err) {
      // ignore
    }
  };

  // ── 3. Execute Order Handler ──────────────────────────────────────────────
  const handleExecuteOrder = async (overrideRisk = false) => {
    // 1. Strict Discipline Gate: Must have an approved Daily Plan before punching trades!
    if (hasDailyPlan === false) {
      const isHindi = voiceAlert.getLanguage() === 'hi';
      const speechText = isHindi
        ? 'ट्रेड रोक दिया गया! आपने आज का डेली ट्रेडिंग प्लान सेट नहीं किया है। बिना प्लान के ट्रेड करना नियमों के खिलाफ़ है। कृपया पहले अपना प्लान सेट करें।'
        : 'Trade blocked! You have not set your daily trading plan for today. A disciplined trader never enters the market without a plan. Please set your plan first.';

      voiceAlert.speak(speechText, 'urgent');
      setRiskAlertModal({
        title: isHindi ? '📋 डेली ट्रेडिंग प्लान आवश्यक' : '📋 Daily Plan Required Before Trading',
        message: isHindi
          ? 'TradeMind OS अनुशासन नियम: आज का डेली प्लान बनाए बिना आप TradeLive पर ट्रेड नहीं ले सकते। मार्केट में प्रवेश करने से पहले अपने मैक्स ट्रेड्स, रिस्क लिमिट और सेटअप तय करें।'
          : 'TradeMind OS discipline rule: You cannot punch trades on TradeLive without an active Daily Plan for today. Please define your trade limits, maximum loss, and market bias first.',
        canOverride: false,
        actionLabel: isHindi ? "आज का प्लान सेट करें" : "Set Today's Daily Plan",
        onProceed: () => navigate('/daily-plan'),
      });
      return;
    }

    if (!quantity || quantity <= 0) {
      showToast('Quantity must be greater than 0', 'error');
      return;
    }

    const payload = {
      symbol: activeSymbol,
      transaction_type: txnType,
      product: productType,
      order_type: orderType,
      quantity: Number(quantity),
      price: orderType === 'LIMIT' ? Number(limitPrice) : 0,
      trigger_price: triggerPrice ? Number(triggerPrice) : null,
      stop_loss: stopLoss ? Number(stopLoss) : null,
      target_price: targetPrice ? Number(targetPrice) : null,
      override_risk_gate: overrideRisk,
    };

    try {
      setIsPlacingOrder(true);
      const res = await terminalAPI.placeOrder(payload);
      showToast(`Order executed successfully! ID: ${res.data?.broker_order_id || res.data?.id}`, 'success');
      voiceAlert.speak(`${txnType} order filled for ${quantity} ${activeSymbol}`, 'normal');
      setRiskAlertModal(null);
      fetchPositions();
      fetchOrders();
      fetchTradeMindPlan();
    } catch (err) {
      const errData = err.response?.data?.detail;
      if (errData && errData.error_code === 'NO_DAILY_PLAN') {
        const isHindi = voiceAlert.getLanguage() === 'hi';
        const speechText = isHindi
          ? 'ट्रेड रोक दिया गया! आपने आज का डेली ट्रेडिंग प्लान सेट नहीं किया है। बिना प्लान के ट्रेड करना नियमों के खिलाफ़ है। कृपया पहले अपना प्लान सेट करें।'
          : 'Trade blocked! You have not set your daily trading plan for today. A disciplined trader never enters the market without a plan. Please set your plan first.';
        voiceAlert.speak(speechText, 'urgent');
        setRiskAlertModal({
          title: isHindi ? '📋 डेली ट्रेडिंग प्लान आवश्यक' : '📋 Daily Plan Required Before Trading',
          message: errData.message,
          canOverride: false,
          actionLabel: isHindi ? "आज का प्लान सेट करें" : "Set Today's Daily Plan",
          onProceed: () => navigate('/daily-plan'),
        });
      } else if (errData && errData.error_code === 'TRADE_LIMIT_REACHED') {
        voiceAlert.speak('Trade limit reached. Your morning plan says stop trading.', 'urgent');
        setRiskAlertModal({
          title: '🛑 Trade Limit Reached',
          message: errData.message,
          canOverride: errData.can_override !== false,
          onProceed: () => handleExecuteOrder(true),
        });
      } else if (errData && errData.error_code === 'MAX_LOSS_BREACHED') {
        voiceAlert.speak('Maximum loss limit reached. Protect your remaining capital.', 'urgent');
        setRiskAlertModal({
          title: '🛑 Max Loss Breached',
          message: errData.message,
          canOverride: errData.can_override !== false,
          onProceed: () => handleExecuteOrder(true),
        });
      } else {
        const errorMsg = typeof errData === 'string' ? errData : errData?.message || 'Order placement failed';
        showToast(errorMsg, 'error');
        voiceAlert.speak('Order execution failed', 'warning');
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleSquareOffPosition = async (symbolToClose = null) => {
    try {
      const res = await terminalAPI.squareOff(symbolToClose);
      showToast(res.data?.message || 'Positions squared off', 'success');
      voiceAlert.speak('Position squared off', 'normal');
      fetchPositions();
      fetchOrders();
      fetchTradeMindPlan();
    } catch (err) {
      showToast('Square off failed', 'error');
    }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      await terminalAPI.cancelOrder(orderId);
      showToast('Order cancelled', 'info');
      fetchOrders();
    } catch (err) {
      showToast('Failed to cancel order', 'error');
    }
  };

  // Active Symbol Details
  const activeInst = watchlist.find((w) => w.symbol === activeSymbol) || {
    symbol: activeSymbol,
    name: activeSymbol,
    ltp: 0,
    change: 0,
    change_percent: 0,
    high: 0,
    low: 0,
    open: 0,
    close: 0,
    lot_size: 1,
  };

  const isReal = brokerConfig?.trading_mode === 'REAL';
  const openPositions = positions.filter((p) => p.status === 'OPEN' && p.quantity !== 0);
  const totalMtm = openPositions.reduce((acc, p) => acc + (p.total_pnl || 0), 0);

  // Filtered Watchlist
  const filteredWatchlist = watchlist.filter((inst) => {
    const matchesSearch =
      inst.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterSegment === 'INDICES') return inst.segment === 'INDICES';
    if (filterSegment === 'NSE_EQ') return inst.segment === 'NSE_EQ';
    return true;
  });

  return (
    <div
      className="terminal-viewport-lock"
      style={{
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        background: '#070b14',
        color: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ─── 1. TOP HEADER CONTROL BAR (STATIC PINNED) ─────────────────── */}
      <header
        style={{
          height: '48px',
          flexShrink: 0,
          background: 'rgba(11, 17, 33, 0.98)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 1000,
        }}
      >
        {/* Brand & Mode Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.35)',
              }}
            >
              ⚡
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em', color: '#f8fafc' }}>
              Trade<span style={{ color: '#f59e0b' }}>Live</span>
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '6px', fontWeight: 600 }}>TERMINAL</span>
            </span>
          </div>

          {/* Mode Pill Toggle Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Click to configure Paper or Zerodha Kite broker"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '99px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: `1px solid ${isReal ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
              background: isReal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: isReal ? '#34d399' : '#60a5fa',
              transition: 'all 0.2s',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: isReal ? '#10b981' : '#3b82f6',
                boxShadow: `0 0 8px ${isReal ? '#10b981' : '#3b82f6'}`,
              }}
            />
            {isReal ? 'ZERODHA LIVE' : 'PAPER TRADING'}
            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>⚙️</span>
          </button>
        </div>

        {/* TradeMind Discipline HUD Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }} className="hide-on-mobile">
          {hasDailyPlan === false ? (
            <Link
              to="/daily-plan"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                fontSize: '0.75rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <span>⚠️</span>
              <span>No Daily Plan Set — Set Today's Plan →</span>
            </Link>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
              <span style={{ color: '#94a3b8' }}>Trades:</span>
              <span
                style={{
                  fontWeight: 700,
                  color: planStats.tradeCount >= planStats.maxTrades ? '#ef4444' : '#38bdf8',
                }}
              >
                {planStats.tradeCount} / {planStats.maxTrades}
              </span>
            </div>
          )}

          <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.1)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
            <span style={{ color: '#94a3b8' }}>Live MTM:</span>
            <span
              style={{
                fontWeight: 800,
                color: totalMtm >= 0 ? '#10b981' : '#ef4444',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              ₹{totalMtm >= 0 ? `+${totalMtm.toFixed(2)}` : totalMtm.toFixed(2)}
            </span>
          </div>

          <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.1)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
            <span style={{ color: '#94a3b8' }}>Loss Buffer:</span>
            <span style={{ fontWeight: 700, color: '#f59e0b' }}>
              ₹{Math.max(planStats.maxLoss - planStats.totalLoss, 0).toFixed(0)}
            </span>
          </div>
        </div>

        {/* Actions: Settings & Exit Terminal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚙️</span> Broker Setup
          </button>

          <Link
            to="/"
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.2))',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              color: '#93c5fd',
              fontSize: '0.8rem',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <span>←</span> Back to TradeMind OS
          </Link>
        </div>
      </header>

      {/* ─── 2. MAIN 3-COLUMN WORKSPACE ─────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '280px 1fr 340px',
          overflow: 'hidden',
        }}
      >
        {/* ── COLUMN A: MARKET WATCHLIST ───────────────────────────────── */}
        <div
          style={{
            height: '100%',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(10, 15, 28, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Watchlist Search & Filter */}
          <div style={{ flexShrink: 0, padding: '10px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <input
              type="text"
              placeholder="Search symbol (e.g. NIFTY, RELIANCE)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '7px 10px',
                color: '#f8fafc',
                fontSize: '0.78rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
              {['ALL', 'INDICES', 'NSE_EQ'].map((seg) => (
                <button
                  key={seg}
                  onClick={() => setFilterSegment(seg)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    borderRadius: '4px',
                    border: 'none',
                    background: filterSegment === seg ? '#2563eb' : 'rgba(255, 255, 255, 0.03)',
                    color: filterSegment === seg ? '#ffffff' : '#94a3b8',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {seg === 'NSE_EQ' ? 'STOCKS' : seg}
                </button>
              ))}
            </div>
          </div>

          {/* Watchlist Items */}
          <div className="terminal-scrollbar" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {filteredWatchlist.map((inst) => {
              const isSelected = inst.symbol === activeSymbol;
              const isPositive = inst.change >= 0;

              return (
                <div
                  key={inst.symbol}
                  onClick={() => setActiveSymbol(inst.symbol)}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                    borderLeft: `3px solid ${isSelected ? '#3b82f6' : 'transparent'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#f8fafc' }}>
                      {inst.symbol}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      {inst.segment} • Lot: {inst.lot_size}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        color: isPositive ? '#10b981' : '#ef4444',
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      ₹{inst.ltp.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: isPositive ? '#34d399' : '#f87171' }}>
                      {isPositive ? '+' : ''}{inst.change.toFixed(2)} ({isPositive ? '+' : ''}{inst.change_percent.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COLUMN B: CENTER WORKSPACE (INTERACTIVE CHART + POSITIONS DOCK) ── */}
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
            background: '#070b14',
          }}
        >
          {/* Top: Interactive Canvas Financial Chart */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', display: 'flex' }}>
            <InteractiveChart
              symbol={activeInst.symbol}
              timeframe={timeframe}
              setTimeframe={setTimeframe}
              candles={chartCandles}
              ltp={activeInst.ltp}
              change={activeInst.change}
              changePercent={activeInst.change_percent}
              isLoading={chartLoading}
              onApplyPositionLevels={handleApplyPositionLevels}
            />
          </div>

          {/* Bottom Dock: Positions / Orders / Sync */}
          <div
            style={{
              height: '210px',
              flexShrink: 0,
              background: 'rgba(8, 12, 22, 0.98)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Tab Headers */}
            <div
              style={{
                flexShrink: 0,
                padding: '0 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(13, 19, 34, 0.6)',
              }}
            >
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { id: 'positions', label: `Positions (${openPositions.length})` },
                  { id: 'orders', label: `Orders (${orders.length})` },
                  { id: 'synclog', label: 'TradeMind Sync Stream' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveBottomTab(tab.id)}
                    style={{
                      padding: '8px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: `2px solid ${activeBottomTab === tab.id ? '#3b82f6' : 'transparent'}`,
                      color: activeBottomTab === tab.id ? '#38bdf8' : '#94a3b8',
                      fontSize: '0.78rem',
                      fontWeight: activeBottomTab === tab.id ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Square Off All Button */}
              {openPositions.length > 0 && (
                <button
                  onClick={() => handleSquareOffPosition(null)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#fca5a5',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Square Off All Positions
                </button>
              )}
            </div>

            {/* Tab Contents */}
            <div className="terminal-scrollbar" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '0 16px' }}>
              {activeBottomTab === 'positions' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <th style={{ padding: '8px 6px' }}>Product</th>
                      <th style={{ padding: '8px 6px' }}>Symbol</th>
                      <th style={{ padding: '8px 6px' }}>Qty</th>
                      <th style={{ padding: '8px 6px' }}>Buy Avg</th>
                      <th style={{ padding: '8px 6px' }}>LTP</th>
                      <th style={{ padding: '8px 6px' }}>P&L (MTM)</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '24px 0', textAlign: 'center', color: '#64748b' }}>
                          No open positions currently. Place an order above to begin trading.
                        </td>
                      </tr>
                    ) : (
                      openPositions.map((pos) => {
                        const isProfit = pos.total_pnl >= 0;
                        return (
                          <tr key={pos.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '8px 6px' }}>
                              <span style={{ padding: '2px 4px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
                                {pos.product}
                              </span>
                            </td>
                            <td style={{ padding: '8px 6px', fontWeight: 700, color: '#f8fafc' }}>
                              {pos.symbol}
                            </td>
                            <td style={{ padding: '8px 6px', color: pos.quantity > 0 ? '#34d399' : '#f87171' }}>
                              {pos.quantity}
                            </td>
                            <td style={{ padding: '8px 6px', color: '#cbd5e1' }}>
                              ₹{pos.buy_avg_price.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 6px', color: '#cbd5e1' }}>
                              ₹{pos.ltp.toFixed(2)}
                            </td>
                            <td
                              style={{
                                padding: '8px 6px',
                                fontWeight: 800,
                                color: isProfit ? '#10b981' : '#ef4444',
                                fontFamily: "'Space Grotesk', sans-serif",
                              }}
                            >
                              ₹{isProfit ? `+${pos.total_pnl.toFixed(2)}` : pos.total_pnl.toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleSquareOffPosition(pos.symbol)}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#fca5a5',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Exit
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {activeBottomTab === 'orders' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <th style={{ padding: '8px 6px' }}>Time</th>
                      <th style={{ padding: '8px 6px' }}>Type</th>
                      <th style={{ padding: '8px 6px' }}>Symbol</th>
                      <th style={{ padding: '8px 6px' }}>Product</th>
                      <th style={{ padding: '8px 6px' }}>Qty</th>
                      <th style={{ padding: '8px 6px' }}>Price</th>
                      <th style={{ padding: '8px 6px' }}>Status</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ padding: '24px 0', textAlign: 'center', color: '#64748b' }}>
                          No orders placed today.
                        </td>
                      </tr>
                    ) : (
                      orders.map((ord) => (
                        <tr key={ord.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '8px 6px', color: '#94a3b8' }}>
                            {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '8px 6px', fontWeight: 700, color: ord.transaction_type === 'BUY' ? '#34d399' : '#f87171' }}>
                            {ord.transaction_type}
                          </td>
                          <td style={{ padding: '8px 6px', fontWeight: 600, color: '#f8fafc' }}>
                            {ord.symbol}
                          </td>
                          <td style={{ padding: '8px 6px', color: '#cbd5e1' }}>{ord.product}</td>
                          <td style={{ padding: '8px 6px', color: '#cbd5e1' }}>{ord.quantity}</td>
                          <td style={{ padding: '8px 6px', color: '#cbd5e1' }}>₹{ord.average_price?.toFixed(2) || ord.price?.toFixed(2)}</td>
                          <td style={{ padding: '8px 6px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                background:
                                  ord.status === 'COMPLETE'
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : ord.status === 'OPEN'
                                      ? 'rgba(59, 130, 246, 0.15)'
                                      : 'rgba(239, 68, 68, 0.15)',
                                color:
                                  ord.status === 'COMPLETE'
                                    ? '#34d399'
                                    : ord.status === 'OPEN'
                                      ? '#60a5fa'
                                      : '#fca5a5',
                              }}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                            {ord.status === 'OPEN' && (
                              <button
                                onClick={() => handleCancelOrder(ord.id)}
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#f87171',
                                  fontSize: '0.68rem',
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeBottomTab === 'synclog' && (
                <div style={{ padding: '12px 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', fontWeight: 600, marginBottom: '8px' }}>
                    <span>🔄</span> Automatic 2-Way TradeMind OS Sync Stream
                  </div>
                  <p style={{ margin: '0 0 10px', lineHeight: 1.4 }}>
                    Every order executed in TradeLive Terminal automatically logs as a trade in your TradeMind OS journal.
                    Live P&L, consecutive losses, and rule violations immediately feed into the TradeMind AI Coach bot.
                  </p>
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    • Connected to Database: <code>trademind.db</code><br />
                    • Active Mode: <b>{isReal ? 'Zerodha Kite Connect v3 (Real Orders)' : 'Paper Trading (Local Matcher)'}</b><br />
                    • Trade Count Today: <b>{planStats.tradeCount} / {planStats.maxTrades}</b><br />
                    • Today's Recorded P&L: <b>₹{planStats.pnlToday.toFixed(2)}</b>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── COLUMN C: FAST ORDER EXECUTION PAD ────────────────────────── */}
        <div
          style={{
            height: '100%',
            borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(11, 16, 30, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Order Pad Header */}
          <div
            style={{
              flexShrink: 0,
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#f8fafc' }}>
              Order Pad ({activeInst.symbol})
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isReal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                color: isReal ? '#34d399' : '#60a5fa',
                fontWeight: 700,
              }}
            >
              {isReal ? 'ZERODHA' : 'PAPER'}
            </span>
          </div>

          <div className="terminal-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {/* BUY / SELL Switch */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <button
                type="button"
                onClick={() => setTxnType('BUY')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: txnType === 'BUY' ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                  color: txnType === 'BUY' ? '#ffffff' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: txnType === 'BUY' ? '0 0 14px rgba(16, 185, 129, 0.35)' : 'none',
                }}
              >
                BUY / LONG
              </button>
              <button
                type="button"
                onClick={() => setTxnType('SELL')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: txnType === 'SELL' ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
                  color: txnType === 'SELL' ? '#ffffff' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: txnType === 'SELL' ? '0 0 14px rgba(239, 68, 68, 0.35)' : 'none',
                }}
              >
                SELL / SHORT
              </button>
            </div>

            {/* Product: MIS vs CNC */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {['MIS', 'CNC'].map((prod) => (
                <button
                  key={prod}
                  type="button"
                  onClick={() => setProductType(prod)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: productType === prod ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    color: productType === prod ? '#60a5fa' : '#94a3b8',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {prod === 'MIS' ? 'Intraday (MIS)' : 'Delivery (CNC)'}
                </button>
              ))}
            </div>

            {/* Order Type: MARKET vs LIMIT vs SL */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {['MARKET', 'LIMIT', 'SL'].map((ot) => (
                <button
                  key={ot}
                  type="button"
                  onClick={() => setOrderType(ot)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: orderType === ot ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    color: orderType === ot ? '#ffffff' : '#94a3b8',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {ot}
                </button>
              ))}
            </div>

            {/* Quantity input & Lot shortcuts */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.75rem' }}>
                <span style={{ color: '#94a3b8' }}>Quantity (Lots of {activeInst.lot_size})</span>
                <span style={{ color: '#64748b' }}>
                  Total: {quantity} shares
                </span>
              </div>
              <input
                type="number"
                min={activeInst.lot_size || 1}
                step={activeInst.lot_size || 1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                {[1, 2, 5, 10].map((mult) => (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => setQuantity((activeInst.lot_size || 1) * mult)}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      color: '#94a3b8',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                    }}
                  >
                    {mult}x Lot
                  </button>
                ))}
              </div>
            </div>

            {/* Limit Price */}
            {(orderType === 'LIMIT' || orderType === 'SL') && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Limit Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder={activeInst.ltp?.toFixed(2)}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Trigger Price for SL */}
            {orderType === 'SL' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Trigger Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  placeholder={activeInst.ltp?.toFixed(2)}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Stop Loss & Target inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.72rem', color: '#f87171' }}>
                  Stop Loss (SL ₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  placeholder="Optional"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.72rem', color: '#34d399' }}>
                  Target (TP ₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  placeholder="Optional"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(16, 185, 129, 0.06)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Estimated Margin Required */}
            <div
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                marginBottom: '16px',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Est. Margin:</span>
                <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                  ₹{((quantity * (activeInst.ltp || 1)) / (productType === 'MIS' ? 5 : 1)).toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Available:</span>
                <span style={{ color: '#34d399', fontWeight: 600 }}>
                  ₹{(brokerConfig?.paper_balance || 100000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Daily Plan Missing Warning Banner */}
            {hasDailyPlan === false && (
              <div
                style={{
                  marginBottom: '10px',
                  padding: '8px 10px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.74rem',
                  color: '#fbbf24',
                  lineHeight: 1.3,
                }}
              >
                <span>⚠️</span>
                <span>
                  <strong>No Daily Plan Set:</strong> TradeMind requires today's plan before punching trades.
                </span>
              </div>
            )}

            {/* Place Order CTA Button */}
            <button
              type="button"
              onClick={() => handleExecuteOrder(false)}
              disabled={isPlacingOrder}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: hasDailyPlan === false ? '1px solid #f59e0b' : 'none',
                background:
                  hasDailyPlan === false
                    ? 'linear-gradient(135deg, #b45309, #d97706)'
                    : txnType === 'BUY'
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: isPlacingOrder ? 'not-allowed' : 'pointer',
                opacity: isPlacingOrder ? 0.7 : 1,
                boxShadow:
                  hasDailyPlan === false
                    ? '0 4px 16px rgba(245, 158, 11, 0.35)'
                    : txnType === 'BUY'
                      ? '0 4px 16px rgba(16, 185, 129, 0.35)'
                      : '0 4px 16px rgba(239, 68, 68, 0.35)',
              }}
            >
              {isPlacingOrder
                ? 'Routing Order...'
                : hasDailyPlan === false
                  ? '📋 Set Daily Plan to Punch Trade'
                  : `${txnType} ${quantity} ${activeInst.symbol} (${orderType})`}
            </button>
          </div>
        </div>
      </div>

      {/* ─── 4. DISCIPLINE INTERCEPT MODAL ──────────────────────────────── */}
      {riskAlertModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10060,
            background: 'rgba(2, 6, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              background: '#0d1424',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.3)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🛑</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800, color: '#f87171' }}>
              {riskAlertModal.title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '22px' }}>
              {riskAlertModal.message}
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              {riskAlertModal.actionLabel ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const proceed = riskAlertModal.onProceed;
                      setRiskAlertModal(null);
                      if (proceed) proceed();
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                    }}
                  >
                    {riskAlertModal.actionLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskAlertModal(null)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'transparent',
                      color: '#94a3b8',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setRiskAlertModal(null)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Respect Rule & Stop
                  </button>
                  {riskAlertModal.canOverride && (
                    <button
                      type="button"
                      onClick={riskAlertModal.onProceed}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        background: 'transparent',
                        color: '#fca5a5',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Override Risk Gate
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 5. BROKER SETTINGS MODAL ───────────────────────────────────── */}
      <BrokerSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigUpdated={() => {
          fetchBrokerConfig();
        }}
      />

      {/* ─── 6. TOAST NOTIFICATION ──────────────────────────────────────── */}
      {toast.show && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 10070,
            padding: '12px 18px',
            borderRadius: '10px',
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#3b82f6',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.84rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>{toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✅' : 'ℹ️'}</span>
          {toast.text}
        </div>
      )}
    </div>
  );
}
