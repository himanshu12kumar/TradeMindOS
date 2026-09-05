import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import DailyPlan from './components/DailyPlan';
import TradeForm from './components/TradeForm';
import WeeklyReview from './components/WeeklyReview';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HistoryPage from './pages/HistoryPage';
import BehaviourPage from './pages/BehaviourPage';
import InsightsPage from './pages/InsightsPage';
import SettingsPage from './pages/SettingsPage';
import LiveTerminalPage from './pages/LiveTerminalPage';
import AIBot from './components/AIBot';
import useBotMonitor from './hooks/useBotMonitor';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const isTerminal = location.pathname === '/terminal';
  const monitorStats = useBotMonitor(user ? 25000 : null);

  return (
    <>
      {user && !isTerminal && <Navbar />}
      <Routes>
        {/* Auth pages */}
        <Route path="/login"    element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />

        {/* Core pages */}
        <Route path="/"       element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/plan"   element={<ProtectedRoute><DailyPlan /></ProtectedRoute>} />
        <Route path="/trade"  element={<ProtectedRoute><TradeForm /></ProtectedRoute>} />
        <Route path="/review" element={<ProtectedRoute><WeeklyReview /></ProtectedRoute>} />

        {/* Live Trading Terminal (Paper & Zerodha) */}
        <Route path="/terminal" element={<ProtectedRoute><LiveTerminalPage /></ProtectedRoute>} />

        {/* V2 pages */}
        <Route path="/history"   element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
        <Route path="/behaviour" element={<ProtectedRoute><BehaviourPage /></ProtectedRoute>} />
        <Route path="/insights"  element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
        <Route path="/settings"  element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {user && !isTerminal && <AIBot monitorStats={monitorStats} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </AuthProvider>
  );
}
