import { useEffect, useRef, useState } from 'react';
import { planAPI, tradeAPI } from '../api/client';
import voiceAlert from '../services/VoiceAlert';
import notificationService from '../services/NotificationService';

/**
 * Global hook to monitor trader behavior in the background.
 * Triggers voice alerts and browser push notifications when limits or rules are reached.
 */
export function useBotMonitor(intervalMs = 30000) {
  const [stats, setStats] = useState({
    tradeCount: 0,
    maxTrades: 3,
    totalLoss: 0,
    maxLoss: 1000,
    isLimitReached: false,
    isLossBreached: false,
  });

  const alertedRef = useRef(new Set());

  const checkStatus = async () => {
    const token = localStorage.getItem('tm_token');
    if (!token) return;

    try {
      const [planRes, tradesRes] = await Promise.allSettled([
        planAPI.getToday(),
        tradeAPI.list(),
      ]);

      const plan = planRes.status === 'fulfilled' ? planRes.value.data : null;
      const allTrades = tradesRes.status === 'fulfilled' ? tradesRes.value.data : [];

      if (!plan) return;

      const todayStr = new Date().toISOString().slice(0, 10);
      const todaysTrades = allTrades.filter((t) => {
        if (!t.created_at) return false;
        return t.created_at.startsWith(todayStr);
      });

      const tradeCount = todaysTrades.length;
      const maxTrades = plan.max_trades || 3;
      const maxLoss = plan.max_loss_amount || 1000;

      const losses = todaysTrades.filter((t) => t.pnl !== null && t.pnl < 0);
      const totalLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));

      const isLimitReached = tradeCount >= maxTrades;
      const isLossBreached = totalLoss >= maxLoss;

      setStats({
        tradeCount,
        maxTrades,
        totalLoss,
        maxLoss,
        isLimitReached,
        isLossBreached,
      });

      const currentLang = localStorage.getItem('tm_bot_lang') || 'en';
      const isHindi = currentLang === 'hi';

      // ── Trigger 1: Daily Trade Limit Hit ─────────────────────────────────
      const limitKey = `limit_${todayStr}_${tradeCount}`;
      if (isLimitReached && !alertedRef.current.has(limitKey)) {
        alertedRef.current.add(limitKey);
        const msg = isHindi
          ? `ट्रेडिंग रोकिए! आज आपकी ${maxTrades} ट्रेड की तय सीमा पूरी हो चुकी है। अपने नियमों का सम्मान करें और स्क्रीन बंद करें।`
          : `Trading halt! You have reached your limit of ${maxTrades} trades today. Your plan says stop. Respect your rules.`;
        voiceAlert.speak(msg, 'urgent', currentLang);
        notificationService.notify(
          isHindi ? '🛑 ट्रेड लिमिट पूरी — TradeMind OS' : '🛑 Trade Limit Reached — TradeMind OS',
          {
            body: isHindi
              ? `आपने आज की ${tradeCount}/${maxTrades} तय ट्रेड्स पूरी कर ली हैं। अब और ट्रेड न लें!`
              : `You've completed ${tradeCount}/${maxTrades} planned trades. Do not take any more trades today!`,
          }
        );
      }

      // ── Trigger 2: Max Loss Limit Breached ────────────────────────────────
      const lossKey = `loss_${todayStr}`;
      if (isLossBreached && !alertedRef.current.has(lossKey)) {
        alertedRef.current.add(lossKey);
        const msg = isHindi
          ? `इमरजेंसी स्टॉप! आज का अधिकतम लॉस लिमिट ${maxLoss.toFixed(0)} रुपये हिट हो चुका है। अपनी कैपिटल बचाइए और मार्केट से हट जाइए।`
          : `Emergency stop! You have hit your maximum daily loss limit of ${maxLoss.toFixed(0)} rupees. Step away from the market.`;
        voiceAlert.speak(msg, 'urgent', currentLang);
        notificationService.notify(
          isHindi ? '🛑 मैक्सिमम लॉस लिमिट हिट — TradeMind OS' : '🛑 Max Loss Breached — TradeMind OS',
          {
            body: isHindi
              ? `कुल लॉस ₹${totalLoss.toFixed(0)} हो चुका है (सीमा: ₹${maxLoss.toFixed(0)})। अपनी पूँजी सुरक्षित रखें!`
              : `Total loss reached ₹${totalLoss.toFixed(0)} (limit: ₹${maxLoss.toFixed(0)}). Protect your capital!`,
          }
        );
      }

      // ── Trigger 3: Revenge Trade Risk (2 consecutive losses) ──────────────
      if (todaysTrades.length >= 2) {
        const lastTwo = todaysTrades.slice(-2);
        const bothLosses = lastTwo.every((t) => t.pnl !== null && t.pnl < 0);
        const revengeKey = `revenge_${todayStr}_${lastTwo.map((t) => t.id).join('_')}`;

        if (bothLosses && !alertedRef.current.has(revengeKey)) {
          alertedRef.current.add(revengeKey);
          const msg = isHindi
            ? `सावधान! आपके पिछले दो ट्रेड में नुकसान हुआ है। यह रिवेंज ट्रेडिंग है, दिमाग शांत करने के लिए 15 मिनट का ब्रेक लें।`
            : `Caution! You just had two consecutive losses. Take a 15-minute break to clear your head. Do not revenge trade.`;
          voiceAlert.speak(msg, 'warning', currentLang);
          notificationService.notify(
            isHindi ? '⚠️ रिवेंज ट्रेड अलर्ट — TradeMind OS' : '⚠️ Revenge Trade Alert — TradeMind OS',
            {
              body: isHindi
                ? 'लगातार 2 लॉस डिटेक्ट हुए हैं। अगला ट्रेड सोचने से पहले स्क्रीन से हटिए।'
                : '2 losses in a row detected. Step away from the screen before considering another trade.',
            }
          );
        }
      }
    } catch (err) {
      // Background monitor silently continues
    }
  };

  useEffect(() => {
    if (!intervalMs) return;
    checkStatus();
    const interval = setInterval(checkStatus, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return stats;
}

export default useBotMonitor;
