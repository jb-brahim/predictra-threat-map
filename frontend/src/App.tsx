import { useEffect } from 'react';
import { GlobeScene } from './globe/GlobeScene';
import { Sidebar } from './ui/Sidebar';
import { StatusBar } from './ui/StatusBar';
import { PerfOverlay } from './ui/PerfOverlay';
import { HistoryPage } from './ui/HistoryPage';
import { DashboardPage } from './ui/DashboardPage';
import { useStreamStore } from './stream/useStreamStore';
import './index.css';

function App() {
  const initStream = useStreamStore(s => s.initStream);
  const currentView = useStreamStore(s => s.currentView);

  useEffect(() => {
    // Check reduced motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      useStreamStore.getState().setConfig('reducedMotion', true);
      useStreamStore.getState().setConfig('rotation', false);
      useStreamStore.getState().setConfig('trails', false);
    }

    // Initialize stream
    initStream();

    return () => {
      const cleanup = useStreamStore.getState()._cleanup;
      if (cleanup) cleanup();
    };
  }, [initStream]);

  return (
    <>
      {/* Full-screen 3D Globe - only active in map view */}
      {currentView === 'map' && <GlobeScene />}

      {/* History Page overlay */}
      {currentView === 'history' && <HistoryPage />}

      {/* Dashboard Page overlay */}
      {currentView === 'dashboard' && <DashboardPage />}

      {/* Background grid overlay */}
      <div className="grid-overlay" />

      {/* UI Panels */}
      <StatusBar />
      <Sidebar />
      <PerfOverlay />

      {/* Scan line effect */}
      <div className="scan-line" />
    </>
  );
}

export default App;
