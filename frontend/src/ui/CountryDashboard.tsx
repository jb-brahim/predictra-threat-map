import { useEffect, useState, useMemo } from 'react';
import { useStreamStore } from '../stream/useStreamStore';
import { theme } from '../theme/theme';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { CountryHologram } from './CountryHologram';
import type { ThreatEvent } from '../stream/types';

interface CountryStats {
  fromCount: number;
  onCount: number;
  totalWorld: number;
}

interface SectorStat {
  name: string;
  count: number;
  color: string;
}

export function CountryDashboard() {
  const selectedCountry = useStreamStore(s => s.selectedCountry);
  const setView = useStreamStore(s => s.setView);
  const recentEvents = useStreamStore(s => s.recentEvents);
  
  const [history, setHistory] = useState<ThreatEvent[]>([]);
  const [stats, setStats] = useState<CountryStats>({ fromCount: 0, onCount: 0, totalWorld: 1 });

  // Fallback values
  const countryName = selectedCountry?.name || 'Unknown Region';
  const countryCode = selectedCountry?.code || '??';

  useEffect(() => {
    if (!countryCode || countryCode === '??') {
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || '';

    Promise.all([
      fetch(`${apiUrl}/api/history?country=${countryCode}`).then(r => r.json()),
      fetch(`${apiUrl}/api/stats?from=${new Date(Date.now() - 24*3600*1000).toISOString()}`).then(r => r.json()), // world stats
      fetch(`${apiUrl}/api/stats?country=${countryCode}&from=${new Date(Date.now() - 24*3600*1000).toISOString()}`).then(r => r.json()) // country stats
    ])
    .then(([historyData, worldStats, countryStats]) => {
      setHistory(Array.isArray(historyData) ? historyData : []);
      setStats({
        totalWorld: worldStats.total || 1,
        // Calculate "Attacks from" (origin) vs "Attacks on" (target) from the history
        // Or if the API provides byOrigin/byTarget dictionaries, we can look it up
        fromCount: countryStats.byOrigin?.[countryCode] || 0,
        onCount: countryStats.byTarget?.[countryCode] || 0,
      });
    })
    .catch(err => console.error("Failed to load country data:", err));

    // Optional: hook it up to refresh every 10s if we want it truly live
    const interval = setInterval(() => {
      fetch(`${apiUrl}/api/history?country=${countryCode}`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setHistory(data); })
        .catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, [countryCode]);

  // Merge live events from store with polled history
  const combinedHistory = useMemo(() => {
    if (!countryCode || countryCode === '??') return history;
    
    // Filter live events for this country
    const liveCountryEvents = recentEvents.filter(ev => ev.s_co === countryCode || ev.d_co === countryCode);
    
    // Merge arrays and remove duplicates
    const merged = [...liveCountryEvents, ...history];
    const unique = [];
    const seen = new Set();
    
    for (const ev of merged) {
      // API events use _id, stream events use id
      const evtId = ev._id || ev.id;
      if (evtId && !seen.has(evtId)) {
        seen.add(evtId);
        unique.push(ev);
      }
    }
    
    // Sort combined by newest first
    unique.sort((a, b) => {
        const tA = new Date(a.timestamp || a.ts || 0).getTime();
        const tB = new Date(b.timestamp || b.ts || 0).getTime();
        return tB - tA;
    });

    // Return top 200
    return unique.slice(0, 200);
  }, [recentEvents, history, countryCode]);

  // Sector Analytics: Calculate targeted industries from meta
  const sectorData = useMemo(() => {
    const counts: Record<string, number> = {};
    const adversaryCounts: Record<string, number> = {};

    combinedHistory.forEach(ev => {
      // 1. Sector inference
      const sector = ev.meta?.sector || ev.meta?.industry || ev.meta?.threat_type || 'General';
      counts[sector] = (counts[sector] || 0) + 1;

      // 2. Adversary tracking
      if (ev.d_co === countryCode && ev.s_co && ev.s_co !== countryCode) {
        adversaryCounts[ev.s_co] = (adversaryCounts[ev.s_co] || 0) + 1;
      }
    });

    const sectors: SectorStat[] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => ({
        name,
        count,
        color: `hsl(${200 + i * 30}, 80%, 60%)`
      }));

    const topAdversaries = Object.entries(adversaryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { sectors, topAdversaries };
  }, [combinedHistory, countryCode]);

  const activityRatio = (stats.fromCount + stats.onCount) / Math.max(stats.totalWorld, 1);
  let riskLabel = "LOW RISK";
  let riskColor = theme.colors.success as string;
  let riskScore = (activityRatio * 100).toFixed(1);

  if (activityRatio > 0.15) { riskLabel = "CRITICAL RISK"; riskColor = theme.colors.danger as string; }
  else if (activityRatio > 0.05) { riskLabel = "HIGH RISK"; riskColor = theme.colors.warning as string; }
  else if (activityRatio > 0.01) { riskLabel = "ELEVATED RISK"; riskColor = theme.colors.phishing as string; }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(5, 8, 15, 0.98)', backdropFilter: 'blur(30px)',
      display: 'flex', flexDirection: 'column', fontFamily: theme.fonts.body,
      paddingTop: '64px',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.panelBorder}`, background: 'rgba(8,12,20,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ padding: '8px 12px', border: `1px solid ${theme.colors.exploit}`, color: theme.colors.exploit, fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 800 }}>
            TARGET_ID // {countryCode}
          </div>
          <div>
            <h1 style={{ fontFamily: theme.fonts.display, fontSize: '24px', fontWeight: 900, color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '3px' }}>
              {countryName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.colors.exploit, animation: 'pulse 1s infinite' }} />
                <span style={{ color: theme.colors.textDim, fontSize: '10px', textTransform: 'uppercase', letterSpacing: 2 }}>Real-Time Intelligence Stream // Active</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setView('map')}
          style={{ 
            background: 'transparent', 
            border: `1px solid ${theme.colors.textDim}`, 
            color: theme.colors.textDim, 
            padding: '8px 20px', 
            borderRadius: '2px', 
            cursor: 'pointer', 
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.5,
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#fff'}
          onMouseLeave={e => e.currentTarget.style.borderColor = theme.colors.textDim}
        >
          [ EXIT_TERMINAL ]
        </button>
      </div>

      {/* Content Grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 480px', gap: '30px', padding: '30px', overflow: 'hidden' }}>
        {/* Left: Tactical Point-Cloud Hologram */}
        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: 'radial-gradient(circle at 50% 50%, #0A1425 0%, #020408 100%)', border: `1px solid rgba(0,255,255,0.05)` }}>
            {/* HUD Overlay Top */}
            <div style={{ position: 'absolute', top: 20, left: 20, display: 'flex', gap: 15, zIndex: 10 }}>
                <MetricBox label="ORIGIN_LOAD" value={stats.fromCount} color={theme.colors.exploit} />
                <MetricBox label="TARGET_LOAD" value={stats.onCount} color={theme.colors.phishing} />
            </div>

            <Canvas camera={{ position: [0, 40, 120], fov: 40 }}>
                <ambientLight intensity={0.2} />
                <pointLight position={[10, 50, 10]} intensity={2} color="#00FFFF" />
                <Stars radius={100} depth={50} count={3000} factor={2} saturation={0} fade speed={1} />
                <CountryHologram />
                <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.4} maxPolarAngle={Math.PI / 2.1} minPolarAngle={Math.PI / 10} />
            </Canvas>
            
            {/* HUD Overlay Bottom */}
            <div style={{ position: 'absolute', bottom: 20, left: 20, pointerEvents: 'none', fontFamily: theme.fonts.mono }}>
                <div style={{ fontSize: 9, color: theme.colors.exploit, letterSpacing: 3, fontWeight: 700 }}>LIVE_TELEMETRY // SYNC_ACTIVE</div>
                <div style={{ display: 'flex', gap: 15, marginTop: 5 }}>
                    <div style={{ fontSize: 8, color: theme.colors.textDim }}>LAT: 37.0902</div>
                    <div style={{ fontSize: 8, color: theme.colors.textDim }}>LON: -95.7129</div>
                    <div style={{ fontSize: 8, color: theme.colors.textDim }}>ALT: 400KM</div>
                </div>
            </div>
            {/* Corner Brackets */}
            <div style={{ position: 'absolute', top: 10, left: 10, width: 20, height: 20, borderTop: '2px solid #00FFFF30', borderLeft: '2px solid #00FFFF30' }} />
            <div style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderTop: '2px solid #00FFFF30', borderRight: '2px solid #00FFFF30' }} />
            <div style={{ position: 'absolute', bottom: 10, left: 10, width: 20, height: 20, borderBottom: '2px solid #00FFFF30', borderLeft: '2px solid #00FFFF30' }} />
            <div style={{ position: 'absolute', bottom: 10, right: 10, width: 20, height: 20, borderBottom: '2px solid #00FFFF30', borderRight: '2px solid #00FFFF30' }} />
        </div>

        {/* Right: Data Analytics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
            <Panel title="Security Assessment">
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '5px 0' }}>
                    <div style={{ flexShrink: 0, width: 100, height: 100, borderRadius: '50%', border: `4px solid ${riskColor}20`, borderTopColor: riskColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: riskColor }}>{riskScore}%</div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: riskColor, letterSpacing: 2 }}>{riskLabel}</div>
                        <div style={{ fontSize: 9, color: theme.colors.textDim, marginTop: 4, lineHeight: 1.4 }}>
                            System activity indicates {riskLabel.toLowerCase()} relative to historical baseline for the current 24H window.
                        </div>
                    </div>
                </div>
            </Panel>

            <Panel title="Industry Intelligence">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sectorData.sectors.map((s, idx) => (
                        <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 14, fontSize: 8, color: theme.colors.textDim }}>0{idx + 1}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
                                    <span style={{ color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>{s.name}</span>
                                    <span style={{ color: theme.colors.textDim }}>{s.count} hits</span>
                                </div>
                                <div style={{ height: 2, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ width: `${(s.count / Math.max(...sectorData.sectors.map(x => x.count))) * 100}%`, height: '100%', background: s.color }} />
                                </div>
                            </div>
                        </div>
                    ))}
                    {sectorData.sectors.length === 0 && <div style={{ fontSize: 10, color: theme.colors.textDim, textAlign: 'center' }}>ANALYZING DATA...</div>}
                </div>
            </Panel>

            <Panel title="Adversary Pattern">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sectorData.topAdversaries.map(([co, count]) => (
                        <div key={co} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                            <span style={{ fontSize: 20 }}>{getFlag(co)}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>{co} PROFILE</div>
                                <div style={{ fontSize: 9, color: theme.colors.textDim }}>Origin of verified attack vectors</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 14, color: theme.colors.danger, fontWeight: 900 }}>{count}</div>
                                <div style={{ fontSize: 8, color: theme.colors.textDim }}>HITS</div>
                            </div>
                        </div>
                    ))}
                    {sectorData.topAdversaries.length === 0 && <div style={{ fontSize: 10, color: theme.colors.textDim }}>NO PATTERNS DETECTED</div>}
                </div>
            </Panel>

            <Panel title="Command Log" slim>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {combinedHistory.slice(0, 30).map((ev, i) => (
                        <div key={ev._id || ev.id || i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 10 }}>
                            <div style={{ display: 'flex', gap: 8, color: getAttackColor(ev.a_t), fontWeight: 700 }}>
                                <span>[{new Date(ev.timestamp || ev.ts || Date.now()).toLocaleTimeString([], {hour12: false})}]</span>
                                <span>{ev.a_t.toUpperCase()}</span>
                            </div>
                            <div style={{ color: '#fff', margin: '2px 0' }}>{ev.a_n}</div>
                            <div style={{ color: theme.colors.textDim, fontFamily: theme.fonts.mono, fontSize: 9 }}>{ev.s_ip} → {ev.d_ip}</div>
                        </div>
                    ))}
                </div>
            </Panel>
        </div>
      </div>


    </div>
  );
}

function MetricBox({ label, value, color }: { label: string, value: number, color: string }) {
    return (
        <div style={{ background: 'rgba(5, 8, 15, 0.6)', backdropFilter: 'blur(10px)', border: `1px solid ${color}40`, padding: '12px 20px', borderRadius: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: color, fontFamily: theme.fonts.display }}>{value}</div>
        </div>
    );
}

function Panel({ title, children, slim }: { title: string, children: React.ReactNode, slim?: boolean }) {
    return (
        <div style={{ 
            background: 'rgba(10, 15, 25, 0.7)', 
            backdropFilter: 'blur(20px)', 
            border: '1px solid rgba(255,255,255,0.05)',
            borderLeft: `2px solid ${theme.colors.exploit}80`,
            padding: slim ? 0 : '15px 20px',
            borderRadius: 2
        }}>
            {title && !slim && (
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, fontWeight: 800, marginBottom: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: theme.colors.exploit }}>▶</span> {title}
                </div>
            )}
            {title && slim && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, fontWeight: 800 }}>
                     {title}
                </div>
            )}
            {children}
        </div>
    );
}

function getAttackColor(type: string) {
    if (type === 'exploit') return '#FF3366';
    if (type === 'malware') return '#CC33FF';
    return '#00D1FF';
}

function getFlag(co: string): string {
    const flags: Record<string, string> = {
        'US': '🇺🇸', 'CN': '🇨🇳', 'RU': '🇷🇺', 'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪', 'JP': '🇯🇵', 'IN': '🇮🇳',
        'BR': '🇧🇷', 'CA': '🇨🇦', 'AU': '🇦🇺', 'KR': '🇰🇷', 'IL': '🇮🇱', 'IR': '🇮🇷', 'KP': '🇰🇵', 'UA': '🇺🇦',
        'TR': '🇹🇷', 'SA': '🇸🇦', 'AE': '🇦🇪', 'EG': '🇪🇬', 'ZA': '🇿🇦', 'VN': '🇻🇳', 'TH': '🇹🇭', 'ID': '🇮🇩',
        'PK': '🇵🇰', 'MX': '🇲🇽', 'IT': '🇮🇹', 'ES': '🇪🇸', 'NL': '🇳🇱', 'SE': '🇸🇪', 'CH': '🇨🇭', 'SG': '🇸🇬'
    };
    return flags[co] || '🌐';
}
