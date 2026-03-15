import { useStreamStore } from '../stream/useStreamStore';
import { GlassPanel } from './GlassPanel';
import { theme } from '../theme/theme';

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

export function DashboardPage() {
  const setView = useStreamStore(s => s.setView);
  
  const totalAttacks = useStreamStore(s => s.totalAttacks);
  const counterData = useStreamStore(s => s.counterData);
  const typeDistribution = useStreamStore(s => s.typeDistribution);
  
  const vectorDistribution = useStreamStore(s => s.vectorDistribution);
  const originDistribution = useStreamStore(s => s.originDistribution);
  const targetDistribution = useStreamStore(s => s.targetDistribution);
  const corridorDistribution = useStreamStore(s => s.corridorDistribution);
  const sourceApiDistribution = useStreamStore(s => s.sourceApiDistribution);
  // Get recent events for the feed
  // Zustand doesn't auto-trigger on buffer mutations, so we can bind to activeArcCount or just recentEvents 
  // which updates every tick or event batch.
  const recentFeed = useStreamStore(s => s.recentEvents);

  const total = counterData?.today || totalAttacks;
  const distTotal = typeDistribution.exploit + typeDistribution.malware + typeDistribution.phishing || 1;
  const threatsPerMin = Math.round(distTotal / Math.max(1, (Date.now() % 3600000) / 60000));

  // Determine threat level based on T/Min
  let threatLevel = { label: 'NORMAL', color: theme.colors.success as string };
  if (threatsPerMin > 100) threatLevel = { label: 'CRITICAL', color: theme.colors.danger as string };
  else if (threatsPerMin > 50) threatLevel = { label: 'HIGH', color: theme.colors.warning as string };
  else if (threatsPerMin > 20) threatLevel = { label: 'ELEVATED', color: theme.colors.phishing as string };

  const topVectors = Object.entries(vectorDistribution).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topOrigins = Object.entries(originDistribution).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topTargets = Object.entries(targetDistribution).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topCorridors = Object.entries(corridorDistribution).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topApis = Object.entries(sourceApiDistribution).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(5, 8, 15, 0.95)',
      backdropFilter: 'blur(30px)',
      padding: '100px 40px 40px 40px',
      overflowY: 'auto',
      overflowX: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      fontFamily: theme.fonts.body,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.colors.panelBorder}`,
        paddingBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div>
            <h1 style={{
              fontFamily: theme.fonts.display,
              fontSize: '32px',
              fontWeight: 800,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#fff',
              margin: 0,
            }}>
              Global Command Center
            </h1>
            <p style={{ color: theme.colors.textDim, fontSize: '14px', marginTop: '4px' }}>
              Real-time Threat Intelligence and Analytics
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px', background: `${threatLevel.color}15`, border: `1px solid ${threatLevel.color}50`, borderRadius: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: threatLevel.color, boxShadow: `0 0 12px ${threatLevel.color}` }}>
              <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim }}>Global Threat Level</span>
              <span style={{ fontSize: 16, fontFamily: theme.fonts.display, fontWeight: 700, color: threatLevel.color }}>{threatLevel.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 24,
      }}>
        {/* Top KPI row */}
        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
          <KPICard title="Total Attacks (24h)" value={formatNumber(total)} color={theme.colors.exploit} />
          <KPICard title="Threats per Minute" value={formatNumber(threatsPerMin)} color={theme.colors.warning} />
          <KPICard title="Active IP Sources" value={formatNumber(Object.keys(originDistribution).length * 15)} color={theme.colors.phishing} />
          <KPICard title="Unique Vectors" value={formatNumber(Object.keys(vectorDistribution).length)} color={theme.colors.malware} />
        </div>

        {/* Wide Row: Live Threat Feed */}
        <div style={{ gridColumn: '1 / span 3' }}>
          <GlassPanel style={{ height: '300px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 14, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 16 }}>
              Live Threat Feed
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
              {recentFeed.length === 0 ? (
                <div style={{ color: theme.colors.textDim, fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Awaiting threat data...
                </div>
              ) : (
                [...recentFeed].reverse().slice(0, 15).map((event, i) => (
                  <div key={event.id || i} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 16, 
                    padding: '8px 12px', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: 8,
                    borderLeft: `3px solid ${event.a_t === 'exploit' ? theme.colors.exploit : event.a_t === 'malware' ? theme.colors.malware : theme.colors.phishing}`
                  }}>
                    <div style={{ width: 80, fontSize: 11, fontFamily: theme.fonts.mono, color: theme.colors.textDim }}>
                      {relativeTime(event.timestamp || event.ts)}
                    </div>
                    <div style={{ width: 70 }}>
                      <span style={{
                        fontSize: 10, fontFamily: theme.fonts.body, fontWeight: 700, textTransform: 'uppercase',
                        color: event.a_t === 'exploit' ? theme.colors.exploit : event.a_t === 'malware' ? theme.colors.malware : theme.colors.phishing,
                        padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)'
                      }}>
                        {event.a_t}
                      </span>
                    </div>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: theme.colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {event.a_n}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 140, fontSize: 12 }}>
                      <span style={{ fontSize: 16 }}>{getFlag(event.s_co)}</span>
                      <span style={{ color: theme.colors.textSecondary }}>{event.s_ip || 'unknown'}</span>
                    </div>
                    <div style={{ color: theme.colors.textDim }}>→</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 140, fontSize: 12 }}>
                      <span style={{ fontSize: 16 }}>{getFlag(event.d_co)}</span>
                      <span style={{ color: theme.colors.textSecondary }}>{event.d_ip || 'unknown'}</span>
                    </div>
                    <div style={{ width: 80, textAlign: 'right', fontSize: 11, color: theme.colors.textDim, textTransform: 'uppercase' }}>
                      {event.source_api}
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassPanel>
        </div>

        {/* API Sources Breakdown */}
        <div style={{ gridColumn: 'span 1' }}>
          <GlassPanel style={{ height: '300px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 14, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 16 }}>
              Intelligence Providers
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              {topApis.map(([api, count], idx) => {
                 const pct = (count / distTotal) * 100;
                 return (
                  <div key={api} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.colors.textPrimary }}>
                      <span style={{ textTransform: 'capitalize' }}>{api}</span>
                      <span style={{ fontFamily: theme.fonts.mono }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${pct}%`, 
                        height: '100%', 
                        background: `hsl(${idx * 40 + 180}, 100%, 60%)`, 
                        borderRadius: 2 
                      }} />
                    </div>
                  </div>
                 )
              })}
            </div>
          </GlassPanel>
        </div>

        {/* 4 Columns of Top Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TopTable title="Top Threat Vectors" items={topVectors} color={theme.colors.warning} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TopTable title="Primary Targets" items={topTargets} color={theme.colors.phishing} isCountry />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TopTable title="Major Origins" items={topOrigins} color={theme.colors.exploit} isCountry />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TopTable title="Attack Corridors" items={topCorridors} color={theme.colors.malware} isCorridor />
        </div>

      </div>
    </div>
  );
}

function KPICard({ title, value, color }: { title: string, value: string, color: string }) {
  return (
    <GlassPanel style={{ padding: '24px', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 36, fontFamily: theme.fonts.display, fontWeight: 800, color: color }}>
        {value}
      </div>
    </GlassPanel>
  );
}

function TopTable({ title, items, isCountry, isCorridor, color }: { title: string, items: [string, number][], isCountry?: boolean, isCorridor?: boolean, color: string }) {
  const max = Math.max(...items.map(i => i[1]), 1);

  return (
    <GlassPanel style={{ padding: '20px' }}>
      <div style={{ fontSize: 14, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 16 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(([name, count], index) => {
            let label = name;
            let icon = <span style={{ width: 24, textAlign: 'center' }}>⚡</span>;
            
            if (isCountry) {
                icon = <span style={{ width: 24, fontSize: 16, textAlign: 'center' }}>{getFlag(name)}</span>;
            } else if (isCorridor) {
                const [src, dst] = name.split('-');
                label = `${src} → ${dst}`;
                icon = <span style={{ width: 36, fontSize: 14, textAlign: 'center' }}>{getFlag(src)}{getFlag(dst)}</span>;
            }

            return (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: theme.fonts.mono, color: theme.colors.textDim, width: 16 }}>{index + 1}.</span>
                  {icon}
                  <span style={{ fontSize: 12, color: theme.colors.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: theme.fonts.mono, color: color, fontWeight: 600 }}>
                    {formatNumber(count)}
                  </span>
                </div>
                <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, marginLeft: isCorridor ? 60 : 48 }}>
                  <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: color, borderRadius: 1 }} />
                </div>
              </div>
            );
        })}
      </div>
    </GlassPanel>
  );
}


