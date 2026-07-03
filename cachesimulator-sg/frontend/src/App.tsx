import { useEffect } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import SimulatorPage from './pages/SimulatorPage';
import HistoryPage from './pages/HistoryPage';
import ComparePage from './pages/ComparePage';
import './App.css';

export default function App() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <a href="/simulator" className="header-brand">
          <span className="header-icon">⚡</span>
          <div>
            <h1 className="header-title">
              Memory <span className="serif">Hierarchy</span> Lab
            </h1>
            <p className="header-sub">Interactive CPU Cache Simulator</p>
          </div>
        </a>
        <nav className="header-nav">
          <NavLink to="/simulator" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
            Simulator
          </NavLink>
          <NavLink to="/compare" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
            Compare
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
            History
          </NavLink>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/simulator" replace />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
    </div>
  );
}
