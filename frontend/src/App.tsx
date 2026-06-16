import { useEffect } from 'react';

// Import UI layout panels and view screens
import { Sidebar } from './ui/Sidebar';
import { StatusBar } from './ui/StatusBar';
import { PerfOverlay } from './ui/PerfOverlay';
import { HistoryPage } from './ui/HistoryPage';
import { DashboardPage } from './ui/DashboardPage';
import { CountryDashboard } from './ui/CountryDashboard';
import { AnalyticsPage } from './ui/AnalyticsPage';
import { StixDashboard } from './ui/StixDashboard';

// Import the central state store (Zustand)
import { useStreamStore } from './stream/useStreamStore';
import './index.css';

/**
 * Root Application Component
 * Sets up state connections, monitors device animation configurations,
 * and routes views based on the store's current active layout navigation parameter.
 */
function App() {
  // Extract actions and states from Zustand store using selectors (optimizes re-renders)
  const initStream = useStreamStore(s => s.initStream);
  const currentView = useStreamStore(s => s.currentView);

  useEffect(() => {
    // 1. Accessibility Guard: Check if the user's OS has "Reduce Motion" turned on.
    // If enabled, automatically disable globe auto-rotation and trails to prevent motion sickness.
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      useStreamStore.getState().setConfig('reducedMotion', true);
      useStreamStore.getState().setConfig('rotation', false);
      useStreamStore.getState().setConfig('trails', false);
    }

    // 2. Stream Startup: Connect to the backend Server-Sent Events (SSE) `/api/feed` stream.
    initStream();

    // 3. Cleanup: Tear down active SSE listeners when App unmounts to prevent memory leaks.
    return () => {
      const cleanup = useStreamStore.getState()._cleanup;
      if (cleanup) cleanup();
    };
  }, [initStream]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#050B14', overflow: 'hidden' }}>
      
      {/* Top Status Bar: Displays server health, connection status, global counter metrics */}
      <StatusBar />
      
      <div style={{ display: 'flex', flex: 1, marginTop: 64, overflow: 'hidden' }}>
        
        {/* Sidebar Navigation: Only show when not in full-screen/hud view modes ('stix', 'map', 'dashboard') */}
        {currentView !== 'stix' && currentView !== 'map' && currentView !== 'dashboard' && <Sidebar />}
        
        {/* Main View Router Panel */}
        <div style={{ flex: 1, position: 'relative', overflowY: 'auto', padding: currentView === 'stix' || currentView === 'map' || currentView === 'dashboard' ? '0' : '24px' }}>
          {/* Render Dashboard Page (handles both 3D visualizer globe hud and flat tactical view charts) */}
          {(currentView === 'map' || currentView === 'dashboard') && <DashboardPage />}
          
          {/* Render historical searchable database lists */}
          {currentView === 'history' && <HistoryPage />}
          
          {/* Render focused security metrics of a selected country */}
          {currentView === 'country' && <CountryDashboard />}
          
          {/* Render heatmaps and matrices timeline pages */}
          {currentView === 'analytics' && <AnalyticsPage />}
          
          {/* Render parsed STIX files and MITRE ATT&CK Kill Chain dashboards */}
          {currentView === 'stix' && <StixDashboard />}
        </div>
      </div>

      {/* Performance Overlay: Debug overlay showing current rendering frame rate (FPS), queue sizes, dropped logs */}
      <PerfOverlay />
    </div>
  );
}

export default App;
