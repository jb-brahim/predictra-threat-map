import { useStreamStore } from '../stream/useStreamStore';
import { theme } from '../theme/theme';

export function Navbar() {
  const currentView = useStreamStore(s => s.currentView);
  const setView = useStreamStore(s => s.setView);
  const projectionMode = useStreamStore(s => s.projectionMode);
  const setProjectionMode = useStreamStore(s => s.setProjectionMode);

  const tabs = [
    { id: 'map', label: 'LIVE MAP' },
    { id: 'history', label: 'HISTORY' },
    { id: 'dashboard', label: 'DASHBOARD' },
  ] as const;

  return (
    <div style={{
      position: 'fixed',
      top: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      padding: '4px',
      background: 'rgba(10, 16, 24, 0.4)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0, 224, 255, 0.2)',
      borderRadius: '100px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 224, 255, 0.05)',
    }}>
      {tabs.map((tab) => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              position: 'relative',
              padding: '10px 28px',
              background: isActive ? 'rgba(0, 209, 255, 0.1)' : 'transparent',
              border: isActive ? '1px solid rgba(0, 209, 255, 0.4)' : '1px solid transparent',
              borderRadius: '100px',
              color: isActive ? '#fff' : theme.colors.textDim,
              fontFamily: theme.fonts.display,
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '1.5px',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseOver={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }
            }}
            onMouseOut={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = theme.colors.textDim;
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            {tab.label}
            {isActive && (
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '100px',
                boxShadow: '0 0 15px rgba(0, 209, 255, 0.2)',
                pointerEvents: 'none',
              }} />
            )}
          </button>
        );
      })}

      {/* Projection Toggle */}
      <div style={{
        height: '24px',
        width: '1px',
        background: 'rgba(255,255,255,0.1)',
        margin: '0 12px'
      }} />

      <button
        onClick={() => setProjectionMode(projectionMode === '3d' ? '2d' : '3d')}
        style={{
          padding: '8px 16px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '100px',
          color: '#fff',
          fontFamily: theme.fonts.display,
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '1px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.2s ease',
        }}
        onMouseOver={e => {
          e.currentTarget.style.background = 'rgba(0, 209, 255, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(0, 209, 255, 0.3)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}
      >
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: projectionMode === '3d' ? '#00D1FF' : '#fff',
          boxShadow: projectionMode === '3d' ? '0 0 8px #00D1FF' : 'none'
        }} />
        {projectionMode === '3d' ? '3D VIEW' : '2D FLAT'}
      </button>
    </div>
  );
}
