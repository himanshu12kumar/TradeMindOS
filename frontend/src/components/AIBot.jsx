import React, { useState, useEffect, useRef } from 'react';
import { aiAPI } from '../api/client';
import voiceAlert from '../services/VoiceAlert';
import notificationService from '../services/NotificationService';

export default function AIBot({ monitorStats }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(voiceAlert.getEnabled());
  const [language, setLanguage] = useState(voiceAlert.getLanguage() || 'en');
  const [notifGranted, setNotifGranted] = useState(notificationService.hasPermission());
  const [briefingLoaded, setBriefingLoaded] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Load initial greeting or morning briefing in active language
  useEffect(() => {
    const token = localStorage.getItem('tm_token');
    if (!token || briefingLoaded) return;

    aiAPI
      .dailyBriefing(language)
      .then((res) => {
        const briefingText = res.data?.briefing;
        if (briefingText) {
          setMessages([
            {
              id: 'init-1',
              role: 'assistant',
              content: briefingText,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
          setBriefingLoaded(true);
        }
      })
      .catch(() => {
        setMessages([
          {
            id: 'init-fallback',
            role: 'assistant',
            content:
              language === 'hi'
                ? '👋 नमस्ते ट्रेडर। मैं आपका TradeMind AI Coach हूँ। मेरा काम आपको अनुशासित रखना, रिवेंज ट्रेडिंग रोकना और आपके नियम लागू करना है। अभी आप कैसा महसूस कर रहे हैं?'
                : '👋 Hello Trader. I am your TradeMind AI Coach. My primary job is keeping you disciplined, preventing revenge trades, and enforcing your daily rules. How are you feeling right now?',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        setBriefingLoaded(true);
      });
  }, [briefingLoaded, language]);

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    voiceAlert.setEnabled(next);
    setVoiceEnabled(next);
    if (!next) {
      voiceAlert.stop();
      setIsSpeaking(false);
    }
  };

  const handleToggleLanguage = () => {
    const nextLang = language === 'en' ? 'hi' : 'en';
    setLanguage(nextLang);
    voiceAlert.setLanguage(nextLang);

    // Fetch new briefing in target language and post notification message
    aiAPI
      .dailyBriefing(nextLang)
      .then((res) => {
        const briefingText = res.data?.briefing;
        setMessages((prev) => [
          ...prev,
          {
            id: `lang-change-${Date.now()}`,
            role: 'assistant',
            content:
              nextLang === 'hi'
                ? `🇮🇳 भाषा बदलकर हिंदी कर दी गई है। वॉइस और चैट अब हिंदी में होंगे।\n\n${briefingText || ''}`
                : `🇬🇧 Language switched to English. Voice and chat are now in English.\n\n${briefingText || ''}`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `lang-change-${Date.now()}`,
            role: 'assistant',
            content:
              nextLang === 'hi'
                ? '🇮🇳 भाषा बदलकर हिंदी कर दी गई है।'
                : '🇬🇧 Language switched to English.',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      });
  };

  const handleRequestNotif = async () => {
    const res = await notificationService.requestPermission();
    setNotifGranted(res === 'granted');
    if (res === 'granted') {
      notificationService.notify(
        language === 'hi' ? 'TradeMind AI Coach सक्रिय है' : 'TradeMind AI Coach Active',
        {
          body:
            language === 'hi'
              ? 'नियम या ट्रेड लिमिट टूटने पर आपको बैकग्राउंड में अलर्ट प्राप्त होंगे।'
              : 'You will receive background alerts if rules or trade limits are violated.',
        }
      );
    }
  };

  const handleSendMessage = async (textToSend) => {
    const msg = (textToSend || inputMessage).trim();
    if (!msg || isLoading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await aiAPI.chat({
        message: msg,
        history: historyPayload,
        language,
      });

      const reply =
        res.data?.reply ||
        (language === 'hi'
          ? 'अनुशासित रहिए और अपने प्लान का पालन कीजिए।'
          : 'Stay disciplined and follow your plan.');

      const coachMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, coachMsg]);

      // Speak if voice enabled
      if (voiceEnabled) {
        setIsSpeaking(true);
        voiceAlert.speak(reply, 'normal', language);
        setTimeout(() => setIsSpeaking(false), 4000);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            language === 'hi'
              ? '⚠️ AI सर्वर से संपर्क नहीं हो सका। कृपया अपना कनेक्शन जांचें।'
              : '⚠️ Unable to connect to AI server. Please check your backend connection.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeakMessage = (content) => {
    if (voiceAlert.isSupported()) {
      setIsSpeaking(true);
      voiceAlert.speak(content, 'normal', language);
      setTimeout(() => setIsSpeaking(false), 3000);
    }
  };

  const promptChips =
    language === 'hi'
      ? ['क्या ट्रेड लूँ?', 'रिवेंज ट्रेड चेक', 'आज का हाल', 'दिमाग शांत करो']
      : ['Should I trade?', 'Am I revenge trading?', 'Review today', 'Calm me down'];

  return (
    <>
      {/* ─── Floating Trigger Button ────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
        }}
      >
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 18px',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.25)',
              color: '#f8fafc',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
              e.currentTarget.style.boxShadow =
                '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 22px rgba(56, 189, 248, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow =
                '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.25)';
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 0 10px rgba(56, 189, 248, 0.6)',
              }}
            >
              🤖
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.3px' }}>
                TradeMind Coach
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: monitorStats?.isLimitReached ? '#ef4444' : '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: monitorStats?.isLimitReached ? '#ef4444' : '#22c55e',
                    display: 'inline-block',
                  }}
                />
                {monitorStats?.isLimitReached
                  ? (language === 'hi' ? 'लिमिट पूरी' : 'Limit Reached')
                  : `${monitorStats?.tradeCount || 0}/${monitorStats?.maxTrades || 3} ${
                      language === 'hi' ? 'ट्रेड्स' : 'Trades'
                    }`}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* ─── Expanded Chat Drawer ───────────────────────────────────────── */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '390px',
            maxWidth: 'calc(100vw - 48px)',
            height: '570px',
            maxHeight: 'calc(100vh - 64px)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '20px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.2)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 18px',
              background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0284c7, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  boxShadow: '0 0 12px rgba(56, 189, 248, 0.5)',
                }}
              >
                🤖
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc' }}>
                  TradeMind Coach
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
                  {language === 'hi' ? 'सक्रिय अनुशासन संरक्षक' : 'Active Discipline Guardian'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Language toggle: EN / HI */}
              <button
                onClick={handleToggleLanguage}
                title={language === 'en' ? 'Switch to Hindi (हिंदी)' : 'Switch to English'}
                style={{
                  background: language === 'hi' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                  border: `1px solid ${
                    language === 'hi' ? 'rgba(249, 115, 22, 0.5)' : 'rgba(56, 189, 248, 0.4)'
                  }`,
                  color: language === 'hi' ? '#fb923c' : '#38bdf8',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '700',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                {language === 'hi' ? '🇮🇳 HI' : '🇬🇧 EN'}
              </button>

              {/* Voice toggle */}
              <button
                onClick={handleToggleVoice}
                title={voiceEnabled ? 'Mute Voice Alerts' : 'Enable Voice Alerts'}
                style={{
                  background: voiceEnabled ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${voiceEnabled ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                  color: voiceEnabled ? '#38bdf8' : '#64748b',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  lineHeight: 1,
                }}
              >
                {voiceEnabled ? '🔊' : '🔇'}
              </button>

              {/* Notification toggle */}
              {!notifGranted && (
                <button
                  onClick={handleRequestNotif}
                  title="Enable Browser Push Notifications"
                  style={{
                    background: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
                    color: '#eab308',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    lineHeight: 1,
                  }}
                >
                  🔔
                </button>
              )}

              {/* Close / minimize */}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '6px',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Context Banner */}
          <div
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
            }}
          >
            <span style={{ color: '#94a3b8' }}>
              {language === 'hi' ? 'आज की ट्रेड्स' : 'Trades Today'}:{' '}
              <strong style={{ color: monitorStats?.isLimitReached ? '#ef4444' : '#38bdf8' }}>
                {monitorStats?.tradeCount || 0} / {monitorStats?.maxTrades || 3}
              </strong>
            </span>
            <span style={{ color: '#94a3b8' }}>
              {language === 'hi' ? 'लॉस' : 'Loss'}:{' '}
              <strong style={{ color: monitorStats?.isLossBreached ? '#ef4444' : '#e2e8f0' }}>
                ₹{monitorStats?.totalLoss?.toFixed(0) || 0} / ₹{monitorStats?.maxLoss || 1000}
              </strong>
            </span>
          </div>

          {/* Quick Prompt Chips */}
          <div
            style={{
              padding: '8px 12px',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              scrollbarWidth: 'none',
            }}
          >
            {promptChips.map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(chip)}
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  color: '#bae6fd',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.08)')}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      backgroundColor: isUser ? '#0284c7' : 'rgba(30, 41, 59, 0.85)',
                      border: isUser ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '13px',
                      lineHeight: '1.45',
                      wordBreak: 'break-word',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {msg.content}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '4px',
                      fontSize: '10px',
                      color: '#64748b',
                    }}
                  >
                    <span>{msg.time}</span>
                    {!isUser && (
                      <button
                        onClick={() => handleSpeakMessage(msg.content)}
                        title={language === 'hi' ? 'यह संदेश सुनें' : 'Speak this message'}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '11px',
                        }}
                      >
                        🔊
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: '16px 16px 16px 4px',
                  backgroundColor: 'rgba(30, 41, 59, 0.85)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  fontSize: '12px',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{language === 'hi' ? 'अनुशासन के साथ विचार कर रहा हूँ' : 'Thinking with discipline'}</span>
                <span style={{ animation: 'pulse 1s infinite' }}>...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            style={{
              padding: '12px',
              backgroundColor: 'rgba(15, 23, 42, 0.98)',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                language === 'hi'
                  ? 'अनुशासन, सेटअप या साइकोलॉजी पर कुछ भी पूछें...'
                  : 'Ask your coach anything...'
              }
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#38bdf8')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)')}
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                background: inputMessage.trim()
                  ? 'linear-gradient(135deg, #0284c7, #38bdf8)'
                  : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '13px',
                cursor: inputMessage.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {language === 'hi' ? 'भेजें' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
