import { useState, useEffect, useCallback, useMemo } from 'react';
import { GlassPanel } from './GlassPanel';
import { theme, getAttackColor } from '../theme/theme';

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface CountryRow {
  code: string; asOrigin: number; asTarget: number; total: number;
  topType: string | null; types: Record<string, number>;
}
interface TrendPoint { bucket: string; count: number; }
interface TrendTypePoint { bucket: string; type: string; count: number; }
interface SectorRow { name: string; count: number; percentage: string; topTypes: Record<string, number>; }
interface CombinedCountry { code: string; total: number; sectors: Record<string, number>; }
interface CombinedSector { name: string; total: number; }

type Tab = 'countries' | 'trends' | 'sectors' | 'combined';
type Period = '24h' | '7d' | '30d';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const FLAG: Record<string, string> = {
  US:'🇺🇸',CN:'🇨🇳',RU:'🇷🇺',DE:'🇩🇪',GB:'🇬🇧',BR:'🇧🇷',IN:'🇮🇳',JP:'🇯🇵',AU:'🇦🇺',FR:'🇫🇷',
  KR:'🇰🇷',IL:'🇮🇱',NL:'🇳🇱',SE:'🇸🇪',CA:'🇨🇦',SG:'🇸🇬',ZA:'🇿🇦',MX:'🇲🇽',TR:'🇹🇷',UA:'🇺🇦',
  IT:'🇮🇹',ES:'🇪🇸',PL:'🇵🇱',ID:'🇮🇩',EG:'🇪🇬',NG:'🇳🇬',AR:'🇦🇷',TH:'🇹🇭',VN:'🇻🇳',PK:'🇵🇰',
  IR:'🇮🇷',CZ:'🇨🇿',GR:'🇬🇷',FI:'🇫🇮',NZ:'🇳🇿',IE:'🇮🇪',AT:'🇦🇹',EE:'🇪🇪',SA:'🇸🇦',AE:'🇦🇪',
};
function flag(co: string) {
  if (!co || co === '??') return '🌐';
  if (FLAG[co]) return FLAG[co];
  try { return String.fromCodePoint(...[...co.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)); } catch { return co; }
}
function fmt(n: number) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return n.toLocaleString(); }

const SECTOR_ICONS: Record<string, string> = {
  'IT Infrastructure': '🖥️', 'Web Services': '🌐', 'Enterprise IT': '🏢',
  'Finance / Healthcare': '🏦', 'Finance / Business': '💼', 'Email / Communication': '📧',
  'Database Services': '🗄️', 'Enterprise SMB': '📁', 'Enterprise RDP': '🖱️',
  'Telecommunications': '📡', 'General / Other': '📊',
};

const SECTOR_COLORS: Record<string, string> = {
  'IT Infrastructure': '#3B82F6', 'Web Services': '#10B981', 'Enterprise IT': '#8B5CF6',
  'Finance / Healthcare': '#EF4444', 'Finance / Business': '#F59E0B', 'Email / Communication': '#06B6D4',
  'Database Services': '#EC4899', 'Enterprise SMB': '#F97316', 'Enterprise RDP': '#14B8A6',
  'Telecommunications': '#6366F1', 'General / Other': '#64748B',
};

/* ─── Main Component ──────────────────────────────────────────────────────── */

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('countries');
  const [period, setPeriod] = useState<Period>('24h');
  const [loading, setLoading] = useState(false);

  // Country tab state
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [totalGlobal, setTotalGlobal] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // Trend tab state
  const [timeline, setTimeline] = useState<TrendPoint[]>([]);
  const [byType, setByType] = useState<TrendTypePoint[]>([]);
  const [changePercent, setChangePercent] = useState(0);
  const [currentTotal, setCurrentTotal] = useState(0);
  const [trendCountry, setTrendCountry] = useState('');

  // Sector tab state
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [sectorTotal, setSectorTotal] = useState(0);

  // Combined tab state
  const [combCountries, setCombCountries] = useState<CombinedCountry[]>([]);
  const [combSectors, setCombSectors] = useState<CombinedSector[]>([]);
  const [combCountry, setCombCountry] = useState('');
  const [combSector, setCombSector] = useState('');

  const fromDate = useMemo(() => {
    const ms = period === '24h' ? 86400000 : period === '7d' ? 604800000 : 2592000000;
    return new Date(Date.now() - ms).toISOString();
  }, [period]);

  // Fetch country data
  const fetchCountries = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/analytics/countries?from=${fromDate}`);
      const d = await r.json();
      setCountries(d.countries || []);
      setTotalGlobal(d.totalGlobal || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [fromDate]);

  // Fetch trend data
  const fetchTrends = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (trendCountry) params.set('country', trendCountry);
      const r = await fetch(`${API}/api/analytics/trends?${params}`);
      const d = await r.json();
      setTimeline(d.timeline || []);
      setByType(d.byType || []);
      setChangePercent(d.changePercent || 0);
      setCurrentTotal(d.currentTotal || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [period, trendCountry]);

  // Fetch sector data
  const fetchSectors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromDate });
      const r = await fetch(`${API}/api/analytics/sectors?${params}`);
      const d = await r.json();
      setSectors(d.sectors || []);
      setSectorTotal(d.totalAnalyzed || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [fromDate]);

  // Fetch combined data
  const fetchCombined = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromDate });
      if (combCountry) params.set('country', combCountry);
      if (combSector) params.set('sector', combSector);
      const r = await fetch(`${API}/api/analytics/combined?${params}`);
      const d = await r.json();
      setCombCountries(d.countries || []);
      setCombSectors(d.sectors || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [fromDate, combCountry, combSector]);

  useEffect(() => {
    if (tab === 'countries') fetchCountries();
    else if (tab === 'trends') fetchTrends();
    else if (tab === 'sectors') fetchSectors();
    else if (tab === 'combined') fetchCombined();
  }, [tab, fetchCountries, fetchTrends, fetchSectors, fetchCombined]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: theme.fonts.body }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.panelBorder}`, paddingBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: theme.fonts.display, fontSize: 26, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#fff', margin: 0 }}>
            Threat Analytics
          </h1>
          <p style={{ color: theme.colors.textDim, fontSize: 13, marginTop: 3, marginBottom: 0 }}>
            Real MongoDB Data · Country Classification · Trends · Sectors
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 4 }}>
          {(['24h','7d','30d'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 14px', background: period === p ? 'rgba(0,209,255,0.2)' : 'transparent',
              border: 'none', borderRadius: 6, color: period === p ? '#fff' : theme.colors.textDim,
              fontSize: 12, fontFamily: theme.fonts.display, fontWeight: period === p ? 700 : 400,
              cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
        {([
          { id: 'countries' as Tab, label: '🌍 Country Classification', color: '#3B82F6' },
          { id: 'trends' as Tab, label: '📈 Trend Analysis', color: '#10B981' },
          { id: 'sectors' as Tab, label: '🏢 Sector Breakdown', color: '#F59E0B' },
          { id: 'combined' as Tab, label: '🔗 Country × Sector', color: '#8B5CF6' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tab === t.id ? `${t.color}20` : 'transparent',
            color: tab === t.id ? t.color : theme.colors.textDim,
            fontFamily: theme.fonts.display, fontSize: 12, fontWeight: tab === t.id ? 700 : 400,
            letterSpacing: 0.5, transition: 'all 0.2s',
            borderBottom: tab === t.id ? `2px solid ${t.color}` : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign: 'center', padding: 20, color: theme.colors.textDim, fontSize: 12, fontFamily: theme.fonts.display, letterSpacing: 2, textTransform: 'uppercase', animation: 'pulse 1.5s infinite' }}>Loading real data from database…</div>}

      {/* Tab Content */}
      {!loading && tab === 'countries' && <CountriesTab countries={countries} totalGlobal={totalGlobal} selected={selectedCountry} onSelect={setSelectedCountry} />}
      {!loading && tab === 'trends' && <TrendsTab timeline={timeline} byType={byType} changePercent={changePercent} currentTotal={currentTotal} period={period} country={trendCountry} onCountryChange={setTrendCountry} onRefresh={fetchTrends} />}
      {!loading && tab === 'sectors' && <SectorsTab sectors={sectors} total={sectorTotal} />}
      {!loading && tab === 'combined' && <CombinedTab countries={combCountries} sectors={combSectors} country={combCountry} sector={combSector} onCountryChange={setCombCountry} onSectorChange={setCombSector} />}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1: Countries                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */

function CountriesTab({ countries, totalGlobal, selected, onSelect }: {
  countries: CountryRow[]; totalGlobal: number; selected: string | null; onSelect: (c: string | null) => void;
}) {
  const top15 = countries.slice(0, 15);
  const maxBar = Math.max(...top15.map(c => c.total), 1);
  const detail = selected ? countries.find(c => c.code === selected) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: detail ? '1fr 380px' : '1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPI label="Countries Tracked" value={String(countries.length)} color="#3B82F6" />
          <KPI label="Total Events" value={fmt(totalGlobal)} color="#EF4444" />
          <KPI label="Top Origin" value={countries[0]?.code || '—'} color="#F59E0B" extra={countries[0] ? `${flag(countries[0].code)} ${fmt(countries[0].asOrigin)} attacks` : ''} />
        </div>

        {/* Bar Chart */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 16 }}>
            Top 15 Countries by Attack Volume
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {top15.map((c, i) => {
              const pct = (c.total / totalGlobal * 100).toFixed(1);
              const isSelected = selected === c.code;
              return (
                <div key={c.code} onClick={() => onSelect(isSelected ? null : c.code)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                  background: isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
                  transition: 'all 0.2s',
                }}>
                  <span style={{ width: 20, fontSize: 10, fontFamily: theme.fonts.mono, color: theme.colors.textDim, textAlign: 'right' }}>{i+1}</span>
                  <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{flag(c.code)}</span>
                  <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: isSelected ? '#3B82F6' : '#fff' }}>{c.code}</span>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(c.total/maxBar)*100}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg, #3B82F680, #3B82F6)`, transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: theme.fonts.mono, color: '#3B82F6', fontWeight: 600, width: 60, textAlign: 'right' }}>{fmt(c.total)}</span>
                  <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, color: theme.colors.textDim, width: 45, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </GlassPanel>

        {/* Full Table */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 12 }}>
            Full Country Classification Table
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['#','','Code','As Origin','As Target','Total','Risk %','Top Type'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textDim, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countries.slice(0, 30).map((c, i) => (
                  <tr key={c.code} onClick={() => onSelect(selected === c.code ? null : c.code)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: selected === c.code ? 'rgba(59,130,246,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                    <td style={{ padding: '8px 10px', color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>{i+1}</td>
                    <td style={{ padding: '8px 4px', fontSize: 16 }}>{flag(c.code)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#fff' }}>{c.code}</td>
                    <td style={{ padding: '8px 10px', color: theme.colors.exploit, fontFamily: theme.fonts.mono }}>{fmt(c.asOrigin)}</td>
                    <td style={{ padding: '8px 10px', color: theme.colors.phishing, fontFamily: theme.fonts.mono }}>{fmt(c.asTarget)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#fff', fontFamily: theme.fonts.mono }}>{fmt(c.total)}</td>
                    <td style={{ padding: '8px 10px', color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>{(c.total / Math.max(totalGlobal,1) * 100).toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px' }}>
                      {c.topType && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${getAttackColor(c.topType)}18`, color: getAttackColor(c.topType), fontWeight: 600, textTransform: 'uppercase' }}>{c.topType}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>

      {/* Drill-down panel */}
      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GlassPanel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>{flag(detail.code)}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: theme.fonts.display }}>{detail.code}</div>
                <div style={{ fontSize: 11, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Country Intelligence</div>
              </div>
              <button onClick={() => onSelect(null)} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: theme.colors.textDim, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <StatBox label="Attacks From" value={fmt(detail.asOrigin)} color={theme.colors.exploit} />
              <StatBox label="Attacks On" value={fmt(detail.asTarget)} color={theme.colors.phishing} />
            </div>
            <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 10 }}>Attack Type Breakdown</div>
            {Object.entries(detail.types).sort((a,b) => b[1]-a[1]).map(([type, count]) => {
              const pct = (count / Math.max(detail.total, 1) * 100);
              return (
                <div key={type} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: getAttackColor(type), textTransform: 'uppercase', fontWeight: 600 }}>{type}</span>
                    <span style={{ color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>{fmt(count)} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: getAttackColor(type), borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 16, fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 8 }}>Global Share</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#3B82F6', fontFamily: theme.fonts.display }}>
              {(detail.total / Math.max(totalGlobal, 1) * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 10, color: theme.colors.textDim }}>of all global threat activity</div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2: Trends                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

function TrendsTab({ timeline, byType, changePercent, currentTotal, period, country, onCountryChange, onRefresh }: {
  timeline: TrendPoint[]; byType: TrendTypePoint[]; changePercent: number; currentTotal: number;
  period: string; country: string; onCountryChange: (c: string) => void; onRefresh: () => void;
}) {
  const maxVal = Math.max(...timeline.map(t => t.count), 1);
  const W = 800, H = 200, padX = 40, padY = 20;
  const chartW = W - padX * 2, chartH = H - padY * 2;

  // Build type-separated data
  const types = ['exploit', 'malware', 'phishing'] as const;
  const buckets = timeline.map(t => t.bucket);
  const typeData: Record<string, number[]> = { exploit: [], malware: [], phishing: [] };
  buckets.forEach(b => {
    types.forEach(t => {
      const found = byType.find(bt => bt.bucket === b && bt.type === t);
      typeData[t].push(found?.count || 0);
    });
  });

  const buildPath = (values: number[]) => {
    if (values.length === 0) return '';
    return values.map((v, i) => {
      const x = padX + (i / Math.max(values.length - 1, 1)) * chartW;
      const y = padY + chartH - (v / maxVal) * chartH;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
  };

  const areaPath = (values: number[]) => {
    if (values.length === 0) return '';
    const line = buildPath(values);
    const lastX = padX + chartW;
    const firstX = padX;
    const baseY = padY + chartH;
    return `${line} L${lastX},${baseY} L${firstX},${baseY} Z`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPI label={`Total (${period})`} value={fmt(currentTotal)} color="#10B981" />
        <KPI label="vs Previous Period" value={`${changePercent >= 0 ? '+' : ''}${changePercent}%`} color={changePercent > 0 ? '#EF4444' : '#10B981'} />
        <KPI label="Data Points" value={String(timeline.length)} color="#3B82F6" />
        <div>
          <GlassPanel style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textDim, marginBottom: 6 }}>Filter Country</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={country} onChange={e => onCountryChange(e.target.value.toUpperCase().slice(0, 2))} placeholder="e.g. US" maxLength={2}
                style={{ flex: 1, padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 12, fontFamily: theme.fonts.mono, outline: 'none' }} />
              <button onClick={onRefresh} style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, color: '#10B981', fontSize: 11, cursor: 'pointer', fontFamily: theme.fonts.display }}>GO</button>
            </div>
          </GlassPanel>
        </div>
      </div>

      {/* Chart */}
      <GlassPanel>
        <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 16 }}>
          Attack Volume Timeline {country && `· ${flag(country)} ${country}`}
        </div>
        {timeline.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: theme.colors.textDim, fontSize: 13 }}>No trend data available for this period. Ensure the backend has stored events.</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H+30}`} style={{ width: '100%', height: 280 }}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(f => {
              const y = padY + chartH - f * chartH;
              return <g key={f}>
                <line x1={padX} y1={y} x2={padX+chartW} y2={y} stroke="rgba(255,255,255,0.05)" />
                <text x={padX-4} y={y+4} textAnchor="end" fontSize={9} fill={theme.colors.textDim}>{Math.round(maxVal*f)}</text>
              </g>;
            })}
            {/* Area fill for total */}
            <path d={areaPath(timeline.map(t => t.count))} fill="url(#trendGrad)" />
            <defs>
              <linearGradient id="trendGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {/* Type lines */}
            {types.map(t => (
              <path key={t} d={buildPath(typeData[t])} fill="none" stroke={getAttackColor(t)} strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
            ))}
            {/* Total line */}
            <path d={buildPath(timeline.map(t => t.count))} fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinecap="round" />
            {/* X-axis labels */}
            {timeline.filter((_, i) => i % Math.max(1, Math.floor(timeline.length / 8)) === 0).map((t, i) => {
              const idx = timeline.indexOf(t);
              const x = padX + (idx / Math.max(timeline.length - 1, 1)) * chartW;
              const label = t.bucket.includes('T') ? t.bucket.split('T')[1]?.slice(0,5) || t.bucket.slice(5) : t.bucket.slice(5);
              return <text key={i} x={x} y={H+16} textAnchor="middle" fontSize={9} fill={theme.colors.textDim}>{label}</text>;
            })}
          </svg>
        )}
        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8 }}>
          {[{ label: 'Total', color: '#10B981' }, { label: 'Exploit', color: theme.colors.exploit }, { label: 'Malware', color: theme.colors.malware }, { label: 'Phishing', color: theme.colors.phishing }].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.colors.textDim }}>
              <div style={{ width: 12, height: 3, borderRadius: 2, background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3: Sectors                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SectorsTab({ sectors, total }: { sectors: SectorRow[]; total: number }) {
  const maxCount = Math.max(...sectors.map(s => s.count), 1);

  // Donut chart data
  const donutSize = 180;
  const donutR = 70, donutInner = 48;
  let cumAngle = -90;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 11, color: '#F59E0B', fontFamily: theme.fonts.display }}>
        ⚠️ Sectors are estimated from port numbers, attack signatures, and intel source analysis — not from actual target industry data.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Donut */}
        <GlassPanel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`}>
            {sectors.map(s => {
              const pct = s.count / Math.max(total, 1);
              const angle = pct * 360;
              const startAngle = cumAngle;
              cumAngle += angle;
              const endAngle = cumAngle;
              const largeArc = angle > 180 ? 1 : 0;
              const cx = donutSize/2, cy = donutSize/2;
              const toRad = (a: number) => (a * Math.PI) / 180;
              const x1 = cx + donutR * Math.cos(toRad(startAngle));
              const y1 = cy + donutR * Math.sin(toRad(startAngle));
              const x2 = cx + donutR * Math.cos(toRad(endAngle));
              const y2 = cy + donutR * Math.sin(toRad(endAngle));
              const ix1 = cx + donutInner * Math.cos(toRad(endAngle));
              const iy1 = cy + donutInner * Math.sin(toRad(endAngle));
              const ix2 = cx + donutInner * Math.cos(toRad(startAngle));
              const iy2 = cy + donutInner * Math.sin(toRad(startAngle));
              const color = SECTOR_COLORS[s.name] || '#64748B';
              if (angle < 1) return null;
              return <path key={s.name} d={`M${x1},${y1} A${donutR},${donutR} 0 ${largeArc},1 ${x2},${y2} L${ix1},${iy1} A${donutInner},${donutInner} 0 ${largeArc},0 ${ix2},${iy2} Z`} fill={color} opacity={0.85} />;
            })}
            <text x={donutSize/2} y={donutSize/2-8} textAnchor="middle" fontSize={20} fontWeight={800} fill="#fff">{fmt(total)}</text>
            <text x={donutSize/2} y={donutSize/2+10} textAnchor="middle" fontSize={9} fill={theme.colors.textDim}>EVENTS</text>
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16, justifyContent: 'center' }}>
            {sectors.slice(0, 6).map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: theme.colors.textDim }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: SECTOR_COLORS[s.name] || '#64748B' }} />
                {s.name}
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Table */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 12 }}>Sector Distribution</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sectors.map((s, i) => {
              const color = SECTOR_COLORS[s.name] || '#64748B';
              const icon = SECTOR_ICONS[s.name] || '📊';
              const topType = Object.entries(s.topTypes).sort((a,b) => b[1]-a[1])[0];
              return (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${color}` }}>
                  <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, color: theme.colors.textDim, width: 16 }}>{i+1}</span>
                  <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{s.name}</span>
                      <span style={{ fontSize: 11, fontFamily: theme.fonts.mono, color }}>{fmt(s.count)} · {s.percentage}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                      <div style={{ width: `${(s.count/maxCount)*100}%`, height: '100%', background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                    {topType && <div style={{ fontSize: 9, color: theme.colors.textDim, marginTop: 4 }}>Top: <span style={{ color: getAttackColor(topType[0]) }}>{topType[0]}</span> ({fmt(topType[1])})</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 4: Combined (Country × Sector)                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

function CombinedTab({ countries, sectors, country, sector, onCountryChange, onSectorChange }: {
  countries: CombinedCountry[]; sectors: CombinedSector[];
  country: string; sector: string;
  onCountryChange: (c: string) => void; onSectorChange: (s: string) => void;
}) {
  const allSectorNames = useMemo(() => {
    const names = new Set<string>();
    countries.forEach(c => Object.keys(c.sectors).forEach(s => names.add(s)));
    return [...names].sort();
  }, [countries]);

  const maxCell = useMemo(() => {
    let m = 1;
    countries.forEach(c => Object.values(c.sectors).forEach(v => { if (v > m) m = v; }));
    return m;
  }, [countries]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <GlassPanel style={{ padding: '12px 16px', flex: '1 1 200px' }}>
          <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textDim, marginBottom: 6 }}>Filter by Country</div>
          <input value={country} onChange={e => onCountryChange(e.target.value.toUpperCase().slice(0, 2))} placeholder="e.g. US (leave empty for all)"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, fontFamily: theme.fonts.mono, outline: 'none' }} />
        </GlassPanel>
        <GlassPanel style={{ padding: '12px 16px', flex: '1 1 300px' }}>
          <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textDim, marginBottom: 6 }}>Filter by Sector</div>
          <select value={sector} onChange={e => onSectorChange(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            <option value="">All Sectors</option>
            {sectors.map(s => <option key={s.name} value={s.name}>{s.name} ({fmt(s.total)})</option>)}
          </select>
        </GlassPanel>
      </div>

      {/* Heatmap Grid */}
      <GlassPanel>
        <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 16 }}>
          Country × Sector Heatmap {country && `· ${flag(country)} ${country}`} {sector && `· ${sector}`}
        </div>
        {countries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: theme.colors.textDim, fontSize: 13 }}>No data. Try adjusting filters or ensure the backend has stored events.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.display, letterSpacing: 1, minWidth: 60 }}>Country</th>
                  {allSectorNames.map(s => (
                    <th key={s} style={{ padding: '6px 4px', fontSize: 9, color: SECTOR_COLORS[s] || theme.colors.textDim, fontFamily: theme.fonts.display, letterSpacing: 0.5, textAlign: 'center', minWidth: 50, maxWidth: 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {SECTOR_ICONS[s] || '📊'}<br/>{s.split('/')[0].trim()}
                    </th>
                  ))}
                  <th style={{ padding: '8px', fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.display, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {countries.slice(0, 15).map(c => (
                  <tr key={c.code} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>
                      <span style={{ fontSize: 14, marginRight: 6 }}>{flag(c.code)}</span>
                      <span style={{ color: '#fff' }}>{c.code}</span>
                    </td>
                    {allSectorNames.map(s => {
                      const val = c.sectors[s] || 0;
                      const intensity = val / maxCell;
                      const color = SECTOR_COLORS[s] || '#64748B';
                      return (
                        <td key={s} style={{ padding: '4px', textAlign: 'center' }}>
                          {val > 0 ? (
                            <div style={{
                              display: 'inline-block', padding: '4px 6px', borderRadius: 4,
                              background: `${color}${Math.round(intensity * 40 + 10).toString(16).padStart(2, '0')}`,
                              color: intensity > 0.3 ? color : theme.colors.textDim,
                              fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: intensity > 0.5 ? 700 : 400,
                              minWidth: 28
                            }}>{fmt(val)}</div>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.08)', fontSize: 10 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: theme.fonts.mono, color: '#fff', fontWeight: 700 }}>{fmt(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      {/* Sector Summary */}
      <GlassPanel>
        <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 12 }}>
          Sector Totals {country && `for ${flag(country)} ${country}`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {sectors.map(s => {
            const color = SECTOR_COLORS[s.name] || '#64748B';
            const icon = SECTOR_ICONS[s.name] || '📊';
            return (
              <div key={s.name} onClick={() => onSectorChange(sector === s.name ? '' : s.name)} style={{
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                background: sector === s.name ? `${color}15` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${sector === s.name ? `${color}40` : 'rgba(255,255,255,0.05)'}`,
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: sector === s.name ? color : '#fff', marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: theme.fonts.display }}>{fmt(s.total)}</div>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}

/* ─── Shared Sub-Components ───────────────────────────────────────────────── */

function KPI({ label, value, color, extra }: { label: string; value: string; color: string; extra?: string }) {
  return (
    <GlassPanel style={{ padding: '14px 18px', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textDim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: theme.fonts.display }}>{value}</div>
      {extra && <div style={{ fontSize: 10, color: theme.colors.textDim, marginTop: 2 }}>{extra}</div>}
    </GlassPanel>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: 12, background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: theme.fonts.display, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}
