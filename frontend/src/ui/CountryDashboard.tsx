import { useEffect, useState, useMemo } from 'react';
import { useStreamStore } from '../stream/useStreamStore';
import { GlassPanel } from './GlassPanel';
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
  const [loading, setLoading] = useState(true);

  // Fallback values
  const countryName = selectedCountry?.name || 'Unknown Region';
  const countryCode = selectedCountry?.code || '??';

  useEffect(() => {
    if (!countryCode || countryCode === '??') {
      setLoading(false);
      return;
    }

    setLoading(true);
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
    .catch(err => console.error("Failed to load country data:", err))
    .finally(() => setLoading(false));

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
      <div style={{ padding: '24px 40px 30px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.panelBorder}` }}>
        <div>
          <h1 style={{ fontFamily: theme.fonts.display, fontSize: '28px', fontWeight: 800, color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>
            {countryName} <span style={{color: theme.colors.textDim, fontSize: 16, marginLeft: 10}}>[{countryCode}]</span>
          </h1>
          <p style={{ color: theme.colors.textDim, fontSize: '14px', marginTop: '4px' }}>
            In-depth Threat Intelligence & Historical Analysis
          </p>
        </div>
        <button
          onClick={() => setView('map')}
          style={{ background: 'rgba(0, 209, 255, 0.1)', border: '1px solid rgba(0, 209, 255, 0.3)', color: '#00D1FF', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          CLOSE DASHBOARD
        </button>
      </div>

      {/* Content Grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 450px', gap: '30px', padding: '30px', overflow: 'hidden' }}>
        {/* Left: Tactical 3D Hologram */}
        <div style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', background: 'radial-gradient(circle at 50% 50%, #0D1B31 0%, #05080F 100%)', border: `1px solid ${theme.colors.panelBorder}` }}>
            {/* Top Stats HUD Overlay */}
            <div style={{ position: 'absolute', top: 30, left: 30, display: 'flex', gap: 20, zIndex: 10 }}>
                <StatCard label="PRIMARY ORIGIN" value={String(stats.fromCount)} color={theme.colors.exploit} />
                <StatCard label="TARGET VOLUME" value={String(stats.onCount)} color={theme.colors.phishing} />
            </div>

            <Canvas camera={{ position: [0, 10, 100], fov: 45 }}>
                <ambientLight intensity={0.4} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                <CountryHologram />
                <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.3} maxPolarAngle={Math.PI / 2} minPolarAngle={Math.PI / 4} />
            </Canvas>
            
            {/* Tactical Ground Info */}
            <div style={{ position: 'absolute', bottom: 30, left: 30, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
                <div style={{ fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.mono, letterSpacing: 2 }}>REGION_LOCKED // {countryCode}</div>
                <div style={{ fontSize: 12, color: theme.colors.exploit, fontFamily: theme.fonts.display, fontWeight: 700 }}>ACTIVE THREAT MONITORING SYSTEM</div>
            </div>
        </div>

        {/* Right: Detailed Analytics Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: 5 }}>
            {/* Risk Assessment */}
            <GlassPanel style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, fontWeight: 700 }}>Security Assessment</div>
                    <div style={{ padding: '4px 8px', background: `${riskColor}20`, border: `1px solid ${riskColor}40`, borderRadius: 4, color: riskColor, fontSize: 10, fontWeight: 800 }}>{riskLabel}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <div style={{ fontSize: 42, fontWeight: 900, color: riskColor, fontFamily: theme.fonts.display }}>{riskScore}%</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                            <div style={{ width: `${riskScore}%`, height: '100%', background: riskColor, borderRadius: 2, transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                        </div>
                        <div style={{ fontSize: 9, color: theme.colors.textDim, marginTop: 6 }}>RELATIVE TO GLOBAL COUNTER-DATA</div>
                    </div>
                </div>
            </GlassPanel>

            {/* Targeted Sectors */}
            <GlassPanel style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#fff', fontWeight: 800 }}>Targeted Sectors</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sectorData.sectors.map(s => (
                        <div key={s.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: theme.colors.textPrimary, fontWeight: 600 }}>{s.name}</span>
                                <span style={{ color: s.color, fontWeight: 700 }}>{s.count} hits</span>
                            </div>
                            <div style={{ height: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
                                <div style={{ width: `${(s.count / Math.max(...sectorData.sectors.map(x => x.count))) * 100}%`, height: '100%', background: s.color, borderRadius: 1 }} />
                            </div>
                        </div>
                    ))}
                    {sectorData.sectors.length === 0 && <div style={{ fontSize: 11, color: theme.colors.textDim, textAlign: 'center' }}>No sector data identified</div>}
                </div>
            </GlassPanel>

            {/* Top Adversaries */}
            <GlassPanel style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#fff', fontWeight: 800 }}>Primary Adversaries</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {sectorData.topAdversaries.map(([co, count]) => (
                        <div key={co} style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{getFlag(co)}</span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 9, color: theme.colors.textDim }}>{co}</span>
                                <span style={{ fontSize: 11, color: theme.colors.danger, fontWeight: 700 }}>{count}</span>
                            </div>
                        </div>
                    ))}
                    {sectorData.topAdversaries.length === 0 && <div style={{ fontSize: 11, color: theme.colors.textDim }}>No specific country-to-country patterns detected.</div>}
                </div>
            </GlassPanel>

            {/* Recent Activity Log */}
            <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#fff', fontWeight: 800 }}>Activity Log</h3>
                  {loading && <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.colors.exploit, animation: 'pulse 1s infinite' }} />}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px' }}>
                    {combinedHistory.length === 0 && !loading && (
                      <div style={{ padding: 20, textAlign: 'center', color: theme.colors.textDim, fontSize: 12 }}>Logs clear. No active interceptions.</div>
                    )}
                    {combinedHistory.slice(0, 50).map((ev, i) => (
                        <div key={ev._id || ev.id || i} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 11 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ color: getAttackColor(ev.a_t), fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>{ev.a_t}</span>
                                <span style={{ color: theme.colors.textDim, fontSize: 9 }}>{new Date(ev.timestamp || ev.ts || Date.now()).toLocaleTimeString()}</span>
                            </div>
                            <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{ev.a_n}</div>
                            <div style={{ color: theme.colors.textDim, fontFamily: theme.fonts.mono, fontSize: 10 }}>
                                {ev.s_ip} ({ev.s_co}) <span style={{ color: theme.colors.exploit }}>▶</span> {ev.d_ip} ({ev.d_co})
                            </div>
                        </div>
                    ))}
                </div>
            </GlassPanel>
        </div>
      </div>

    </div>
  );
}

function StatCard({ label, value, color }: { label: string, value: string, color: string }) {
    return (
        <div style={{ background: 'rgba(5, 8, 15, 0.8)', backdropFilter: 'blur(10px)', border: `1px solid ${color}40`, padding: '15px 25px', borderRadius: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: color }}>{value}</div>
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
