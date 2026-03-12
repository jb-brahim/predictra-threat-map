import { useEffect, useState } from 'react';
import { useStreamStore } from '../stream/useStreamStore';
import type { ThreatEvent } from '../stream/types';
import { theme, getAttackColor } from '../theme/theme';
import { GlassPanel } from './GlassPanel';

export function HistoryPage() {
  const [history, setHistory] = useState<ThreatEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setView = useStreamStore(s => s.setView);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/history');
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();
        setHistory(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(5, 8, 15, 0.95)',
      backdropFilter: 'blur(20px)',
      padding: '40px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      fontFamily: theme.fonts.body,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.colors.panelBorder}`,
        paddingBottom: '20px',
      }}>
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
            Attack History
          </h1>
          <p style={{ color: theme.colors.textDim, fontSize: '14px', marginTop: '4px' }}>
            Displaying the last 100 recorded threat events from MongoDB
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
            fontFamily: theme.fonts.display,
            fontWeight: 600,
            fontSize: '14px',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(0, 209, 255, 0.2)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(0, 209, 255, 0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          BACK TO LIVE MAP
        </button>
      </div>

      <GlassPanel style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '14px',
        }}>
          <thead style={{
            background: 'rgba(255, 255, 255, 0.03)',
            color: theme.colors.textDim,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontSize: '11px',
            fontWeight: 700,
          }}>
            <tr>
              <th style={{ padding: '16px 20px' }}>Timestamp</th>
              <th style={{ padding: '16px 20px' }}>Type</th>
              <th style={{ padding: '16px 20px' }}>Attack Description</th>
              <th style={{ padding: '16px 20px' }}>Source (IP/Country)</th>
              <th style={{ padding: '16px 20px' }}>Victim (IP/Country)</th>
              <th style={{ padding: '16px 20px' }}>Provider</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '60px', textAlign: 'center', color: theme.colors.textDim }}>
                  Loading encrypted history logs...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} style={{ padding: '60px', textAlign: 'center', color: theme.colors.danger }}>
                  Error: {error}
                </td>
              </tr>
            ) : history.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '60px', textAlign: 'center', color: theme.colors.textDim }}>
                  No attack logs found in database.
                </td>
              </tr>
            ) : (
              history.map((event, idx) => (
                <tr 
                  key={event.id || idx}
                  style={{
                    borderTop: `1px solid rgba(255, 255, 255, 0.03)`,
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                  onMouseOut={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)'}
                >
                  <td style={{ padding: '16px 20px', color: theme.colors.textSecondary, fontFamily: theme.fonts.mono, fontSize: '12px' }}>
                    {new Date(event.timestamp || event.ts || Date.now()).toLocaleString()}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{
                      color: getAttackColor(event.a_t),
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      fontSize: '11px',
                    }}>
                      {event.a_t}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', fontWeight: 500, color: '#fff' }}>
                    {event.a_n}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{getFlagEmoji(event.s_co)}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: '#fff' }}>{event.s_ip || 'unknown'}</span>
                        <span style={{ fontSize: '11px', color: theme.colors.textDim }}>{event.s_co}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{getFlagEmoji(event.d_co)}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: '#fff' }}>{event.d_ip || 'unknown'}</span>
                        <span style={{ fontSize: '11px', color: theme.colors.textDim }}>{event.d_co}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{
                      padding: '4px 8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: theme.colors.textDim,
                    }}>
                      {event.source_api || 'unknown'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}

function getFlagEmoji(countryCode: string) {
  if (!countryCode || countryCode === '??' || countryCode === 'UN') return '🌐';
  const codePoints = [...countryCode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}
