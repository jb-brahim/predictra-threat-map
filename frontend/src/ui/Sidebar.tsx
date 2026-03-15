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

function relativeTime(isoStr?: string | Date): string {
  if (!isoStr) return 'just now';
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
  
  const vectorDistribution = useStreamStore(s => s.vectorDistribution);
  const originDistribution = useStreamStore(s => s.originDistribution);
  const targetDistribution = useStreamStore(s => s.targetDistribution);
  const trendData = useStreamStore(s => s.trendData);

  const topVectors = Object.entries(vectorDistribution).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topOrigins = Object.entries(originDistribution).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTargets = Object.entries(targetDistribution).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const total = counterData?.today || totalAttacks;
  const distTotal = typeDistribution.exploit + typeDistribution.malware + typeDistribution.phishing || 1;

  return (
    <div style={{
      position: 'fixed',
      top: 100,
      right: 24,
      bottom: 24,
      width: 380,
      display: 'flex',
      flexDirection: 'column',
      gap: 40, // More breathing room
      zIndex: 10,
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: 8,
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(0, 224, 255, 0.2) transparent',
    }}>
      {/* Live Metrics */}

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
              lineHeight: 1.2, // Improved from 1 to avoid clipping
              padding: '4px 0',
              background: 'linear-gradient(135deg, #00D1FF, #00E0FF, #88EEFF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: -4,
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
        
        {/* Activity Trend Sparkline */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 9, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textDim }}>
            Activity Trend (10m)
          </div>
          <Sparkline data={trendData} color={theme.colors.exploit} />
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

      {/* New Top Attack Vectors Panel */}
      <TopList title="Top Threat Vectors" items={topVectors.length > 0 ? topVectors : [['No Data', 0]]} color={theme.colors.warning} />
      
      {/* New Top Countries Panels - Stacked vertically to prevent squashing */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 8 }}>
        <TopList title="Top Origins" items={topOrigins} isCountry color={theme.colors.exploit} />
        <TopList title="Top Targets" items={topTargets} isCountry color={theme.colors.phishing} />
      </div>

      {/* Recent Threat Feed */}
      <GlassPanel>
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
                    {relativeTime(event.timestamp || event.ts)}
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

                {/* Rich Metadata Badges */}
                {event.meta && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {event.meta.malware_family && (
                      <span style={{ fontSize: '9px', background: 'rgba(204, 51, 255, 0.15)', color: '#CC33FF', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(204, 51, 255, 0.2)' }}>
                        {event.meta.malware_family}
                      </span>
                    )}
                    {event.meta.port && (
                      <span style={{ fontSize: '9px', background: 'rgba(255, 255, 255, 0.05)', color: theme.colors.textSecondary, padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        Port: {event.meta.port}
                      </span>
                    )}
                    {event.meta.as_name && (
                      <span style={{ fontSize: '9px', background: 'rgba(0, 209, 255, 0.05)', color: '#00D1FF', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(0, 209, 255, 0.1)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.meta.as_name}
                      </span>
                    )}
                    {event.meta.tags?.slice(0, 2).map((tag: string) => (
                      <span key={tag} style={{ fontSize: '9px', background: 'rgba(255, 138, 0, 0.1)', color: '#FF8A00', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(255, 138, 0, 0.2)' }}>
                        #{tag}
                      </span>
                    ))}
                    {event.meta.confidence && (
                      <span style={{ fontSize: '9px', background: 'rgba(0, 255, 130, 0.1)', color: '#00FF82', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(0, 255, 130, 0.2)' }}>
                        Confidence: {event.meta.confidence}%
                      </span>
                    )}
                  </div>
                )}

                <div style={{
                  fontSize: 11,
                  color: theme.colors.textSecondary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                }}>
                  <span>{getFlag(event.s_co)}</span>
                  <span style={{ color: theme.colors.textDim }}>{event.s_co}</span>
                  <span style={{ color: theme.colors.textDim, margin: '0 2px' }}>→</span>
                  <span>{getFlag(event.d_co)}</span>
                  <span style={{ color: theme.colors.textDim }}>{event.d_co}</span>
                  
                  {event.meta?.url && (
                    <a 
                      href={event.meta.url} 
                      target="_blank" 
                      rel="noreferrer"
                      style={{ 
                        marginLeft: 'auto', 
                        color: '#00D1FF', 
                        fontSize: '9px', 
                        textDecoration: 'none',
                        opacity: 0.7,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      onMouseOver={e => e.currentTarget.style.opacity = '1'}
                      onMouseOut={e => e.currentTarget.style.opacity = '0.7'}
                    >
                      🔗 LINK
                    </a>
                  )}
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

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const pts = [...data].reverse().map((val, i) => {
    const x = (i / Math.max(1, data.length - 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ marginTop: 8, height: 36, width: '100%', position: 'relative' }}>
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 -5 100 110" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="spark-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="50%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
          <filter id="glow-spark" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <polygon fill="url(#spark-grad)" points={`0,100 ${pts} 100,100`} />
        <polyline 
          fill="none" 
          stroke={color} 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          filter="url(#glow-spark)"
          points={pts} 
        />
        {/* Animated pulse dot at the end */}
        {data.length > 0 && (
          <circle 
            cx="100" 
            cy={100 - (data[0] / max) * 100} 
            r="3" 
            fill="#fff" 
            filter="url(#glow-spark)"
          >
            <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
    </div>
  );
}

function TopList({ title, items, isCountry = false, color }: { title: string; items: [string, number][], isCountry?: boolean, color: string }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map(i => i[1]), 1);

  return (
    <GlassPanel style={{ padding: '14px 18px', borderTop: `1px solid ${color}40`, background: `linear-gradient(180deg, ${color}08 0%, rgba(10,16,24,0) 100%)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <div style={{ fontSize: 11, fontFamily: theme.fonts.display, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textPrimary }}>
          {title}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(([name, count], index) => (
          <div key={name} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 10,
            padding: '4px 6px',
            borderRadius: 8,
            transition: 'background 0.2s',
            cursor: 'default',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ 
              width: 18, 
              height: 18, 
              borderRadius: 4, 
              background: `rgba(255,255,255,0.05)`, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: 10, 
              fontFamily: theme.fonts.mono,
              color: theme.colors.textDim,
              fontWeight: 600,
              flexShrink: 0 
            }}>
              {index + 1}
            </div>
            
            {isCountry && (
              <div style={{ width: 16, fontSize: 14, textAlign: 'center', flexShrink: 0, filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
                {getFlag(name)}
              </div>
            )}
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 11, color: theme.colors.textSecondary }}>
                <span style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  fontWeight: index === 0 ? 600 : 400,
                  color: index === 0 ? theme.colors.textPrimary : theme.colors.textSecondary
                }}>
                  {name}
                </span>
                <span style={{ fontFamily: theme.fonts.mono, fontSize: 10, color: color, flexShrink: 0, paddingLeft: 8, fontWeight: 600 }}>
                  {formatNumber(count)}
                </span>
              </div>
              <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ 
                  width: `${(count / max) * 100}%`, 
                  height: '100%', 
                  background: `linear-gradient(90deg, ${color}88, ${color})`, 
                  borderRadius: 2,
                  boxShadow: `0 0 4px ${color}88`
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
