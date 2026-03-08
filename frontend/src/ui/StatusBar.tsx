import { useStreamStore } from '../stream/useStreamStore';
import { GlassPanel } from './GlassPanel';
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

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      {/* Left: Title + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <h1 style={{
            fontSize: 18,
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            margin: 0,
            letterSpacing: 3,
            background: 'linear-gradient(135deg, #00D1FF, #00E0FF 50%, #88EEFF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            THREAT MAP
          </h1>
          <span style={{
            fontSize: 9,
            fontFamily: theme.fonts.body,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: theme.colors.textDim,
          }}>
            Global Cyber Intelligence
          </span>
        </div>
        <StatusDot status={status} />
      </div>

      {/* Right: Config Toggles */}
      <GlassPanel style={{
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderRadius: 16,
      }}>
        <ToggleButton
          label="Rotate"
          active={config.rotation}
          onClick={() => setConfig('rotation', !config.rotation)}
        />
        <ToggleButton
          label="Trails"
          active={config.trails}
          onClick={() => setConfig('trails', !config.trails)}
        />
        <ToggleButton
          label="Reduced Motion"
          active={config.reducedMotion}
          onClick={() => setConfig('reducedMotion', !config.reducedMotion)}
        />
        <QualitySelect
          value={config.qualityPreset}
          onChange={(v) => setConfig('qualityPreset', v)}
        />
        <ToggleButton
          label="Perf"
          active={config.showPerfOverlay}
          onClick={() => setConfig('showPerfOverlay', !config.showPerfOverlay)}
        />
      </GlassPanel>
    </div>
  );
}

function ToggleButton({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(0, 209, 255, 0.15)' : 'transparent',
        border: `1px solid ${active ? theme.colors.exploit : 'rgba(255,255,255,0.1)'}`,
        color: active ? theme.colors.exploit : theme.colors.textDim,
        padding: '4px 10px',
        borderRadius: 8,
        fontSize: 10,
        fontFamily: theme.fonts.display,
        textTransform: 'uppercase',
        letterSpacing: 1,
        cursor: 'pointer',
        transition: theme.transitions.fast,
        whiteSpace: 'nowrap',
      }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function QualitySelect({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: 'rgba(0, 209, 255, 0.08)',
        border: `1px solid rgba(255,255,255,0.1)`,
        color: theme.colors.textSecondary,
        padding: '4px 8px',
        borderRadius: 8,
        fontSize: 10,
        fontFamily: theme.fonts.display,
        textTransform: 'uppercase',
        letterSpacing: 1,
        cursor: 'pointer',
      }}
      aria-label="Quality preset"
    >
      <option value="low">Low</option>
      <option value="high">High</option>
      <option value="cinematic">Cinematic</option>
    </select>
  );
}
