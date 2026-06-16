// ─── MAIN APPLICATION COMPONENT ──────────────────────────────────────────────
// Serves as the top-level container, orchestrating the global threat SSE stream,
// handling system accessibility options, and managing routing transitions.

import { useEffect } from 'react';

import { Sidebar } from './ui/Sidebar';
import { StatusBar } from './ui/StatusBar';
import { PerfOverlay } from './ui/PerfOverlay';
import { HistoryPage } from './ui/HistoryPage';
import { DashboardPage } from './ui/DashboardPage';
import { CountryDashboard } from './ui/CountryDashboard';
import { AnalyticsPage } from './ui/AnalyticsPage';
import { StixDashboard } from './ui/StixDashboard';
import { useStreamStore } from './stream/useStreamStore';
import './index.css';

function App() {
  const initStream = useStreamStore(s => s.initStream);
  const currentView = useStreamStore(s => s.currentView);

  // ─── INITIALIZATION LIFECYCLE ──────────────────────────────────────────────
  // Sets accessibility preferences based on OS configurations (e.g., disabling
  // rotation on reduced-motion requests) and starts/stops the EventSource stream.
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      useStreamStore.getState().setConfig('reducedMotion', true);
      useStreamStore.getState().setConfig('rotation', false);
      useStreamStore.getState().setConfig('trails', false);
    }
    initStream();
    return () => {
      const cleanup = useStreamStore.getState()._cleanup;
      if (cleanup) cleanup();
    };
  }, [initStream]);

  // ─── LAYOUT RENDERER ────────────────────────────────────────────────────────
  // Configures UI panels based on current active view context. Views like 'map',
  // 'stix', and 'dashboard' render full-screen widgets without standard sidebar templates.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#050B14', overflow: 'hidden' }}>
      <StatusBar />
      <div style={{ display: 'flex', flex: 1, marginTop: 64, overflow: 'hidden' }}>
        {currentView !== 'stix' && currentView !== 'map' && currentView !== 'dashboard' && <Sidebar />}
        
        <div style={{ flex: 1, position: 'relative', overflowY: 'auto', padding: currentView === 'stix' || currentView === 'map' || currentView === 'dashboard' ? '0' : '24px' }}>
          {(currentView === 'map' || currentView === 'dashboard') && <DashboardPage />}
          {currentView === 'history' && <HistoryPage />}
          {currentView === 'country' && <CountryDashboard />}
          {currentView === 'analytics' && <AnalyticsPage />}
          {currentView === 'stix' && <StixDashboard />}
        </div>
      </div>

      <PerfOverlay />
    </div>
  );
}

export default App;
