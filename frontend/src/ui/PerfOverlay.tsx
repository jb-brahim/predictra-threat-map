import { useState, useEffect } from 'react';
import { GlassPanel } from './GlassPanel';
import { theme } from '../theme/theme';
import { perfTelemetry } from '../utils/perf';
import { useStreamStore } from '../stream/useStreamStore';

export function PerfOverlay() {
  const showPerfOverlay = useStreamStore(s => s.config.showPerfOverlay);
  const [stats, setStats] = useState(perfTelemetry.stats);

  useEffect(() => {
    if (!showPerfOverlay) return;
    const id = setInterval(() => {
      setStats({ ...perfTelemetry.stats });
    }, 500);
    return () => clearInterval(id);
  }, [showPerfOverlay]);

  if (!showPerfOverlay) return null;

  const fpsColor = stats.fps >= 55 ? theme.colors.success
    : stats.fps >= 30 ? theme.colors.warning
    : theme.colors.danger;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 20,
      zIndex: 30,
    }}>
      <GlassPanel style={{
        padding: '12px 16px',
        borderRadius: 16,
        fontSize: 11,
        fontFamily: theme.fonts.mono,
        minWidth: 200,
      }}>
        <div style={{
          fontSize: 9,
          fontFamily: theme.fonts.display,
          textTransform: 'uppercase',
          letterSpacing: 2,
          color: theme.colors.textDim,
          marginBottom: 8,
        }}>
          Performance
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <PerfRow label="FPS" value={String(stats.fps)} color={fpsColor} />
          <PerfRow label="Arcs" value={String(stats.activeArcs)} />
          <PerfRow label="Markers" value={String(stats.activeMarkers)} />
          <PerfRow label="Buffer" value={String(stats.bufferSize)} />
          <PerfRow label="Events/s" value={String(stats.eventsPerSecond)} />
          <PerfRow label="Dropped" value={String(stats.droppedEvents)} color={stats.droppedEvents > 0 ? theme.colors.warning : undefined} />
          <PerfRow label="Reconnects" value={String(stats.reconnectAttempts)} />
        </div>
      </GlassPanel>
    </div>
  );
}

function PerfRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <span style={{ color: theme.colors.textDim }}>{label}</span>
      <span style={{ color: color || theme.colors.textSecondary, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
