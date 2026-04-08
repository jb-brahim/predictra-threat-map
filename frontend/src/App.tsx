import { useEffect } from 'react';

import { Sidebar } from './ui/Sidebar';
import { StatusBar } from './ui/StatusBar';
import { PerfOverlay } from './ui/PerfOverlay';
import { HistoryPage } from './ui/HistoryPage';
import { DashboardPage } from './ui/DashboardPage';
import { CountryDashboard } from './ui/CountryDashboard';
import { AnalyticsPage } from './ui/AnalyticsPage';
import { StixVisualizerPage } from './ui/StixVisualizerPage';
import { useStreamStore } from './stream/useStreamStore';
import './index.css';

// Assuming 'theme' is defined or imported elsewhere if used in inline styles.
// For this change, I will assume it's not needed as the instruction only shows a snippet.
// If the full context of the instruction implies a theme import, it would need to be added.

function App() {
  const initStream = useStreamStore(s => s.initStream);
  const currentView = useStreamStore(s => s.currentView);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#050B14', overflow: 'hidden' }}>
      <StatusBar />
      
      <div style={{ display: 'flex', flex: 1, marginTop: 64, overflow: 'hidden' }}>
        {currentView !== 'stix' && <Sidebar />}
        
        <div style={{ flex: 1, position: 'relative', overflowY: 'auto', padding: currentView === 'stix' ? '0' : '24px' }}>
          {(currentView === 'map' || currentView === 'dashboard') && <DashboardPage />}
          {currentView === 'history' && <HistoryPage />}
          {currentView === 'country' && <CountryDashboard />}
          {currentView === 'analytics' && <AnalyticsPage />}
          {currentView === 'stix' && <StixVisualizerPage />}
        </div>
      </div>

      <PerfOverlay />
    </div>
  );
}

export default App;
