import { useStreamStore } from '../stream/useStreamStore';
import { GlassPanel } from './GlassPanel';
import { theme, getAttackColor } from '../theme/theme';

const FLAG_FALLBACK: Record<string, string> = {
  US: '🇺🇸', CN: '🇨🇳', RU: '🇷🇺', DE: '🇩🇪', GB: '🇬🇧', BR: '🇧🇷',
  IN: '🇮🇳', JP: '🇯🇵', AU: '🇦🇺', FR: '🇫🇷', KR: '🇰🇷', IL: '🇮🇱',
  NL: '🇳🇱', SE: '🇸🇪', CA: '🇨🇦', SG: '🇸🇬', ZA: '🇿🇦', MX: '🇲🇽',
  TR: '🇹🇷', UA: '🇺🇦', IT: '🇮🇹', ES: '🇪🇸', PL: '🇵🇱', ID: '🇮🇩',
  EG: '🇪🇬', NG: '🇳🇬', AR: '🇦🇷', TH: '🇹🇭', VN: '🇻🇳', PK: '🇵🇰',
  IR: '🇮🇷', CZ: '🇨🇿', GR: '🇬🇷', FI: '🇫🇮', NZ: '🇳🇿', IE: '🇮🇪',
  AT: '🇦🇹', EE: '🇪🇪', QA: '🇶🇦', MN: '🇲🇳', PA: '🇵🇦', GT: '🇬🇹',
  NP: '🇳🇵', KE: '🇰🇪',
};

function getFlag(co: string): string {
  if (FLAG_FALLBACK[co]) return FLAG_FALLBACK[co];
  // Unicode flag from country code
  try {
    const codePoints = [...co.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
  } catch {
    return co;
  }
}

function relativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 5) return 'now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function TypeBadge({ type }: { type: string }) {
  const color = getAttackColor(type);
  const shapes: Record<string, string> = {
    exploit: '◆',
    malware: '▲',
    phishing: '●',
  };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontFamily: theme.fonts.body,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: color,
      padding: '2px 8px',
      borderRadius: theme.radii.chip,
      border: `1px solid ${color}33`,
      background: `${color}15`,
    }}>
      <span>{shapes[type] || '◆'}</span>
      {type}
    </span>
  );
}

export function Sidebar() {
  const totalAttacks = useStreamStore(s => s.totalAttacks);
  const counterData = useStreamStore(s => s.counterData);
  const typeDistribution = useStreamStore(s => s.typeDistribution);
  const recentEvents = useStreamStore(s => s.recentEvents);
  const activeArcCount = useStreamStore(s => s.activeArcCount);

  const total = counterData?.today || totalAttacks;
  const distTotal = typeDistribution.exploit + typeDistribution.malware + typeDistribution.phishing || 1;

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 20,
      bottom: 20,
      width: 360,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      zIndex: 10,
      overflowY: 'auto',
      overflowX: 'hidden',
      scrollbarWidth: 'thin',
      scrollbarColor: '#1a2a3a #05080F',
    }}>
      {/* Live Metrics */}
      <GlassPanel>
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 10,
            fontFamily: theme.fonts.display,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: theme.colors.textDim,
            marginBottom: 4,
          }}>
            Total Attacks Today
          </div>
          <div
            style={{
              fontSize: 42,
              fontFamily: theme.fonts.display,
              fontWeight: 900,
              lineHeight: 1,
              background: 'linear-gradient(135deg, #00D1FF, #00E0FF, #88EEFF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            role="status"
            aria-live="polite"
            aria-label={`Total attacks: ${formatNumber(total)}`}
          >
            {formatNumber(total)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <MetricBox label="ACTIVE ARCS" value={String(activeArcCount)} color={theme.colors.exploit} />
          <MetricBox label="THREATS/MIN" value={formatNumber(Math.round(distTotal / Math.max(1, (Date.now() % 3600000) / 60000)))} color={theme.colors.warning} />
        </div>
      </GlassPanel>

      {/* Threat Distribution */}
      <GlassPanel>
        <div style={{
          fontSize: 10,
          fontFamily: theme.fonts.display,
          textTransform: 'uppercase',
          letterSpacing: 2,
          color: theme.colors.textDim,
          marginBottom: 12,
        }}>
          Threat Distribution
        </div>
        <DistributionBar
          label="Exploit"
          count={typeDistribution.exploit}
          total={distTotal}
          color={theme.colors.exploit}
          shape="◆"
        />
        <DistributionBar
          label="Malware"
          count={typeDistribution.malware}
          total={distTotal}
          color={theme.colors.malware}
          shape="▲"
        />
        <DistributionBar
          label="Phishing"
          count={typeDistribution.phishing}
          total={distTotal}
          color={theme.colors.phishing}
          shape="●"
        />
      </GlassPanel>

      {/* Recent Threat Feed */}
      <GlassPanel style={{ flex: 1, minHeight: 0 }}>
        <div style={{
          fontSize: 10,
          fontFamily: theme.fonts.display,
          textTransform: 'uppercase',
          letterSpacing: 2,
          color: theme.colors.textDim,
          marginBottom: 12,
        }}>
          Recent Threats
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentEvents.length === 0 ? (
            <div style={{
              color: theme.colors.textDim,
              fontStyle: 'italic',
              fontSize: 13,
              textAlign: 'center',
              padding: 20,
            }}>
              Awaiting threat data…
            </div>
          ) : (
            [...recentEvents].reverse().map((event, i) => (
              <div
                key={event.id || i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 10px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  borderLeft: `3px solid ${getAttackColor(event.a_t)}`,
                  transition: theme.transitions.fast,
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <TypeBadge type={event.a_t} />
                  <span style={{
                    fontSize: 10,
                    color: theme.colors.textDim,
                    fontFamily: theme.fonts.mono,
                  }}>
                    {relativeTime(event.ts)}
                  </span>
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.colors.textPrimary,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {event.a_n}
                </div>
                <div style={{
                  fontSize: 11,
                  color: theme.colors.textSecondary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <span>{getFlag(event.s_co)}</span>
                  <span style={{ color: theme.colors.textDim }}>{event.s_co}</span>
                  <span style={{ color: theme.colors.textDim, margin: '0 2px' }}>→</span>
                  <span>{getFlag(event.d_co)}</span>
                  <span style={{ color: theme.colors.textDim }}>{event.d_co}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1,
      padding: '8px 12px',
      borderRadius: 12,
      background: `${color}08`,
      border: `1px solid ${color}20`,
    }}>
      <div style={{
        fontSize: 9,
        fontFamily: theme.fonts.display,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: theme.colors.textDim,
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontFamily: theme.fonts.display,
        fontWeight: 700,
        color: color,
      }}>
        {value}
      </div>
    </div>
  );
}

function DistributionBar({ label, count, total, color, shape }: {
  label: string; count: number; total: number; color: string; shape: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: color,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 8 }}>{shape}</span>
          {label}
        </span>
        <span style={{
          fontSize: 11,
          fontFamily: theme.fonts.mono,
          color: theme.colors.textDim,
        }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div style={{
        width: '100%',
        height: 4,
        borderRadius: 2,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 2,
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          transition: 'width 0.5s ease-out',
          boxShadow: `0 0 8px ${color}44`,
        }} />
      </div>
    </div>
  );
}
