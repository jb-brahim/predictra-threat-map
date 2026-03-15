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
  
  const [search, setSearch] = useState('');

  const fetchHistory = async (query = '', ip = '') => {
    setLoading(true);
    try {
      const url = new URL('/api/history', window.location.origin);
      if (query) url.searchParams.set('q', query);
      if (ip) url.searchParams.set('ip', ip);
      
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setHistory(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(search);
  };

  const handleCheckMyIP = async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      setSearch(data.ip);
      fetchHistory('', data.ip);
    } catch (err) {
      setError('Could not detect your IP');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(5, 8, 15, 0.95)',
      backdropFilter: 'blur(20px)',
      padding: '100px 40px 40px 40px',
      overflow: 'hidden',
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
      </div>

      {/* Search Header */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex' }}>
          <input
            type="text"
            placeholder="Search by IP, Malware Name, Tag, or Keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px 0 0 8px',
              padding: '12px 20px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none',
              fontFamily: theme.fonts.body,
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0 24px',
              background: '#00D1FF',
              color: '#000',
              border: 'none',
              borderRadius: '0 8px 8px 0',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            SEARCH
          </button>
        </form>
        <button
          onClick={handleCheckMyIP}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            padding: '0 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          CHECK MY IP
        </button>
      </div>

      <GlassPanel style={{ 
        padding: 0, 
        overflowY: 'auto', 
        flex: 1, 
        minHeight: 0,
        background: 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${theme.colors.panelBorder}`,
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '14px',
        }}>
          <thead style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'rgba(10, 15, 25, 0.95)',
            backdropFilter: 'blur(10px)',
            color: theme.colors.textDim,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontSize: '11px',
            fontWeight: 700,
            borderBottom: `1px solid ${theme.colors.panelBorder}`,
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
                    <div>{event.a_n}</div>
                    {event.meta && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {event.meta.malware_family && (
                          <span style={{ fontSize: '10px', background: 'rgba(204, 51, 255, 0.2)', color: '#CC33FF', padding: '2px 6px', borderRadius: '4px' }}>
                            {event.meta.malware_family}
                          </span>
                        )}
                        {event.meta.port && (
                          <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>
                            Port: {event.meta.port}
                          </span>
                        )}
                        {event.meta.tags?.slice(0, 3).map((tag: string) => (
                          <span key={tag} style={{ fontSize: '10px', background: 'rgba(0, 209, 255, 0.1)', color: '#00D1FF', padding: '2px 6px', borderRadius: '4px' }}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {event.meta?.url && (
                      <div style={{ marginTop: '6px' }}>
                        <a 
                          href={event.meta.url} 
                          target="_blank" 
                          rel="noreferrer"
                          style={{ fontSize: '10px', color: '#00D1FF', textDecoration: 'none', opacity: 0.8 }}
                          onMouseOver={e => e.currentTarget.style.opacity = '1'}
                          onMouseOut={e => e.currentTarget.style.opacity = '0.8'}
                        >
                          🔗 SOURCE LINK
                        </a>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>{getFlagEmoji(event.s_co)}</span>
                        <code style={{ color: theme.colors.textSecondary, fontSize: '12px' }}>{event.s_ip}</code>
                      </div>
                      {event.meta?.as_name && (
                        <div style={{ fontSize: '10px', color: theme.colors.textDim, marginLeft: '26px' }}>
                          ISP/ASN: {event.meta.as_name}
                        </div>
                      )}
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
