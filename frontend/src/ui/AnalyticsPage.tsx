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

interface GalaxyActor {
  name: string; uuid: string; description: string;
  country: string | null; stateSponsor: string | null;
  victims: string[]; targetSectors: string[];
  incidentType: string | null; synonyms: string[]; refs: string[];
}

interface GalaxyRansomware {
  name: string; uuid: string; description: string;
  synonyms: string[]; refs: string[];
  encryption: string | null; extensions: string | null;
  ransomnotes: string | null;
}

interface GalaxyTool {
  name: string; uuid: string; description: string;
  synonyms: string[]; refs: string[]; type: string[];
}

interface GalaxyStats {
  totalActors: number; totalRansomware: number;
  totalTools: number; totalExploitKits: number;
  byCountry: Record<string, number>;
  bySector: Record<string, number>;
  byIncident: Record<string, number>;
  byVictim: Record<string, number>;
  lastFetch: number | null;
}

type Tab = 'countries' | 'trends' | 'actors' | 'malware' | 'explorer';
type Period = '24h' | '7d' | '30d';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const FLAG: Record<string, string> = {
  US:'🇺🇸',CN:'🇨🇳',RU:'🇷🇺',DE:'🇩🇪',GB:'🇬🇧',BR:'🇧🇷',IN:'🇮🇳',JP:'🇯🇵',AU:'🇦🇺',FR:'🇫🇷',
  KR:'🇰🇷',IL:'🇮🇱',NL:'🇳🇱',SE:'🇸🇪',CA:'🇨🇦',SG:'🇸🇬',ZA:'🇿🇦',MX:'🇲🇽',TR:'🇹🇷',UA:'🇺🇦',
  IT:'🇮🇹',ES:'🇪🇸',PL:'🇵🇱',ID:'🇮🇩',EG:'🇪🇬',NG:'🇳🇬',AR:'🇦🇷',TH:'🇹🇭',VN:'🇻🇳',PK:'🇵🇰',
  IR:'🇮🇷',CZ:'🇨🇿',GR:'🇬🇷',FI:'🇫🇮',NZ:'🇳🇿',IE:'🇮🇪',AT:'🇦🇹',EE:'🇪🇪',SA:'🇸🇦',AE:'🇦🇪',
  KP:'🇰🇵',TW:'🇹🇼',MY:'🇲🇾',PH:'🇵🇭',
};
function flag(co: string) {
  if (!co || co === '??') return '🌐';
  if (FLAG[co]) return FLAG[co];
  try { return String.fromCodePoint(...[...co.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)); } catch { return co; }
}
function fmt(n: number) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return n.toLocaleString(); }

// Country name → CC for Galaxy data display
const CNAME_TO_CC: Record<string, string> = {
  'china':'CN','united states':'US','russia':'RU','iran':'IR','north korea':'KP',
  'south korea':'KR','korea (republic of)':'KR','israel':'IL','india':'IN','pakistan':'PK',
  'turkey':'TR','ukraine':'UA','vietnam':'VN','united kingdom':'GB','germany':'DE',
  'france':'FR','japan':'JP','saudi arabia':'SA','taiwan':'TW','singapore':'SG',
  'australia':'AU','brazil':'BR','netherlands':'NL','canada':'CA','italy':'IT','spain':'ES',
  'philippines':'PH','indonesia':'ID','thailand':'TH','malaysia':'MY','nigeria':'NG',
  'egypt':'EG','poland':'PL','sweden':'SE','united arab emirates':'AE','hong kong':'HK',
  'belgium':'BE','switzerland':'CH','norway':'NO','luxembourg':'LU','south africa':'ZA',
  'nepal':'NP','myanmar':'MM','cambodia':'KH','laos':'LA',
};
function countryToCC(name: string) { return CNAME_TO_CC[name.toLowerCase()] || name.slice(0,2).toUpperCase(); }

const SECTOR_COLORS: Record<string, string> = {
  'Private sector': '#F59E0B', 'Government': '#6366F1', 'Military': '#EF4444',
  'Civil society': '#10B981', 'Defense': '#DC2626', 'Technology': '#3B82F6',
  'Telecoms': '#14B8A6', 'Health': '#EC4899', 'Finance': '#F59E0B',
  'Chemical': '#84CC16', 'Energy': '#EAB308', 'Education': '#A855F7',
  'Intelligence': '#8B5CF6', 'Mining': '#78716C', 'Justice': '#475569',
  'Political party': '#D946EF',
};
function sectorColor(s: string) {
  if (SECTOR_COLORS[s]) return SECTOR_COLORS[s];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 55%)`;
}

interface ActorFilters {
  country: string;
  sector: string;
  search: string;
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('actors');
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

  // Galaxy state
  const [actors, setActors] = useState<GalaxyActor[]>([]);
  const [ransomware, setRansomware] = useState<GalaxyRansomware[]>([]);
  const [tools, setTools] = useState<GalaxyTool[]>([]);
  const [galaxyStats, setGalaxyStats] = useState<GalaxyStats | null>(null);

  // Initial filters for drill-down
  const [actorFilters, setActorFilters] = useState<ActorFilters>({ country: '', sector: '', search: '' });

  const drillToActors = useCallback((filters: Partial<ActorFilters>) => {
    setActorFilters(prev => ({ ...prev, ...filters }));
    setTab('actors');
  }, []);

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

  // Fetch Galaxy actors
  const fetchActors = useCallback(async () => {
    setLoading(true);
    try {
      const [actorRes, statsRes] = await Promise.all([
        fetch(`${API}/api/galaxy/actors`),
        fetch(`${API}/api/galaxy/stats`)
      ]);
      const aData = await actorRes.json();
      const sData = await statsRes.json();
      setActors(aData.actors || []);
      setGalaxyStats(sData);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  // Fetch Galaxy malware/ransomware & tools
  const fetchMalware = useCallback(async () => {
    setLoading(true);
    try {
      const [rwRes, toolRes] = await Promise.all([
        fetch(`${API}/api/galaxy/ransomware`),
        fetch(`${API}/api/galaxy/tools`)
      ]);
      const rwData = await rwRes.json();
      const toolData = await toolRes.json();
      setRansomware(rwData.ransomware || []);
      setTools(toolData.tools || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  // Fetch Galaxy explorer (all stats)
  const fetchExplorer = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/galaxy/stats`);
      const d = await r.json();
      setGalaxyStats(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'countries') fetchCountries();
    else if (tab === 'trends') fetchTrends();
    else if (tab === 'actors') fetchActors();
    else if (tab === 'malware') fetchMalware();
    else if (tab === 'explorer') fetchExplorer();
  }, [tab, fetchCountries, fetchTrends, fetchActors, fetchMalware, fetchExplorer]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: theme.fonts.body }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.panelBorder}`, paddingBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: theme.fonts.display, fontSize: 26, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#fff', margin: 0 }}>
            Threat Analytics
          </h1>
          <p style={{ color: theme.colors.textDim, fontSize: 13, marginTop: 3, marginBottom: 0 }}>
            Powered by MISP Galaxy · Threat Intelligence Knowledge Base · {galaxyStats ? `${fmt(galaxyStats.totalActors)} Actors · ${fmt(galaxyStats.totalRansomware)} Ransomware` : 'Loading…'}
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
          { id: 'actors' as Tab, label: '🛡️ Threat Actors', color: '#EF4444' },
          { id: 'malware' as Tab, label: '🦠 Malware & Ransomware', color: '#F59E0B' },
          { id: 'countries' as Tab, label: '🌍 Country Classification', color: '#3B82F6' },
          { id: 'trends' as Tab, label: '📈 Trend Analysis', color: '#10B981' },
          { id: 'explorer' as Tab, label: '🔗 Galaxy Explorer', color: '#8B5CF6' },
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
      {loading && <div style={{ textAlign: 'center', padding: 20, color: theme.colors.textDim, fontSize: 12, fontFamily: theme.fonts.display, letterSpacing: 2, textTransform: 'uppercase', animation: 'pulse 1.5s infinite' }}>Loading MISP Galaxy intelligence data…</div>}

      {/* Tab Content */}
      {!loading && tab === 'actors' && <ActorsTab actors={actors} initialFilters={actorFilters} onFiltersChange={setActorFilters} />}
      {!loading && tab === 'malware' && <MalwareTab ransomware={ransomware} tools={tools} />}
      {!loading && tab === 'countries' && <CountriesTab countries={countries} totalGlobal={totalGlobal} selected={selectedCountry} onSelect={setSelectedCountry} />}
      {!loading && tab === 'trends' && <TrendsTab timeline={timeline} byType={byType} changePercent={changePercent} currentTotal={currentTotal} period={period} country={trendCountry} onCountryChange={setTrendCountry} onRefresh={fetchTrends} />}
      {!loading && tab === 'explorer' && <ExplorerTab stats={galaxyStats} onDrillDown={drillToActors} />}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1: Threat Actors (MISP Galaxy)                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ActorsTab({ actors, initialFilters, onFiltersChange }: {
  actors: GalaxyActor[];
  initialFilters: ActorFilters;
  onFiltersChange: (f: ActorFilters) => void;
}) {
  const [search, setSearch] = useState(initialFilters.search || '');
  const [countryFilter, setCountryFilter] = useState(initialFilters.country || '');
  const [sectorFilter, setSectorFilter] = useState(initialFilters.sector || '');
  const [selectedActor, setSelectedActor] = useState<GalaxyActor | null>(null);

  // Sync internal state with props (important for drill-downs)
  useEffect(() => {
    setSearch(initialFilters.search || '');
    setCountryFilter(initialFilters.country || '');
    setSectorFilter(initialFilters.sector || '');
  }, [initialFilters]);

  const filtered = useMemo(() => {
    let result = actors;
    if (countryFilter) result = result.filter(a => (a.country || '').toUpperCase() === countryFilter.toUpperCase());
    if (sectorFilter) result = result.filter(a => a.targetSectors.includes(sectorFilter));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.synonyms.some(s => s.toLowerCase().includes(q))
      );
    }
    return result;
  }, [actors, search, countryFilter, sectorFilter]);

  // By country stats
  const countryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    actors.forEach(a => { if (a.country) map[a.country] = (map[a.country] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [actors]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedActor ? '1fr 420px' : '1fr', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* MISP Galaxy banner */}
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 11, color: '#EF4444', fontFamily: theme.fonts.display }}>
          🛡️ Intelligence from <strong>MISP Galaxy Threat Actor Cluster</strong> — {actors.length} known adversary groups with country attribution, target sectors, and synonyms from the open-source MISP knowledge base.
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KPI label="Total Actors" value={String(actors.length)} color="#EF4444" />
          <KPI label="State-Sponsored" value={String(actors.filter(a => a.stateSponsor).length)} color="#F59E0B" />
          <KPI label="Countries" value={String(countryBreakdown.length)} color="#3B82F6" />
          <KPI label="With Victims" value={String(actors.filter(a => a.victims.length > 0).length)} color="#10B981" />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={search} onChange={e => { setSearch(e.target.value); onFiltersChange({ ...initialFilters, search: e.target.value }); }} placeholder="Search actors, synonyms (e.g. APT28, Fancy Bear)…"
            style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, fontFamily: theme.fonts.mono, outline: 'none' }} />

          {sectorFilter && (
            <div onClick={() => { setSectorFilter(''); onFiltersChange({ ...initialFilters, sector: '' }); }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: `${sectorColor(sectorFilter)}20`, border: `1px solid ${sectorColor(sectorFilter)}50`, borderRadius: 8, cursor: 'pointer', color: sectorColor(sectorFilter), fontSize: 11, fontWeight: 700
            }}>
               sektor: {sectorFilter} <span style={{ opacity: 0.5 }}>×</span>
            </div>
          )}

          <input value={countryFilter} onChange={e => { const v = e.target.value.toUpperCase().slice(0, 2); setCountryFilter(v); onFiltersChange({ ...initialFilters, country: v }); }} placeholder="CC" maxLength={2}
            style={{ width: 50, padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, fontFamily: theme.fonts.mono, outline: 'none', textAlign: 'center' }} />
        </div>

        {/* Country Distribution Bar */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 14 }}>
            Threat Actors by State Sponsor
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {countryBreakdown.slice(0, 15).map(([cc, count]) => (
              <div key={cc} onClick={() => {
                const newCo = countryFilter === cc ? '' : cc;
                setCountryFilter(newCo);
                onFiltersChange({ ...initialFilters, country: newCo });
              }} style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
                background: countryFilter === cc ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${countryFilter === cc ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <span style={{ fontSize: 16, marginRight: 6 }}>{flag(cc)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: countryFilter === cc ? '#EF4444' : '#fff' }}>{cc}</span>
                <span style={{ fontSize: 10, color: theme.colors.textDim, marginLeft: 6, fontFamily: theme.fonts.mono }}>{count}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Actor List */}
        <GlassPanel>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary }}>
              {filtered.length === actors.length ? 'All Threat Actors' : `Filtered: ${filtered.length} of ${actors.length}`}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
            {filtered.slice(0, 50).map(actor => {
              const isSelected = selectedActor?.uuid === actor.uuid;
              return (
                <div key={actor.uuid} onClick={() => setSelectedActor(isSelected ? null : actor)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: isSelected ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                  transition: 'all 0.2s',
                }}>
                  <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{actor.country ? flag(actor.country) : '🌐'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#EF4444' : '#fff' }}>{actor.name}</span>
                      {actor.incidentType && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#818CF8', fontWeight: 600, textTransform: 'uppercase' }}>{actor.incidentType}</span>}
                    </div>
                    {actor.synonyms.length > 0 && (
                      <div style={{ fontSize: 10, color: theme.colors.textDim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {actor.synonyms.slice(0, 4).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {actor.targetSectors.slice(0, 2).map(s => (
                      <span key={s} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${sectorColor(s)}18`, color: sectorColor(s), fontWeight: 600 }}>{s}</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>{actor.victims.length > 0 ? `${actor.victims.length} victims` : ''}</span>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </div>

      {/* Actor Detail Panel */}
      {selectedActor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <GlassPanel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>{selectedActor.country ? flag(selectedActor.country) : '🌐'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#EF4444', fontFamily: theme.fonts.display }}>{selectedActor.name}</div>
                <div style={{ fontSize: 11, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {selectedActor.stateSponsor ? `State Sponsor: ${selectedActor.stateSponsor}` : 'Attribution Unknown'}
                </div>
              </div>
              <button onClick={() => setSelectedActor(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: theme.colors.textDim, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Description */}
            {selectedActor.description && (
              <div style={{ fontSize: 12, color: theme.colors.textDim, lineHeight: 1.6, marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '3px solid rgba(239,68,68,0.3)' }}>
                {selectedActor.description}
              </div>
            )}

            {/* Synonyms */}
            {selectedActor.synonyms.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 8 }}>Also Known As</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedActor.synonyms.map(s => (
                    <span key={s} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#FCA5A5', fontWeight: 500 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Target Sectors */}
            {selectedActor.targetSectors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 8 }}>Target Sectors</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedActor.targetSectors.map(s => (
                    <span key={s} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: `${sectorColor(s)}15`, color: sectorColor(s), fontWeight: 600, border: `1px solid ${sectorColor(s)}30` }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Victims */}
            {selectedActor.victims.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 8 }}>Suspected Victims</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedActor.victims.map(v => {
                    const cc = countryToCC(v);
                    return <span key={v} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#93C5FD' }}>{flag(cc)} {v}</span>;
                  })}
                </div>
              </div>
            )}

            {/* References */}
            {selectedActor.refs.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 8 }}>References</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selectedActor.refs.map((r, i) => {
                    let domain = '';
                    try { domain = new URL(r).hostname; } catch { domain = r.slice(0, 40); }
                    return <a key={i} href={r} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#60A5FA', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔗 {domain}</a>;
                  })}
                </div>
              </div>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2: Malware & Ransomware (MISP Galaxy)                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function MalwareTab({ ransomware, tools }: { ransomware: GalaxyRansomware[]; tools: GalaxyTool[] }) {
  const [subTab, setSubTab] = useState<'ransomware' | 'tools'>('ransomware');
  const [search, setSearch] = useState('');
  const [selectedRw, setSelectedRw] = useState<GalaxyRansomware | null>(null);
  const [selectedTool, setSelectedTool] = useState<GalaxyTool | null>(null);

  const filteredRw = useMemo(() => {
    if (!search) return ransomware.slice(0, 100);
    const q = search.toLowerCase();
    return ransomware.filter(r => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.synonyms.some(s => s.toLowerCase().includes(q))).slice(0, 100);
  }, [ransomware, search]);

  const filteredTools = useMemo(() => {
    if (!search) return tools.slice(0, 100);
    const q = search.toLowerCase();
    return tools.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.synonyms.some(s => s.toLowerCase().includes(q))).slice(0, 100);
  }, [tools, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info Banner */}
      <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 11, color: '#F59E0B', fontFamily: theme.fonts.display }}>
        🦠 <strong>MISP Galaxy Malware Intelligence</strong> — {ransomware.length} ransomware families · {tools.length} adversary tools from the open-source MISP knowledge base.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KPI label="Ransomware Families" value={fmt(ransomware.length)} color="#EF4444" />
        <KPI label="Adversary Tools" value={fmt(tools.length)} color="#F59E0B" />
        <KPI label="Total Entries" value={fmt(ransomware.length + tools.length)} color="#8B5CF6" />
      </div>

      {/* Sub-tab toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['ransomware', 'tools'] as const).map(st => (
          <button key={st} onClick={() => { setSubTab(st); setSearch(''); setSelectedRw(null); setSelectedTool(null); }} style={{
            flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: subTab === st ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
            color: subTab === st ? '#F59E0B' : theme.colors.textDim,
            fontFamily: theme.fonts.display, fontSize: 12, fontWeight: subTab === st ? 700 : 400, letterSpacing: 1, textTransform: 'uppercase',
          }}>{st === 'ransomware' ? `🔒 Ransomware (${ransomware.length})` : `🔧 Tools (${tools.length})`}</button>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${subTab}… (e.g. ${subTab === 'ransomware' ? 'WannaCry, LockBit' : 'Cobalt Strike, Mimikatz'})`}
        style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, fontFamily: theme.fonts.mono, outline: 'none' }} />

      <div style={{ display: 'grid', gridTemplateColumns: (selectedRw || selectedTool) ? '1fr 380px' : '1fr', gap: 20 }}>
        {/* List */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 12 }}>
            {subTab === 'ransomware' ? 'Ransomware Families' : 'Adversary Tools'} {search && `· matching "${search}"`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
            {subTab === 'ransomware' ? filteredRw.map(rw => (
              <div key={rw.uuid} onClick={() => { setSelectedRw(selectedRw?.uuid === rw.uuid ? null : rw); setSelectedTool(null); }} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                background: selectedRw?.uuid === rw.uuid ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${selectedRw?.uuid === rw.uuid ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: 20 }}>🔒</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: selectedRw?.uuid === rw.uuid ? '#EF4444' : '#fff' }}>{rw.name}</div>
                  {rw.synonyms.length > 0 && <div style={{ fontSize: 10, color: theme.colors.textDim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rw.synonyms.slice(0, 3).join(' · ')}</div>}
                </div>
                {rw.encryption && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>{rw.encryption}</span>}
              </div>
            )) : filteredTools.map(tool => (
              <div key={tool.uuid} onClick={() => { setSelectedTool(selectedTool?.uuid === tool.uuid ? null : tool); setSelectedRw(null); }} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                background: selectedTool?.uuid === tool.uuid ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${selectedTool?.uuid === tool.uuid ? 'rgba(245,158,11,0.3)' : 'transparent'}`,
                transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: 20 }}>🔧</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: selectedTool?.uuid === tool.uuid ? '#F59E0B' : '#fff' }}>{tool.name}</div>
                  {tool.synonyms.length > 0 && <div style={{ fontSize: 10, color: theme.colors.textDim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.synonyms.slice(0, 3).join(' · ')}</div>}
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Detail Panel */}
        {(selectedRw || selectedTool) && (
          <GlassPanel>
            {selectedRw && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 36 }}>🔒</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#EF4444', fontFamily: theme.fonts.display }}>{selectedRw.name}</div>
                    <div style={{ fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Ransomware Family</div>
                  </div>
                  <button onClick={() => setSelectedRw(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: theme.colors.textDim, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                {selectedRw.description && <div style={{ fontSize: 12, color: theme.colors.textDim, lineHeight: 1.6, marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '3px solid rgba(239,68,68,0.3)' }}>{selectedRw.description}</div>}
                {selectedRw.synonyms.length > 0 && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 6 }}>Aliases</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{selectedRw.synonyms.map(s => <span key={s} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#FCA5A5' }}>{s}</span>)}</div></div>}
                {selectedRw.encryption && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 4 }}>Encryption</div><div style={{ fontSize: 12, color: '#fff', fontFamily: theme.fonts.mono }}>{selectedRw.encryption}</div></div>}
                {selectedRw.extensions && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 4 }}>File Extensions</div><div style={{ fontSize: 12, color: '#fff', fontFamily: theme.fonts.mono }}>{selectedRw.extensions}</div></div>}
                {selectedRw.refs.length > 0 && <div><div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 6 }}>References</div>{selectedRw.refs.map((r, i) => { let d = ''; try { d = new URL(r).hostname; } catch { d = r.slice(0, 40); } return <a key={i} href={r} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 10, color: '#60A5FA', textDecoration: 'none', marginBottom: 3 }}>🔗 {d}</a>; })}</div>}
              </>
            )}
            {selectedTool && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 36 }}>🔧</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#F59E0B', fontFamily: theme.fonts.display }}>{selectedTool.name}</div>
                    <div style={{ fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Adversary Tool</div>
                  </div>
                  <button onClick={() => setSelectedTool(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: theme.colors.textDim, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                {selectedTool.description && <div style={{ fontSize: 12, color: theme.colors.textDim, lineHeight: 1.6, marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '3px solid rgba(245,158,11,0.3)' }}>{selectedTool.description}</div>}
                {selectedTool.synonyms.length > 0 && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 6 }}>Aliases</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{selectedTool.synonyms.map(s => <span key={s} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#FCD34D' }}>{s}</span>)}</div></div>}
                {selectedTool.refs.length > 0 && <div><div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textSecondary, marginBottom: 6 }}>References</div>{selectedTool.refs.map((r, i) => { let d = ''; try { d = new URL(r).hostname; } catch { d = r.slice(0, 40); } return <a key={i} href={r} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 10, color: '#60A5FA', textDecoration: 'none', marginBottom: 3 }}>🔗 {d}</a>; })}</div>}
              </>
            )}
          </GlassPanel>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3: Countries                                                         */
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
/*  TAB 4: Trends                                                            */
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
/*  TAB 5: Galaxy Explorer                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ExplorerTab({ stats, onDrillDown }: { stats: GalaxyStats | null; onDrillDown: (f: Partial<ActorFilters>) => void }) {
  if (!stats) return <div style={{ padding: 40, textAlign: 'center', color: theme.colors.textDim }}>Loading Galaxy statistics…</div>;

  const sortedCountries = Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1]);
  const sortedSectors = Object.entries(stats.bySector).sort((a, b) => b[1] - a[1]);
  const sortedVictims = Object.entries(stats.byVictim).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const sortedIncidents = Object.entries(stats.byIncident).sort((a, b) => b[1] - a[1]);
  const maxCountry = Math.max(...sortedCountries.map(e => e[1]), 1);
  const maxSector = Math.max(...sortedSectors.map(e => e[1]), 1);
  const maxVictim = Math.max(...sortedVictims.map(e => e[1]), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Banner */}
      <div style={{ padding: '10px 16px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, fontSize: 11, color: '#8B5CF6', fontFamily: theme.fonts.display }}>
        🔗 <strong>MISP Galaxy Knowledge Base Explorer</strong> — Aggregated statistics across all Galaxy clusters. Data sourced from <a href="https://github.com/MISP/misp-galaxy" target="_blank" rel="noreferrer" style={{ color: '#A78BFA' }}>github.com/MISP/misp-galaxy</a>
        {stats.lastFetch && <span style={{ marginLeft: 12, opacity: 0.7 }}>Last updated: {new Date(stats.lastFetch).toLocaleTimeString()}</span>}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPI label="Threat Actors" value={fmt(stats.totalActors)} color="#EF4444" />
        <KPI label="Ransomware" value={fmt(stats.totalRansomware)} color="#F59E0B" />
        <KPI label="Adversary Tools" value={fmt(stats.totalTools)} color="#3B82F6" />
        <KPI label="Exploit Kits" value={fmt(stats.totalExploitKits)} color="#10B981" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* State Sponsors */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 14 }}>
            Threat Actors by State Sponsor
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedCountries.map(([cc, count]) => (
              <div key={cc} onClick={() => onDrillDown({ country: cc, sector: '', search: '' })} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s'
              }} className="hoverable-row">
                <span style={{ fontSize: 16, width: 28, textAlign: 'center' }}>{flag(cc)}</span>
                <span style={{ width: 24, fontSize: 11, fontWeight: 700, color: '#fff' }}>{cc}</span>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                  <div style={{ width: `${(count/maxCountry)*100}%`, height: '100%', background: 'linear-gradient(90deg, #EF444480, #EF4444)', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: theme.fonts.mono, color: '#EF4444', fontWeight: 600, width: 32, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Target Sectors */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 14 }}>
            Most Targeted Sectors
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedSectors.map(([sector, count]) => (
              <div key={sector} onClick={() => onDrillDown({ sector, country: '', search: '' })} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s'
              }} className="hoverable-row">
                <span style={{ fontSize: 12, fontWeight: 600, color: sectorColor(sector), width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sector}</span>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                  <div style={{ width: `${(count/maxSector)*100}%`, height: '100%', background: `linear-gradient(90deg, ${sectorColor(sector)}80, ${sectorColor(sector)})`, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: theme.fonts.mono, color: sectorColor(sector), fontWeight: 600, width: 32, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Most Targeted Countries */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 14 }}>
            Most Targeted Countries (Victim Count)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedVictims.map(([name, count]) => {
              const cc = countryToCC(name);
              return (
                <div key={name} onClick={() => onDrillDown({ search: name, country: '', sector: '' })} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s'
                }} className="hoverable-row">
                  <span style={{ fontSize: 14, width: 24, textAlign: 'center' }}>{flag(cc)}</span>
                  <span style={{ fontSize: 11, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                    <div style={{ width: `${(count/maxVictim)*100}%`, height: '100%', background: 'linear-gradient(90deg, #3B82F680, #3B82F6)', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, color: '#3B82F6', fontWeight: 600, width: 24, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </GlassPanel>

        {/* Incident Types */}
        <GlassPanel>
          <div style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 14 }}>
            Incident Types
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedIncidents.map(([type, count]) => {
              const total = Object.values(stats.byIncident).reduce((a, b) => a + b, 0);
              const pct = ((count / total) * 100).toFixed(1);
              const color = type === 'Espionage' ? '#8B5CF6' : type === 'Unknown' ? '#64748B' : '#F59E0B';
              return (
                <div key={type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color }}>{type}</span>
                    <span style={{ fontSize: 11, fontFamily: theme.fonts.mono, color: theme.colors.textDim }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassPanel>
    </div>
      <style>{`
        .hoverable-row:hover { background: rgba(255,255,255,0.05); }
      `}</style>
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
