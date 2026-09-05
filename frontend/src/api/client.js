import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8765';

const api = axios.create({ baseURL: API_BASE });

// ── Attach JWT on every request ──────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Global 401 handler ───────────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tm_token');
      localStorage.removeItem('tm_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ──────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (username, password) => {
    const form = new URLSearchParams();
    form.append('username', username);
    form.append('password', password);
    return api.post('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },
  me: () => api.get('/auth/me'),
};

// ─── Trading Plan ──────────────────────────────────────────────────
export const planAPI = {
  create: (data) => api.post('/plan', data),
  getToday: () => api.get('/plan/today'),
  update: (id, data) => api.put(`/plan/${id}`, data),
  lock: (id) => api.post(`/plan/${id}/lock`),
  list: () => api.get('/plan'),
};

// ─── Trades ────────────────────────────────────────────────────────
export const tradeAPI = {
  log: (data) => api.post('/trade', data),
  list: () => api.get('/trade'),
};

// ─── Trade History (V2) ────────────────────────────────────────────
export const historyAPI = {
  getTrades: (params = {}) => api.get('/history/trades', { params }),
  getTrade: (id) => api.get(`/history/trades/${id}`),
  updateExit: (id, exit_price, exit_reason) =>
    api.put(`/history/trades/${id}/exit`, null, { params: { exit_price, exit_reason } }),
  getStats: (params = {}) => api.get('/history/stats', { params }),
};

// ─── Insights (V2) ────────────────────────────────────────────────
export const insightsAPI = {
  emotionalCorrelation: (days = 90) => api.get('/insights/emotional-correlation', { params: { days } }),
  setupPerformance: (days = 90) => api.get('/insights/setup-performance', { params: { days } }),
  timeOfDay: (days = 90) => api.get('/insights/time-of-day', { params: { days } }),
  scoreTrend: (days = 30) => api.get('/insights/score-trend', { params: { days } }),
  emotionSummary: (days = 30) => api.get('/insights/emotion-summary', { params: { days } }),
};

// ─── Scores ────────────────────────────────────────────────────────
export const scoreAPI = {
  daily: (date) => api.get('/scores/daily', { params: date ? { target_date: date } : {} }),
  weekly: () => api.get('/scores/weekly'),
};

// ─── Behaviour Log ─────────────────────────────────────────────────
export const behaviourAPI = {
  list: (params = {}) => api.get('/behaviour-log', { params }),
  create: (data) => api.post('/behaviour-log', data),
  summary: (days = 7) => api.get('/behaviour-log/summary', { params: { days } }),
};

// ─── Settings (V2) ────────────────────────────────────────────────
export const settingsAPI = {
  getEmail: () => api.get('/settings/email'),
  updateEmail: (data) => api.put('/settings/email', data),
  testEmail: () => api.post('/settings/email/test'),
};

// ─── AI Coach (V2+) ───────────────────────────────────────────────
export const aiAPI = {
  preTradeCheck: (data) => api.post('/ai/pre-trade-check', data),
  chat: (data) => api.post('/ai/chat', data),
  dailyBriefing: (language = 'en') => api.get('/ai/daily-briefing', { params: { language } }),
  emotionalAlert: (data) => api.post('/ai/emotional-alert', data),
};

// ─── Live Trading Terminal & Broker (V2+) ─────────────────────────
export const terminalAPI = {
  getMarketWatch: () => api.get('/terminal/market-watch'),
  getChart: (symbol, timeframe = '5m') => api.get(`/terminal/chart/${encodeURIComponent(symbol)}`, { params: { timeframe } }),
  placeOrder: (data) => api.post('/terminal/orders', data),
  getOrders: () => api.get('/terminal/orders'),
  cancelOrder: (orderId) => api.delete(`/terminal/orders/${orderId}`),
  getPositions: () => api.get('/terminal/positions'),
  squareOff: (symbol = null) => api.post('/terminal/positions/square-off', { symbol }),
  getBrokerConfig: () => api.get('/terminal/broker-config'),
  updateBrokerConfig: (data) => api.post('/terminal/broker-config', data),
  exchangeKiteToken: (requestToken) => api.post('/terminal/broker-token', { request_token: requestToken }),
};

export default api;

