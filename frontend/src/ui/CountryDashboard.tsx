import { useEffect, useState } from 'react';
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

export function CountryDashboard() {
  const selectedCountry = useStreamStore(s => s.selectedCountry);
  const setView = useStreamStore(s => s.setView);
  
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

  // Calculate Threat Level dynamically
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
    }}>
      {/* Header */}
      <div style={{ padding: '30px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.panelBorder}` }}>
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
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 400px', gap: '40px', padding: '40px', overflow: 'hidden' }}>
        {/* Left: 3D Visualization */}
        <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden', background: 'radial-gradient(circle at center, #0A1628 0%, #05080F 100%)', border: `1px solid ${theme.colors.panelBorder}` }}>
            <Canvas camera={{ position: [0, 0, 150], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                <CountryHologram />
                <OrbitControls enablePan={true} autoRotate autoRotateSpeed={0.5} />
            </Canvas>
            
            <div style={{ position: 'absolute', bottom: 30, left: 30, display: 'flex', gap: 20 }}>
                <StatCard label="ATTACKS FROM (24h)" value={loading ? "..." : String(stats.fromCount)} color={theme.colors.exploit} />
                <StatCard label="ATTACKS ON (24h)" value={loading ? "..." : String(stats.onCount)} color={theme.colors.phishing} />
            </div>
        </div>

        {/* Right: Data Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
            <GlassPanel>
                <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: theme.colors.textSecondary, marginBottom: 15 }}>Security Status</h3>
                <div style={{ padding: '20px', textAlign: 'center', background: `${riskColor}15`, border: `1px solid ${riskColor}40`, borderRadius: 12, transition: 'all 0.3s' }}>
                    <div style={{ fontSize: 12, color: riskColor, fontWeight: 700, letterSpacing: 1 }}>{riskLabel}</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: riskColor, margin: '10px 0' }}>{riskScore}%</div>
                    <div style={{ fontSize: 10, color: theme.colors.textDim }}>% of global attack volume</div>
                </div>
            </GlassPanel>

            <GlassPanel style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                  <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: theme.colors.textSecondary }}>Recent Activity</h3>
                  {loading && <span style={{ fontSize: 10, color: theme.colors.textDim, animation: 'pulse 1.5s infinite' }}>LOADING...</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto', paddingRight: 5 }}>
                    {history.length === 0 && !loading && (
                      <div style={{ padding: 20, textAlign: 'center', color: theme.colors.textDim, fontSize: 12 }}>No recent attacks found for this region.</div>
                    )}
                    {history.map((ev, i) => (
                        <div key={ev._id || i} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 12, borderLeft: `2px solid ${getAttackColor(ev.a_t)}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: getAttackColor(ev.a_t), fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 1 }}>{ev.a_t}</span>
                              <span style={{ color: theme.colors.textDim, fontSize: 10 }}>{new Date(ev.timestamp!).toLocaleTimeString()}</span>
                            </div>
                            <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>{ev.a_n}</div>
                            <div style={{ color: theme.colors.textDim, fontSize: 10, fontFamily: theme.fonts.mono }}>
                                {ev.s_ip} <span style={{color: theme.colors.textSecondary}}>({ev.s_co})</span> → {ev.d_ip} <span style={{color: theme.colors.textSecondary}}>({ev.d_co})</span>
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
