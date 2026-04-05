import { useState, useRef, useEffect } from 'react';
import { useStreamStore } from '../stream/useStreamStore';
import { theme } from '../theme/theme';
import type { ConnectionStatus } from '../stream/types';

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    live: theme.colors.success,
    reconnecting: theme.colors.warning,
    paused: theme.colors.textDim,
    disconnected: theme.colors.danger,
  };
  const labels: Record<ConnectionStatus, string> = {
    live: 'LIVE',
    reconnecting: 'RECONNECTING',
    paused: 'PAUSED',
    disconnected: 'OFFLINE',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <div style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[status],
        boxShadow: `0 0 8px ${colors[status]}`,
        animation: status === 'live' ? 'pulse-dot 2s infinite' : 'none',
      }} />
      <span style={{
        fontSize: 10,
        fontFamily: theme.fonts.display,
        textTransform: 'uppercase',
        letterSpacing: 2,
        color: colors[status],
        fontWeight: 700,
      }}>
        {labels[status]}
      </span>
    </div>
  );
}

export function StatusBar() {
  const status = useStreamStore(s => s.status);
  const config = useStreamStore(s => s.config);
  const setConfig = useStreamStore(s => s.setConfig);
  
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
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2000,
      height: 64, // Fixed height for standard navbar
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'rgba(5, 8, 15, 0.75)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: `1px solid rgba(0, 224, 255, 0.1)`,
      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.5)',
    }}>
      {/* Left: Title + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 style={{
            fontSize: 18,
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            margin: 0,
            letterSpacing: 2,
            color: theme.colors.textPrimary,
          }}>
            THREAT MAP
          </h1>
          <span style={{
            fontSize: 9,
            fontFamily: theme.fonts.body,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            color: theme.colors.textDim,
          }}>
            Global Cyber Intelligence
          </span>
        </div>
        <StatusDot status={status} />
      </div>

      {/* Center: Main Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '100px',
        padding: '4px',
        flexShrink: 0,
      }}>
        {tabs.map((tab) => {
          const isActive = currentView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                position: 'relative',
                padding: '6px 20px',
                background: isActive ? 'rgba(0, 209, 255, 0.1)' : 'transparent',
                border: isActive ? '1px solid rgba(0, 209, 255, 0.2)' : '1px solid transparent',
                borderRadius: '100px',
                color: isActive ? '#fff' : theme.colors.textDim,
                fontFamily: theme.fonts.display,
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '1px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                outline: 'none',
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
                  boxShadow: '0 0 10px rgba(0, 209, 255, 0.1)',
                  pointerEvents: 'none',
                }} />
              )}
            </button>
          );
        })}

        <div style={{ height: '16px', width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />

        <button
          onClick={() => setProjectionMode(projectionMode === '3d' ? '2d' : '3d')}
          style={{
            padding: '6px 14px',
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontFamily: theme.fonts.display,
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '1px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: '100px',
            transition: 'background 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: projectionMode === '3d' ? theme.colors.phishing : '#fff',
            boxShadow: 'none'
          }} />
          {projectionMode === '3d' ? '3D' : '2D'}
        </button>
      </div>

      {/* Right: Config Toggles */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flex: 1,
        justifyContent: 'flex-end',
      }}>
        <SettingsDropdown config={config} setConfig={setConfig} />
        <button
          onClick={() => setConfig('showPerfOverlay', !config.showPerfOverlay)}
          style={{
            background: config.showPerfOverlay ? 'rgba(0, 209, 255, 0.15)' : 'transparent',
            border: `1px solid ${config.showPerfOverlay ? theme.colors.exploit : 'rgba(255,255,255,0.1)'}`,
            color: config.showPerfOverlay ? theme.colors.exploit : theme.colors.textDim,
            padding: '6px 12px',
            borderRadius: '100px',
            fontSize: 10,
            fontFamily: theme.fonts.display,
            textTransform: 'uppercase',
            letterSpacing: 1,
            cursor: 'pointer',
            transition: theme.transitions.fast,
          }}
        >
          {config.showPerfOverlay ? 'PERF ON' : 'PERF OFF'}
        </button>
      </div>
    </div>
  );
}

// Reusable Dropdown Item component
function SwitchRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }} onClick={onClick}>
      <span style={{ fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textSecondary, letterSpacing: 0.5 }}>{label}</span>
      <div style={{
        width: 32, height: 18, borderRadius: 16, background: active ? theme.colors.exploit : 'rgba(255,255,255,0.1)',
        position: 'relative', transition: 'background 0.3s', display: 'flex', alignItems: 'center'
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          position: 'absolute', left: active ? 16 : 2, transition: 'left 0.3s'
        }} />
      </div>
    </div>
  );
}

function SettingsDropdown({ config, setConfig }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: isOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          color: isOpen ? '#fff' : theme.colors.textDim,
          padding: '6px 14px',
          borderRadius: '100px',
          fontSize: 10,
          fontFamily: theme.fonts.display,
          textTransform: 'uppercase',
          letterSpacing: 1,
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
        onMouseOver={e => e.currentTarget.style.color = '#fff'}
        onMouseOut={e => e.currentTarget.style.color = isOpen ? '#fff' : theme.colors.textDim}
      >
        <span style={{ fontSize: 12 }}>⚙️</span> Settings
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 12,
          width: 220,
          background: 'rgba(5, 8, 15, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0, 209, 255, 0.15)',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
          padding: '16px',
          zIndex: 2500,
          display: 'flex', flexDirection: 'column', gap: 4
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 10, color: theme.colors.exploit, textTransform: 'uppercase', letterSpacing: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>Visuals</h4>
          <SwitchRow label="Auto-Rotate Globe" active={config.rotation} onClick={() => setConfig('rotation', !config.rotation)} />
          <SwitchRow label="Attack Trails" active={config.trails} onClick={() => setConfig('trails', !config.trails)} />
          <SwitchRow label="Reduced Motion" active={config.reducedMotion} onClick={() => setConfig('reducedMotion', !config.reducedMotion)} />
          
          <h4 style={{ margin: '12px 0 8px 0', fontSize: 10, color: theme.colors.exploit, textTransform: 'uppercase', letterSpacing: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>Render Quality</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
            {['low', 'high', 'cinematic'].map(q => (
              <label key={q} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: theme.colors.textSecondary, textTransform: 'capitalize' }}>
                <input 
                  type="radio" name="quality" value={q} checked={config.qualityPreset === q}
                  onChange={(e) => setConfig('qualityPreset', e.target.value)} 
                  style={{ accentColor: theme.colors.exploit }}
                />
                {q}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
