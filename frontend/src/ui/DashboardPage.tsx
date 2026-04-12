import { useStreamStore } from '../stream/useStreamStore';
import { GlobeScene } from '../globe/GlobeScene';
import { GlassPanel } from './GlassPanel';
import { theme, getAttackColor } from '../theme/theme';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { ThreatEvent, TypeDistribution } from '../stream/types';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const FLAG_FALLBACK: Record<string, string> = {
  US: '🇺🇸', CN: '🇨🇳', RU: '🇷🇺', DE: '🇩🇪', GB: '🇬🇧', BR: '🇧🇷',
  IN: '🇮🇳', JP: '🇯🇵', AU: '🇦🇺', FR: '🇫🇷', KR: '🇰🇷', IL: '🇮🇱',
  NL: '🇳🇱', SE: '🇸🇪', CA: '🇨🇦', SG: '🇸🇬', ZA: '🇿🇦', MX: '🇲🇽',
  TR: '🇹🇷', UA: '🇺🇦', IT: '🇮🇹', ES: '🇪🇸', PL: '🇵🇱', ID: '🇮🇩',
  EG: '🇪🇬', NG: '🇳🇬', AR: '🇦🇷', TH: '🇹🇭', VN: '🇻🇳', PK: '🇵🇰',
  IR: '🇮🇷', CZ: '🇨🇿', GR: '🇬🇷', FI: '🇫🇮', NZ: '🇳🇿', IE: '🇮🇪',
  AT: '🇦🇹', EE: '🇪🇪', QA: '🇶🇦', MN: '🇲🇳', PA: '🇵🇦', GT: '🇬🇹',
  NP: '🇳🇵', KE: '🇰🇪', TN: '🇹🇳', MA: '🇲🇦', SA: '🇸🇦', AE: '🇦🇪',
};

function getFlag(co: string): string {
  if (!co || co === '??') return '🌐';
  if (FLAG_FALLBACK[co]) return FLAG_FALLBACK[co];
  try {
    const codePoints = [...co.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
  } catch { return co; }
}

function relativeTime(isoStr?: string | Date): string {
  if (!isoStr) return 'just now';
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diffSec < 5) return 'now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function matchesSearch(event: ThreatEvent, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    (event.a_n || '').toLowerCase().includes(lower) ||
    (event.s_ip || '').toLowerCase().includes(lower) ||
    (event.d_ip || '').toLowerCase().includes(lower) ||
    (event.s_co || '').toLowerCase().includes(lower) ||
    (event.d_co || '').toLowerCase().includes(lower) ||
    (event.source_api || '').toLowerCase().includes(lower) ||
    JSON.stringify(event.meta || {}).toLowerCase().includes(lower)
  );
}

/* ─── types ───────────────────────────────────────────────────────────────── */

type AttackType = 'exploit' | 'malware' | 'phishing';
type SortMode = 'count' | 'alpha';

/* ─── main component ──────────────────────────────────────────────────────── */

export function DashboardPage() {
  const totalAttacks_raw    = useStreamStore(s => s.totalAttacks);
  const counterData     = useStreamStore(s => s.counterData);
  const typeDistribution_raw  = useStreamStore(s => s.typeDistribution);
  const vectorDistribution_raw  = useStreamStore(s => s.vectorDistribution);
  const originDistribution_raw  = useStreamStore(s => s.originDistribution);
  const targetDistribution_raw  = useStreamStore(s => s.targetDistribution);
  const corridorDistribution_raw = useStreamStore(s => s.corridorDistribution);
  const sourceApiDistribution_raw = useStreamStore(s => s.sourceApiDistribution);
  const recentFeed_raw      = useStreamStore(s => s.recentEvents);
  const trendData       = useStreamStore(s => s.trendData);
  const eventBuffer     = useStreamStore(s => s.eventBuffer);

  const [timeMode, setTimeMode] = useState<'live' | 5 | 15 | 60>('live');

  const dvrData = useMemo(() => {
    if (timeMode === 'live') return null;
    const now = Date.now();
    const cutoff = now - timeMode * 60 * 1000;
    const events = eventBuffer.getAll().filter(e => new Date(e.ts || e.timestamp || now).getTime() >= cutoff);
    
    const typeDist = { exploit: 0, malware: 0, phishing: 0 };
    const vectorDist: Record<string, number> = {};
    const originDist: Record<string, number> = {};
    const targetDist: Record<string, number> = {};
    const corridorDist: Record<string, number> = {};
    const sourceApiDist: Record<string, number> = {};
    
    events.forEach(e => {
        if (e.a_t === 'exploit' || e.a_t === 'malware' || e.a_t === 'phishing') typeDist[e.a_t]++;
        
        // For IP-only sources, prioritize showing organization in Vector list
        const vectorName = e.meta?.organization || e.a_n;
        if (vectorName) vectorDist[vectorName] = (vectorDist[vectorName] || 0) + 1;
        
        if (e.s_co) originDist[e.s_co] = (originDist[e.s_co] || 0) + 1;
        if (e.d_co) targetDist[e.d_co] = (targetDist[e.d_co] || 0) + 1;
        if (e.s_co && e.d_co) corridorDist[`${e.s_co}-${e.d_co}`] = (corridorDist[`${e.s_co}-${e.d_co}`] || 0) + 1;
        if (e.source_api) sourceApiDist[e.source_api] = (sourceApiDist[e.source_api] || 0) + 1;
    });

    return {
      totalAttacks: events.length,
      typeDistribution: typeDist as TypeDistribution,
      vectorDistribution: vectorDist,
      originDistribution: originDist,
      targetDistribution: targetDist,
      corridorDistribution: corridorDist,
      sourceApiDistribution: sourceApiDist,
      recentFeed: events.slice(-40),
    };
  }, [timeMode, totalAttacks_raw, eventBuffer]);

  const activeData = dvrData || {
    totalAttacks: totalAttacks_raw,
    typeDistribution: typeDistribution_raw,
    vectorDistribution: vectorDistribution_raw,
    originDistribution: originDistribution_raw,
    targetDistribution: targetDistribution_raw,
    corridorDistribution: corridorDistribution_raw,
    sourceApiDistribution: sourceApiDistribution_raw,
    recentFeed: recentFeed_raw
  };

  const totalAttacks = activeData.totalAttacks;
  const typeDistribution = activeData.typeDistribution;
  const vectorDistribution = activeData.vectorDistribution;
  const originDistribution = activeData.originDistribution;
  const targetDistribution = activeData.targetDistribution;
  const corridorDistribution = activeData.corridorDistribution;
  const sourceApiDistribution = activeData.sourceApiDistribution;
  const recentFeed = activeData.recentFeed;

  const handleExportCSV = useCallback(() => {
    const dataToExport = dvrData ? eventBuffer.getAll().filter(e => new Date(e.ts || e.timestamp || Date.now()).getTime() >= Date.now() - (timeMode as number) * 60 * 1000) : eventBuffer.getAll();
    if (dataToExport.length === 0) return alert('No data to export');
    
    const BOM = "\uFEFF";
    const headers = ['Event ID', 'Local Time', 'Threat Type', 'Attack Vector', 'Source IP', 'Source Country', 'Target IP', 'Target Country', 'Intel Source'];
    
    const rows = dataToExport.map(e => {
      const date = new Date(e.ts || e.timestamp || Date.now()).toLocaleString();
      const type = e.a_t.toUpperCase();
      const name = `"${String(e.a_n || '').replace(/"/g, '""')}"`;
      return [
        e.id, `"${date}"`, type, name, e.s_ip, e.s_co, e.d_ip, e.d_co, e.source_api
      ].join(',');
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(BOM + headers.join(',') + '\n' + rows.join('\n'));
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `Threat_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [dvrData, eventBuffer, timeMode]);

  const handleExportJSON = useCallback(() => {
    const dataToExport = dvrData ? eventBuffer.getAll().filter(e => new Date(e.ts || e.timestamp || Date.now()).getTime() >= Date.now() - (timeMode as number) * 60 * 1000) : eventBuffer.getAll();
    if (dataToExport.length === 0) return alert('No data to export');

    const json = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    saveAs(blob, `Threat_Report_${new Date().toISOString().slice(0,10)}.json`);
  }, [dvrData, eventBuffer, timeMode]);

  const handleExportExcel = useCallback(async () => {
    const dataToExport = dvrData ? eventBuffer.getAll().filter(e => new Date(e.ts || e.timestamp || Date.now()).getTime() >= Date.now() - (timeMode as number) * 60 * 1000) : eventBuffer.getAll();
    if (dataToExport.length === 0) return alert('No data to export');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Threat Intel Report');

    sheet.mergeCells('A1', 'I2');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Global Command Center - Threat Intel Report';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A233A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.getRow(4).values = ['Event ID', 'Local Time', 'Threat Type', 'Attack Vector', 'Source IP', 'Source Country', 'Target IP', 'Target Country', 'Intel Source'];
    const headerRow = sheet.getRow(4);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00D1FF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.columns = [
        { key: 'id', width: 32 },
        { key: 'time', width: 22 },
        { key: 'type', width: 14 },
        { key: 'name', width: 40 },
        { key: 'sip', width: 16 },
        { key: 'sco', width: 16 },
        { key: 'dip', width: 16 },
        { key: 'dco', width: 16 },
        { key: 'api', width: 15 },
    ];

    dataToExport.forEach(e => {
        const row = sheet.addRow({
            id: e.id,
            time: new Date(e.ts || e.timestamp || Date.now()).toLocaleString(),
            type: e.a_t.toUpperCase(),
            name: e.a_n,
            sip: e.s_ip,
            sco: e.s_co,
            dip: e.d_ip,
            dco: e.d_co,
            api: e.source_api
        });
        
        const typeCell = row.getCell('type');
        typeCell.font = { bold: true, color: { argb: e.a_t === 'exploit' ? 'FFFF4444' : e.a_t === 'malware' ? 'FFFFD700' : 'FFCC33FF' } };
    });

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 4) {
            row.eachCell(cell => {
                cell.border = {
                    top: {style:'thin', color: {argb:'FFEEEEEE'}},
                    left: {style:'thin', color: {argb:'FFEEEEEE'}},
                    bottom: {style:'thin', color: {argb:'FFEEEEEE'}},
                    right: {style:'thin', color: {argb:'FFEEEEEE'}}
                };
            });
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Threat_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  }, [dvrData, eventBuffer, timeMode]);

  /* filter state */
  const [searchQuery, setSearchQuery]   = useState('');
  const [activeTypes, setActiveTypes]   = useState<Set<AttackType>>(new Set());
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [feedPaused, setFeedPaused]     = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [drillCountry, setDrillCountry] = useState<string | null>(null);
  const [sort, setSort]                 = useState<SortMode>('count');

  /* frozen feed when paused */
  const frozenFeed = useRef<ThreatEvent[]>([]);
  const displayFeed = feedPaused ? frozenFeed.current : recentFeed;
  if (!feedPaused) frozenFeed.current = recentFeed;

  /* search input ref for keyboard shortcut */
  const searchRef = useRef<HTMLInputElement>(null);

  /* keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchQuery('');
        setActiveTypes(new Set());
        setActiveSource(null);
        setActiveCountry(null);
        setDrillCountry(null);
      }
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);



  const hasFilters = searchQuery || activeTypes.size > 0 || activeSource || activeCountry;

  /* computed totals */
  const total = timeMode === 'live' ? (counterData?.today || totalAttacks) : totalAttacks;
  const distTotal = (typeDistribution.exploit + typeDistribution.malware + typeDistribution.phishing) || 1;

  /* trend analysis: compare recent 5 buckets vs previous 5 */
  const recentSum = trendData.slice(0, 5).reduce((a, b) => a + b, 0);
  const prevSum   = trendData.slice(5, 10).reduce((a, b) => a + b, 0);
  const trendUp   = recentSum > prevSum;
  const threatsPerMin = Math.round(distTotal / Math.max(1, (Date.now() % 3600000) / 60000));

  /* threat level */
  let threatLevel = { label: 'NORMAL', color: theme.colors.success as string };
  if (threatsPerMin > 100) threatLevel = { label: 'CRITICAL', color: theme.colors.danger as string };
  else if (threatsPerMin > 50) threatLevel = { label: 'HIGH', color: theme.colors.warning as string };
  else if (threatsPerMin > 20) threatLevel = { label: 'ELEVATED', color: theme.colors.phishing as string };

  /* filtered feed */
  const filteredFeed = useMemo(() => {
    return [...displayFeed].reverse().filter(ev => {
      if (activeTypes.size > 0 && !activeTypes.has(ev.a_t as AttackType)) return false;
      if (activeSource && ev.source_api !== activeSource) return false;
      if (activeCountry && ev.s_co !== activeCountry && ev.d_co !== activeCountry) return false;
      if (!matchesSearch(ev, searchQuery)) return false;
      return true;
    }).slice(0, 30);
  }, [displayFeed, activeTypes, activeSource, activeCountry, searchQuery]);

  /* sorted/filtered distributions */
  const sortEntries = (entries: [string, number][]) =>
    sort === 'count'
      ? [...entries].sort((a, b) => b[1] - a[1])
      : [...entries].sort((a, b) => a[0].localeCompare(b[0]));

  const filteredVectors  = sortEntries(Object.entries(vectorDistribution)).slice(0, 10);
  const filteredOrigins  = sortEntries(Object.entries(originDistribution)).slice(0, 10);
  const filteredTargets  = sortEntries(Object.entries(targetDistribution)).slice(0, 10);
  const filteredCorridors = sortEntries(Object.entries(corridorDistribution)).slice(0, 10);
  const topApis = sortEntries(Object.entries(sourceApiDistribution));

  /* country drill-down data */
  const drillData = useMemo(() => {
    if (!drillCountry) return null;
    const co = drillCountry;
    const asOrigin = Object.entries(originDistribution).find(([k]) => k === co)?.[1] || 0;
    const asTarget = Object.entries(targetDistribution).find(([k]) => k === co)?.[1] || 0;
    const vectors: Record<string, number> = {};
    const corridors: string[] = [];
    recentFeed.forEach(ev => {
      if (ev.s_co === co || ev.d_co === co) {
        vectors[ev.a_n] = (vectors[ev.a_n] || 0) + 1;
      }
    });
    Object.entries(corridorDistribution)
      .filter(([k]) => k.includes(co))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([k]) => corridors.push(k));
    const topVectors = Object.entries(vectors).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topIPs: string[] = [];
    recentFeed.forEach(ev => {
      if (ev.s_co === co && ev.s_ip && ev.s_ip !== 'unknown' && !topIPs.includes(ev.s_ip) && topIPs.length < 6) {
        topIPs.push(ev.s_ip);
      }
    });
    return { co, asOrigin, asTarget, topVectors, corridors, topIPs };
  }, [drillCountry, originDistribution, targetDistribution, recentFeed, corridorDistribution]);

  /* ─── render ─────────────────────────────────────────────────────────────── */

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '20px',
      fontFamily: theme.fonts.body,
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.panelBorder}`, paddingBottom: '16px', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 260 }}>
          <div>
            <h1 style={{ fontFamily: theme.fonts.display, fontSize: '26px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#fff', margin: 0 }}>
              Global Command Center
            </h1>
            <p style={{ color: theme.colors.textDim, fontSize: '13px', marginTop: '3px', marginBottom: 0 }}>
              Real-time Threat Intelligence · Interactive Analytics
            </p>
          </div>
          
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 4 }}>
            {(['live', 5, 15, 60] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setTimeMode(mode)}
                style={{
                  padding: '6px 12px', background: timeMode === mode ? 'rgba(0,209,255,0.2)' : 'transparent',
                  border: 'none', borderRadius: 6, color: timeMode === mode ? '#fff' : theme.colors.textDim,
                  fontSize: 12, fontFamily: theme.fonts.display, fontWeight: timeMode === mode ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: 1
                }}
              >
                {mode === 'live' ? 'Live' : `${mode}m`}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleExportCSV} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 11, fontFamily: theme.fonts.display, cursor: 'pointer', letterSpacing: 1, transition: 'background 0.2s' }}>
              CSV
            </button>
            <button onClick={handleExportJSON} style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 11, fontFamily: theme.fonts.display, cursor: 'pointer', letterSpacing: 1, transition: 'background 0.2s' }}>
              JSON
            </button>
            <button onClick={handleExportExcel} style={{ padding: '6px 14px', background: 'rgba(0,209,255,0.15)', border: '1px solid rgba(0,209,255,0.3)', borderRadius: 6, color: '#00d1ff', fontSize: 11, fontFamily: theme.fonts.display, fontWeight: 700, cursor: 'pointer', letterSpacing: 1, transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13 }}>📥</span> EXCEL
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', background: `${threatLevel.color}15`, border: `1px solid ${threatLevel.color}50`, borderRadius: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: threatLevel.color, boxShadow: `0 0 10px ${threatLevel.color}`, animation: 'pulse 2s infinite' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 9, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim }}>Threat Level</span>
              <span style={{ fontSize: 14, fontFamily: theme.fonts.display, fontWeight: 700, color: threatLevel.color }}>{threatLevel.label}</span>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ position: 'relative', flex: '0 0 300px' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: theme.colors.textDim, pointerEvents: 'none' }}>🔍</span>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder='Search threats, IPs, countries…  [/]'
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px 9px 36px',
              background: 'rgba(0,209,255,0.06)',
              border: `1px solid ${searchQuery ? theme.colors.exploit : theme.colors.panelBorder}`,
              borderRadius: 10, color: theme.colors.textPrimary,
              fontFamily: theme.fonts.body, fontSize: 13,
              outline: 'none', transition: 'border-color 0.2s',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.colors.textDim, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* ── Filter Chips ───────────────────────────────────────────────────── */}
      {/* User requested removal to save space */}

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPICard title={timeMode === 'live' ? "Total Attacks (24h)" : `Total Attacks (${timeMode}m)`} value={fmt(total)} color={theme.colors.exploit}
          trend={trendUp ? 'up' : 'down'}
          onClick={() => { setActiveTypes(new Set()); setActiveSource(null); }}
          active={activeTypes.size === 0 && !activeSource}
        />
        <KPICard title="Exploit / Scan" value={fmt(typeDistribution.exploit)} color={theme.colors.exploit}
          trend={trendUp ? 'up' : 'down'}
          onClick={() => setActiveTypes(new Set(['exploit']))}
          active={activeTypes.size === 1 && activeTypes.has('exploit')}
        />
        <KPICard title="Malware / C2" value={fmt(typeDistribution.malware)} color={theme.colors.malware}
          trend='neutral'
          onClick={() => setActiveTypes(new Set(['malware']))}
          active={activeTypes.size === 1 && activeTypes.has('malware')}
        />
        <KPICard title="Phishing / BEC" value={fmt(typeDistribution.phishing)} color={theme.colors.phishing}
          trend='neutral'
          onClick={() => setActiveTypes(new Set(['phishing']))}
          active={activeTypes.size === 1 && activeTypes.has('phishing')}
        />
      </div>

      {/* ── Main Grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 20 }}>
      
        {/* Globe Map Area – spans 4 cols (full width) */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{ height: '600px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.colors.panelBorder}`, background: 'transparent' }}>
            <GlobeScene />
          </div>
        </div>

        {/* Live Feed – spans 3 cols */}
        <div style={{ gridColumn: 'span 3' }}>
          <GlassPanel style={{ height: '340px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary }}>
                  Live Threat Feed
                </span>
                <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, background: 'rgba(0,209,255,0.1)', border: '1px solid rgba(0,209,255,0.2)', color: theme.colors.exploit, fontFamily: theme.fonts.mono }}>
                  {filteredFeed.length}/{recentFeed.length}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {feedPaused && <span style={{ fontSize: 10, color: theme.colors.warning, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1 }}>⏸ PAUSED</span>}
                <button
                  onClick={() => setFeedPaused(p => !p)}
                  style={{ padding: '4px 10px', background: feedPaused ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${feedPaused ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, color: feedPaused ? theme.colors.warning : theme.colors.textDim, fontSize: 11, fontFamily: theme.fonts.display, cursor: 'pointer', letterSpacing: 1 }}
                >
                  {feedPaused ? '▶ RESUME' : '⏸ PAUSE'}
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {filteredFeed.length === 0 ? (
                <div style={{ color: theme.colors.textDim, fontStyle: 'italic', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  {hasFilters ? '🔍 No events match your filters' : 'Awaiting threat data…'}
                </div>
              ) : (
                filteredFeed.map((event, i) => (
                  <FeedEventCard
                    key={event.id || i}
                    event={event}
                    expanded={expandedId === (event.id || String(i))}
                    onToggle={() => setExpandedId(prev => prev === (event.id || String(i)) ? null : (event.id || String(i)))}
                    onCountryClick={(co) => { setActiveCountry(co); }}
                  />
                ))
              )}
            </div>
          </GlassPanel>
        </div>

        {/* Trend Sparkline */}
        <div style={{ gridColumn: 'span 1' }}>
          <GlassPanel style={{ height: '340px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 10 }}>
              Attack Trend
            </div>
            <div style={{ fontSize: 10, color: theme.colors.textDim, marginBottom: 12 }}>Last 10 minutes · 10s buckets</div>
            <TrendSparkline data={trendData} />
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: theme.colors.textDim, marginBottom: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5 }}>Threat Types</div>
              {(['exploit', 'malware', 'phishing'] as AttackType[]).map(type => {
                const count = typeDistribution[type];
                const pct = (count / distTotal) * 100;
                const color = getAttackColor(type);
                return (
                  <div key={type} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: color, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1 }}>{type}</span>
                      <span style={{ color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}CC, ${color})`, borderRadius: 3, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassPanel>
        </div>

        {/* Intelligence Providers */}
        <div style={{ gridColumn: 'span 1' }}>
          <GlassPanel style={{ height: '320px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 12 }}>
              Intelligence Providers
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
              {topApis.map(([api, count], idx) => {
                const pct = (count / distTotal) * 100;
                const color = `hsl(${idx * 40 + 180}, 100%, 60%)`;
                const active = activeSource === api;
                return (
                  <div
                    key={api}
                    onClick={() => setActiveSource(active ? null : api)}
                    style={{
                      cursor: 'pointer', padding: '8px 10px', borderRadius: 8,
                      background: active ? `${color}15` : 'transparent',
                      border: `1px solid ${active ? color + '50' : 'transparent'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ textTransform: 'capitalize', color: active ? color : theme.colors.textPrimary, fontWeight: active ? 700 : 400 }}>{api}</span>
                      <span style={{ fontFamily: theme.fonts.mono, color: theme.colors.textDim }}>{fmt(count)} · {pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassPanel>
        </div>

        {/* Top Threat Vectors */}
        <div style={{ gridColumn: 'span 1' }}>
          <ClickableTopTable
            title="Top Threat Vectors"
            items={filteredVectors}
            color={theme.colors.warning}
            sort={sort}
            onSortToggle={() => setSort(s => s === 'count' ? 'alpha' : 'count')}
            onRowClick={(name) => setSearchQuery(name === searchQuery ? '' : name)}
            activeRow={searchQuery}
            total={distTotal}
          />
        </div>

        {/* Primary Targets */}
        <div style={{ gridColumn: 'span 1' }}>
          <ClickableTopTable
            title="Primary Targets"
            items={filteredTargets}
            color={theme.colors.phishing}
            sort={sort}
            onSortToggle={() => setSort(s => s === 'count' ? 'alpha' : 'count')}
            onRowClick={(co) => { setActiveCountry(co === activeCountry ? null : co); setDrillCountry(co); }}
            activeRow={activeCountry}
            total={distTotal}
            isCountry
          />
        </div>

        {/* Major Origins */}
        <div style={{ gridColumn: 'span 1' }}>
          <ClickableTopTable
            title="Major Origins"
            items={filteredOrigins}
            color={theme.colors.exploit}
            sort={sort}
            onSortToggle={() => setSort(s => s === 'count' ? 'alpha' : 'count')}
            onRowClick={(co) => { setActiveCountry(co === activeCountry ? null : co); setDrillCountry(co); }}
            activeRow={activeCountry}
            total={distTotal}
            isCountry
          />
        </div>

        {/* Attack Corridors */}
        <div style={{ gridColumn: 'span 1' }}>
          <ClickableTopTable
            title="Attack Corridors"
            items={filteredCorridors}
            color={theme.colors.malware}
            sort={sort}
            onSortToggle={() => setSort(s => s === 'count' ? 'alpha' : 'count')}
            onRowClick={() => {}}
            activeRow={null}
            total={distTotal}
            isCorridor
          />
        </div>

      </div>

      {/* ── Country Drill-Down Slide-Over ──────────────────────────────────── */}
      {drillCountry && drillData && (
        <CountryDrillOver data={drillData} onClose={() => setDrillCountry(null)} />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        input::placeholder { color: rgba(90,122,148,0.7); }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(0,209,255,0.2); border-radius: 2px; }
      `}</style>
    </div>
  );
}



/* ─── KPICard ─────────────────────────────────────────────────────────────── */

function KPICard({ title, value, color, trend, onClick, active }: { title: string; value: string; color: string; trend: 'up' | 'down' | 'neutral'; onClick: () => void; active: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <GlassPanel
      style={{
        padding: '20px 24px', borderLeft: `4px solid ${color}`,
        cursor: 'pointer', transition: 'all 0.25s',
        background: active ? `rgba(${hexToRgb(color)}, 0.07)` : undefined,
        boxShadow: (active || hovered) ? `0 0 30px ${color}20` : 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 32, fontFamily: theme.fonts.display, fontWeight: 800, color }}>{value}</div>
        {trend !== 'neutral' && (
          <span style={{ fontSize: 16, color: trend === 'up' ? theme.colors.danger : theme.colors.success }}>
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: theme.colors.textDim, marginTop: 4, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1 }}>
        Click to filter ›
      </div>
    </GlassPanel>
  );
}

/* ─── FeedEventCard ───────────────────────────────────────────────────────── */

function FeedEventCard({ event, expanded, onToggle, onCountryClick }: { event: ThreatEvent; expanded: boolean; onToggle: () => void; onCountryClick: (co: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const color = getAttackColor(event.a_t);
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 14px',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        borderRadius: 10, borderLeft: `3px solid ${color}`,
        cursor: 'pointer', transition: 'all 0.15s',
        boxShadow: hovered ? `0 0 16px ${color}15` : 'none',
        animation: 'fadeUp 0.3s ease',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontFamily: theme.fonts.display, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color, padding: '1px 6px', borderRadius: 5, background: `${color}18`, border: `1px solid ${color}33`, flexShrink: 0 }}>
            {event.a_t}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.a_n}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>
            {relativeTime(event.timestamp || event.ts)}
          </span>
          <span style={{ fontSize: 11, color: expanded ? color : theme.colors.textDim, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
        </div>
      </div>

      {/* Geo row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
        <button onClick={e => { e.stopPropagation(); onCountryClick(event.s_co); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: theme.colors.textSecondary }}>
          <span style={{ fontSize: 16 }}>{getFlag(event.s_co)}</span>
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 11 }}>{event.s_ip || event.s_co}</span>
        </button>
        <span style={{ color: theme.colors.textDim }}>→</span>
        <button onClick={e => { e.stopPropagation(); onCountryClick(event.d_co); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: theme.colors.textSecondary }}>
          <span style={{ fontSize: 16 }}>{getFlag(event.d_co)}</span>
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 11 }}>{event.d_ip || event.d_co}</span>
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: theme.colors.textDim }}>via {event.source_api || '?'}</span>
      </div>

      {/* Expanded meta */}
      {expanded && event.meta && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', animation: 'fadeUp 0.2s ease' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {event.meta.malware_family && <MetaTag label="Malware" value={event.meta.malware_family} color="#CC33FF" />}
            {event.meta.port && <MetaTag label="Port" value={String(event.meta.port)} color={theme.colors.textSecondary} />}
            {event.meta.threat_type && <MetaTag label="Threat Type" value={event.meta.threat_type} color={theme.colors.warning} />}
            {event.meta.as_name && <MetaTag label="ASN" value={event.meta.as_name} color={theme.colors.textSecondary} />}
            {event.meta.tags?.slice(0, 5).map((tag: string) => (
              <MetaTag key={tag} label="Tag" value={`#${tag}`} color={theme.colors.exploit} />
            ))}
          </div>
          {event.meta.url && (
            <a href={event.meta.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 10px', background: 'rgba(0,209,255,0.1)', border: '1px solid rgba(0,209,255,0.25)', borderRadius: 6, color: theme.colors.exploit, fontSize: 11, fontWeight: 700, textDecoration: 'none', fontFamily: theme.fonts.display, letterSpacing: 1 }}>
              🔗 SOURCE LINK
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function MetaTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: theme.colors.textDim, fontFamily: theme.fonts.display }}>{label}</span>
      <span style={{ fontSize: 11, color, padding: '1px 6px', background: `${color}15`, borderRadius: 4, border: `1px solid ${color}20`, fontFamily: theme.fonts.mono }}>{value}</span>
    </div>
  );
}

/* ─── TrendSparkline ──────────────────────────────────────────────────────── */

function TrendSparkline({ data }: { data: number[] }) {
  const bars = data.slice(0, 60).reverse(); // oldest → newest
  const maxVal = Math.max(...bars, 1);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const WIDTH = 220;
  const HEIGHT = 80;
  const barW = (WIDTH / bars.length) - 1;

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ overflow: 'visible' }}>
        {bars.map((val, i) => {
          const bh = Math.max((val / maxVal) * HEIGHT, 1);
          const x = i * (barW + 1);
          const isRecent = i >= bars.length - 6;
          const isHovered = hoveredIdx === i;
          return (
            <g key={i}>
              <rect
                x={x} y={HEIGHT - bh} width={barW} height={bh}
                fill={isRecent ? theme.colors.exploit : 'rgba(0,209,255,0.25)'}
                rx={1}
                opacity={isHovered ? 1 : 0.85}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              {isHovered && val > 0 && (
                <text x={x + barW / 2} y={HEIGHT - bh - 4} textAnchor="middle" fontSize={8} fill={theme.colors.textPrimary}>{val}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>
        <span>10m ago</span>
        <span>now</span>
      </div>
    </div>
  );
}

/* ─── ClickableTopTable ───────────────────────────────────────────────────── */

function ClickableTopTable({ title, items, color, sort, onSortToggle, onRowClick, activeRow, total, isCountry, isCorridor }: {
  title: string; items: [string, number][]; color: string; sort: SortMode;
  onSortToggle: () => void; onRowClick: (name: string) => void;
  activeRow: string | null; total: number; isCountry?: boolean; isCorridor?: boolean;
}) {
  const max = Math.max(...items.map(i => i[1]), 1);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <GlassPanel style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary }}>{title}</span>
        <button onClick={onSortToggle} style={{ fontSize: 9, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: theme.colors.textDim, cursor: 'pointer', fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1 }}>
          {sort === 'count' ? '▼ Count' : 'A–Z ▼'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(([name, count], index) => {
          let label = name;
          let iconEl: React.ReactNode = <span style={{ fontSize: 14, width: 24, textAlign: 'center' }}>⚡</span>;
          if (isCountry) iconEl = <span style={{ fontSize: 14, width: 24, textAlign: 'center' }}>{getFlag(name)}</span>;
          if (isCorridor) {
            const [src, dst] = name.split('-');
            label = `${src} → ${dst}`;
            iconEl = <span style={{ fontSize: 13, width: 36, textAlign: 'center' }}>{getFlag(src)}{getFlag(dst)}</span>;
          }
          const isActive = activeRow === name;
          const isHovered = hovered === name;
          const pct = ((count / total) * 100).toFixed(1);

          return (
            <div
              key={name}
              onClick={() => onRowClick(name)}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                padding: '5px 8px', borderRadius: 8,
                background: isActive ? `${color}12` : isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                border: `1px solid ${isActive ? color + '40' : 'transparent'}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, color: theme.colors.textDim, width: 16 }}>{index + 1}.</span>
                {iconEl}
                <span style={{ fontSize: 12, color: isActive ? color : theme.colors.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 700 : 400 }}>{label}</span>
                <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, color: theme.colors.textDim }}>{pct}%</span>
                <span style={{ fontSize: 12, fontFamily: theme.fonts.mono, color, fontWeight: 600 }}>{fmt(count)}</span>
              </div>
              <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1, marginLeft: isCorridor ? 60 : 48 }}>
                <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 1, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

/* ─── CountryDrillOver ────────────────────────────────────────────────────── */

function CountryDrillOver({ data, onClose }: { data: { co: string; asOrigin: number; asTarget: number; topVectors: [string, number][]; corridors: string[]; topIPs: string[] }; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, zIndex: 200,
      background: 'rgba(5, 10, 18, 0.97)', backdropFilter: 'blur(20px)',
      borderLeft: `1px solid ${theme.colors.panelBorder}`,
      padding: '24px', overflowY: 'auto',
      animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 40 }}>{getFlag(data.co)}</span>
          <div>
            <div style={{ fontSize: 22, fontFamily: theme.fonts.display, fontWeight: 800, color: '#fff' }}>{data.co}</div>
            <div style={{ fontSize: 11, color: theme.colors.textDim, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1 }}>Country Intelligence</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: theme.colors.textDim, width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: '12px', background: `${theme.colors.exploit}10`, border: `1px solid ${theme.colors.exploit}30`, borderRadius: 10 }}>
          <div style={{ fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>As Origin</div>
          <div style={{ fontSize: 24, fontFamily: theme.fonts.display, fontWeight: 800, color: theme.colors.exploit }}>{fmt(data.asOrigin)}</div>
        </div>
        <div style={{ padding: '12px', background: `${theme.colors.phishing}10`, border: `1px solid ${theme.colors.phishing}30`, borderRadius: 10 }}>
          <div style={{ fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>As Target</div>
          <div style={{ fontSize: 24, fontFamily: theme.fonts.display, fontWeight: 800, color: theme.colors.phishing }}>{fmt(data.asTarget)}</div>
        </div>
      </div>

      {/* Top Vectors */}
      <div>
        <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 10 }}>Top Attack Vectors</div>
        {data.topVectors.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.colors.textDim, fontStyle: 'italic' }}>No data yet</div>
        ) : data.topVectors.map(([vector, count]) => (
          <div key={vector} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
            <span style={{ color: theme.colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{vector}</span>
            <span style={{ color: theme.colors.warning, fontFamily: theme.fonts.mono, marginLeft: 8, flexShrink: 0 }}>{fmt(count)}</span>
          </div>
        ))}
      </div>

      {/* Corridors */}
      {data.corridors.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 10 }}>Threat Corridors</div>
          {data.corridors.map(corr => {
            const [src, dst] = corr.split('-');
            return (
              <div key={corr} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                <span>{getFlag(src)}</span><span style={{ color: theme.colors.textDim }}>→</span><span>{getFlag(dst)}</span>
                <span style={{ color: theme.colors.textPrimary }}>{src} → {dst}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Top IPs */}
      {data.topIPs.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textSecondary, marginBottom: 10 }}>Source IPs (live)</div>
          {data.topIPs.map(ip => (
            <div key={ip} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: theme.fonts.mono, fontSize: 12, color: theme.colors.exploit }}>{ip}</div>
          ))}
        </div>
      )}

      <div style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
        Press <kbd style={{ fontSize: 10 }}>Esc</kbd> to close
      </div>
    </div>
  );
}

/* ─── util ────────────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
