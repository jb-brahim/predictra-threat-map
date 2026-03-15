import { useStreamStore } from '../stream/useStreamStore';
import { GlassPanel } from './GlassPanel';
import { theme } from '../theme/theme';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Earth } from '../globe/Earth';

export function CountryDashboard() {
  const selectedCountry = useStreamStore(s => s.selectedCountry);
  const setView = useStreamStore(s => s.setView);
  const recentEvents = useStreamStore(s => s.recentEvents);

  // Filter events related to this "country" (region for now)
  // In a full implementation, we'd filter by the actual country code.
  const relatedEvents = recentEvents.slice(0, 10); 

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(5, 8, 15, 0.98)',
      backdropFilter: 'blur(30px)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: theme.fonts.body,
    }}>
      {/* Header */}
      <div style={{
        padding: '30px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.colors.panelBorder}`,
      }}>
        <div>
          <h1 style={{
            fontFamily: theme.fonts.display,
            fontSize: '28px',
            fontWeight: 800,
            color: '#fff',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}>
            {selectedCountry || 'Country Analysis'}
          </h1>
          <p style={{ color: theme.colors.textDim, fontSize: '14px', marginTop: '4px' }}>
            In-depth Threat Intelligence & Geological Focus
          </p>
        </div>
        <button
          onClick={() => setView('map')}
          style={{
            background: 'rgba(0, 209, 255, 0.1)',
            border: '1px solid rgba(0, 209, 255, 0.3)',
            color: '#00D1FF',
            padding: '10px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          CLOSE DASHBOARD
        </button>
      </div>

      {/* Content Grid */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 400px',
        gap: '40px',
        padding: '40px',
        overflow: 'hidden'
      }}>
        {/* Left: 3D Visualization */}
        <div style={{ 
          position: 'relative', 
          borderRadius: '24px', 
          overflow: 'hidden',
          background: 'radial-gradient(circle at center, #0A1628 0%, #05080F 100%)',
          border: `1px solid ${theme.colors.panelBorder}`
        }}>
            <Canvas camera={{ position: [0, 0, 2], fov: 45 }}>
                <ambientLight intensity={0.2} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                <Earth />
                <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.5} />
            </Canvas>
            
            <div style={{
                position: 'absolute',
                bottom: 30,
                left: 30,
                display: 'flex',
                gap: 20
            }}>
                <StatCard label="ATTACKS FROM" value="1.2K" color={theme.colors.exploit} />
                <StatCard label="ATTACKS ON" value="842" color={theme.colors.phishing} />
            </div>
        </div>

        {/* Right: Data Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
            <GlassPanel>
                <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: theme.colors.textSecondary, marginBottom: 15 }}>Recent Activity</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {relatedEvents.map((ev, i) => (
                        <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 12 }}>
                            <div style={{ color: getAttackColor(ev.a_t), fontWeight: 700, marginBottom: 2 }}>{ev.a_t.toUpperCase()}</div>
                            <div style={{ color: '#fff' }}>{ev.a_n}</div>
                            <div style={{ color: theme.colors.textDim, fontSize: 10, marginTop: 4 }}>{ev.s_ip} → {ev.d_ip}</div>
                        </div>
                    ))}
                </div>
            </GlassPanel>

            <GlassPanel>
                <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: theme.colors.textSecondary, marginBottom: 15 }}>Security Status</h3>
                <div style={{ padding: '20px', textAlign: 'center', background: 'rgba(255,50,50,0.05)', border: '1px solid rgba(255,50,50,0.2)', borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: theme.colors.danger, fontWeight: 700 }}>HIGH RISK LEVEL</div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: theme.colors.danger, margin: '10px 0' }}>84.2</div>
                    <div style={{ fontSize: 10, color: theme.colors.textDim }}>Calculated from last 24h activity</div>
                </div>
            </GlassPanel>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string, value: string, color: string }) {
    return (
        <div style={{
            background: 'rgba(5, 8, 15, 0.8)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${color}40`,
            padding: '15px 25px',
            borderRadius: '16px',
            textAlign: 'center'
        }}>
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
