import { useEffect, useState } from 'react';
import type { ThreatEvent } from '../stream/types';
import { theme, getAttackColor } from '../theme/theme';
import { GlassPanel } from './GlassPanel';

export function HistoryPage() {
  const [history, setHistory] = useState<ThreatEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
          <div style={{
            display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px 0 0 8px', padding: '0 16px'
          }}>
            <span style={{ color: theme.colors.textDim }}>🔍</span>
          </div>
          <input
            type="text"
            placeholder="Search by IP, Malware Name, Tag, Port, ASN (e.g. Google), or Keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderLeft: 'none',
              padding: '16px 20px 16px 0',
              color: '#fff',
              fontSize: '14px',
              fontFamily: theme.fonts.mono,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0 32px',
              background: 'linear-gradient(45deg, #00D1FF, #00A8FF)',
              color: '#000',
              border: 'none',
              borderRadius: '0 8px 8px 0',
              fontWeight: 800,
              fontFamily: theme.fonts.display,
              letterSpacing: 1,
              cursor: 'pointer',
              transition: 'background 0.3s',
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.2)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            EXECUTE
          </button>
        </form>
        <button
          onClick={handleCheckMyIP}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            padding: '0 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: theme.fonts.display,
            letterSpacing: 1,
            transition: 'all 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >
          TARGET MY IP
        </button>
      </div>

      {/* Quick Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { label: 'All', query: '' },
          { label: 'Ransomware Leaks', query: 'ransomwatch' },
          { label: 'C2 Infrastructure', query: 'c2tracker' },
          { label: 'Dark Web Intel', query: 'alienvault' },
          { label: 'Malware Payloads', query: 'urlhaus' }
        ].map(filter => (
          <button
            key={filter.label}
            onClick={() => { setSearch(filter.query); fetchHistory(filter.query); }}
            style={{
              background: search === filter.query ? 'rgba(0, 209, 255, 0.2)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${search === filter.query ? theme.colors.exploit : 'rgba(255,255,255,0.1)'}`,
              color: search === filter.query ? '#fff' : theme.colors.textDim,
              padding: '6px 12px',
              borderRadius: '100px',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: theme.fonts.display,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              transition: 'all 0.2s',
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div style={{ 
        overflowY: 'auto', 
        flex: 1, 
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        paddingRight: '8px' // scrollbar spacing
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>
            Decrypting threat logs...
          </div>
        ) : error ? (
          <div style={{ padding: '60px', textAlign: 'center', color: theme.colors.danger, fontFamily: theme.fonts.mono }}>
            DATABASE ERROR: {error}
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>
            NO INTELLIGENCE LOGS FOUND MATCHING SECURE QUERY.
          </div>
        ) : (
          history.map((event, idx) => {
            const threatColor = getAttackColor(event.a_t);
            return (
              <GlassPanel 
                key={event.id || idx}
                style={{
                  padding: '16px 24px',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(140px, 1fr) 2.5fr 1.5fr 1.5fr minmax(100px, 1fr)',
                  alignItems: 'center',
                  gap: '24px',
                  background: 'rgba(10, 16, 24, 0.4)',
                  border: '1px solid rgba(255,255,255,0.03)',
                  borderLeft: `4px solid ${threatColor}`,
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                  cursor: 'default',
                }}
                onMouseOver={(e: any) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.boxShadow = `0 4px 20px ${threatColor}20`;
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseOut={(e: any) => {
                  e.currentTarget.style.background = 'rgba(10, 16, 24, 0.4)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                {/* 1. Timestamp & Threat Icon */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {event.a_t === 'malware' ? '💀' : event.a_t === 'phishing' ? '🎣' : '🐛'}
                    <span style={{ 
                      color: threatColor, fontWeight: 800, textTransform: 'uppercase', 
                      fontSize: '11px', fontFamily: theme.fonts.display, letterSpacing: 1
                    }}>
                      {event.a_t}
                    </span>
                  </div>
                  <span style={{ color: theme.colors.textDim, fontFamily: theme.fonts.mono, fontSize: '11px' }}>
                    {new Date(event.timestamp || event.ts || Date.now()).toLocaleTimeString()} <br/>
                    {new Date(event.timestamp || event.ts || Date.now()).toLocaleDateString()}
                  </span>
                </div>

                {/* 2. Attack Description & Metadata */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: '14px', lineHeight: 1.4 }}>
                    {event.a_n}
                  </span>
                  
                  {event.meta && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {event.meta.malware_family && (
                        <span style={{ fontSize: '10px', background: 'rgba(204, 51, 255, 0.15)', border: '1px solid rgba(204,51,255,0.3)', color: '#D466FF', padding: '2px 8px', borderRadius: '100px', fontFamily: theme.fonts.mono }}>
                          {event.meta.malware_family}
                        </span>
                      )}
                      {event.meta.port && (
                        <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '2px 8px', borderRadius: '100px', fontFamily: theme.fonts.mono }}>
                          PORT: {event.meta.port}
                        </span>
                      )}
                      {event.meta.tags?.slice(0, 3).map((tag: string) => (
                        <span key={tag} style={{ fontSize: '10px', background: 'rgba(0, 209, 255, 0.1)', border: '1px solid rgba(0,209,255,0.2)', color: '#00D1FF', padding: '2px 8px', borderRadius: '100px', fontFamily: theme.fonts.mono }}>
                          #{tag.replace('#','')}
                        </span>
                      ))}
                      {event.meta?.url && (
                        <a href={event.meta.url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', background: 'rgba(0, 255, 136, 0.1)', border: '1px solid rgba(0,255,136,0.3)', color: '#00FF88', padding: '2px 8px', borderRadius: '100px', fontFamily: theme.fonts.display, textDecoration: 'none', fontWeight: 600, letterSpacing: 0.5 }}>
                          VIEW SOURCE ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Source IP */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Origin / Attacker</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{getFlagEmoji(event.s_co)}</span>
                    <code style={{ color: theme.colors.textSecondary, fontSize: '13px', fontFamily: theme.fonts.mono }}>
                      {event.s_ip}
                    </code>
                  </div>
                  {event.meta?.as_name && (
                    <span style={{ fontSize: '10px', color: theme.colors.textDim, marginLeft: '24px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {event.meta.as_name}
                    </span>
                  )}
                </div>

                {/* 4. Target IP */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Victim</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{getFlagEmoji(event.d_co)}</span>
                    <code style={{ color: '#fff', fontSize: '13px', fontFamily: theme.fonts.mono }}>
                      {event.d_ip || 'Internal Asset'}
                    </code>
                  </div>
                </div>

                {/* 5. Provider / Feeds */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{
                    padding: '4px 12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '100px',
                    fontSize: '10px',
                    fontFamily: theme.fonts.display,
                    color: theme.colors.textDim,
                    textTransform: 'uppercase',
                    letterSpacing: 1
                  }}>
                    {event.source_api || 'unknown'}
                  </span>
                </div>

              </GlassPanel>
            );
          })
        )}
      </div>
    </div>
  );
}

function getFlagEmoji(countryCode: string) {
  if (!countryCode || countryCode === '??' || countryCode === 'UN') return '🌐';
  const codePoints = [...countryCode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}
