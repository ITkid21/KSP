import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CrimeMap from './pages/CrimeMap';
import Analytics from './pages/Analytics';
import Predictions from './pages/Predictions';
import AIAnalyst from './pages/AIAnalyst';
import Reports from './pages/Reports';
import Admin from './pages/Admin';
import InvestigationCopilot from './pages/InvestigationCopilot';
import DataImport from './pages/DataImport';
import HotspotAnalytics from './pages/HotspotAnalytics';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ksp_token');
    const stored = localStorage.getItem('ksp_user');
    if (token && stored) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.clear(); }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('ksp_token', token);
    localStorage.setItem('ksp_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('ksp_token');
    localStorage.removeItem('ksp_user');
    setUser(null);
  };

  if (loading) return <div className="loading"><div className="spinner"></div>Loading...</div>;

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
          <Route index element={<Dashboard />} />
          <Route path="map" element={<CrimeMap />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="predictions" element={<Predictions />} />
          <Route path="ai-analyst" element={<AIAnalyst />} />
          <Route path="reports" element={<Reports />} />
          <Route path="copilot" element={<InvestigationCopilot user={user} />} />
          <Route path="hotspots" element={<HotspotAnalytics />} />
          {(user.role === 'super_admin' || user.role === 'ADMIN') && <Route path="admin" element={<Admin />} />}
          {(user.role === 'super_admin' || user.role === 'ADMIN') && <Route path="import" element={<DataImport user={user} />} />}
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
