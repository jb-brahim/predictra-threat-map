import React from 'react';
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
  const currentView     = useStreamStore(s => s.currentView);
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
  const activeArcCount  = useStreamStore(s => s.activeArcCount);

  const [timeMode, setTimeMode] = useState<'live' | 5 | 15 | 60>('live');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

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
  const [sort]                         = useState<SortMode>('count');

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

  if (currentView === 'map') {
    return (
      <div style={{ position: 'relative', height: '100%', minHeight: 'calc(100vh - 64px)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: '#050B14' }}>
          <GlobeScene />
        </div>
        
        {/* HUD OVERLAYS */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', padding: '24px' }}>
          
          {/* Top Left: Threat Metrics */}
          <div style={{ position: 'absolute', top: 24, left: 24, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 12, width: 280, animation: 'slideIn 0.5s ease-out' }}>
            <GlassPanel style={{ padding: '16px 20px', borderLeft: `3px solid ${threatLevel.color}`, background: 'rgba(5, 11, 20, 0.6)', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim, marginBottom: 4 }}>System Status</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: threatLevel.color, boxShadow: `0 0 10px ${threatLevel.color}`, animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 16, fontFamily: theme.fonts.display, fontWeight: 800, color: threatLevel.color, letterSpacing: 1 }}>{threatLevel.label}</span>
              </div>
              <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim, marginBottom: 2 }}>Total Attacks</div>
              <div style={{ fontSize: 32, fontFamily: theme.fonts.display, fontWeight: 800, color: theme.colors.textPrimary }}>{fmt(total)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9, fontFamily: theme.fonts.display, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Threats/Min</span>
                  <span style={{ fontSize: 18, color: theme.colors.warning, fontWeight: 700, fontFamily: theme.fonts.display }}>{threatsPerMin}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 9, fontFamily: theme.fonts.display, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>Active Arcs</span>
                  <span style={{ fontSize: 18, color: theme.colors.exploit, fontWeight: 700, fontFamily: theme.fonts.display }}>{activeArcCount}</span>
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* Top Right: Trend Sparkline */}
          <div style={{ position: 'absolute', top: 24, right: 24, pointerEvents: 'auto', width: 300, animation: 'slideIn 0.5s ease-out', animationDirection: 'reverse' }}>
            <GlassPanel style={{ padding: '16px 20px', background: 'rgba(5, 11, 20, 0.6)', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim, marginBottom: 12 }}>10-Minute Trend</div>
              <TrendSparkline data={trendData} />
            </GlassPanel>
          </div>

          {/* Bottom Left: Top Targets */}
          <div style={{ position: 'absolute', bottom: 24, left: 24, pointerEvents: 'auto', width: 280, animation: 'fadeUp 0.5s ease-out' }}>
             <GlassPanel style={{ padding: '16px 20px', background: 'rgba(5, 11, 20, 0.6)', backdropFilter: 'blur(8px)' }}>
               <div style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim, marginBottom: 12 }}>Primary Targets</div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                 {filteredTargets.slice(0, 5).map(([co, count], idx) => {
                   const max = filteredTargets[0]?.[1] || 1;
                   const pct = (count / max) * 100;
                   return (
                     <div key={co} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                       <div style={{ width: 22, textAlign: 'center', fontSize: 16 }}>{getFlag(co)}</div>
                       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                           <span style={{ fontSize: 11, fontWeight: idx === 0 ? 700 : 400, color: idx === 0 ? '#fff' : theme.colors.textSecondary }}>{co}</span>
                           <span style={{ fontSize: 10, fontFamily: theme.fonts.mono, color: theme.colors.phishing }}>{fmt(count)}</span>
                         </div>
                         <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
                           <div style={{ width: `${pct}%`, height: '100%', background: theme.colors.phishing, borderRadius: 1 }} />
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             </GlassPanel>
          </div>

          {/* Bottom Right: Live Feed */}
          <div style={{ position: 'absolute', bottom: 24, right: 24, pointerEvents: 'auto', width: 380, display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeUp 0.5s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', marginBottom: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.colors.exploit, animation: 'pulse 1s infinite' }} />
              <span style={{ fontSize: 10, fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim }}>Live Intercepts</span>
            </div>
            {filteredFeed.slice(0, 3).map((event, i) => (
              <FeedEventCard
                key={event.id || i}
                event={event}
                expanded={false}
                onToggle={() => {}}
                onCountryClick={() => {}}
              />
            ))}
          </div>

        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative', height: '100%', minHeight: 'calc(100vh - 64px)',
      overflow: 'hidden', background: '#080C14',
      fontFamily: theme.fonts.mono,
    }}>
      {/* ── World Map SVG Background ────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.45 }}>
        <WorldMapSVG zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan} />
      </div>

      {/* ── Tactical Grid Overlay ───────────────────────────────────── */}
      <div className="hud-tactical-grid" style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      {/* ── Scan Line Effect ────────────────────────────────────────── */}
      <div className="hud-scanline-sweep" />

      {/* ── All HUD Floating Panels ─────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>

        {/* ═══ TOP BAR: Title + Search + Time + Exports ═══ */}
        <div className="hud-entrance-top" style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px',
          background: 'linear-gradient(180deg, rgba(8,12,20,0.95) 0%, rgba(8,12,20,0.6) 80%, transparent 100%)',
          pointerEvents: 'auto', zIndex: 20,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Left: Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, color: theme.colors.exploit }}>⚠</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#fff' }}>
                  GLOBAL COMMAND CENTER
                </div>
                <div style={{ fontSize: 8, letterSpacing: 2, color: theme.colors.textDim, textTransform: 'uppercase' }}>
                  PREDICTRA THREAT INTELLIGENCE · {timeMode === 'live' ? 'LIVE' : `${timeMode}M WINDOW`}
                </div>
              </div>
            </div>

            {/* Time mode selector */}
            <div style={{ display: 'flex', gap: 2, marginLeft: 12 }}>
              {(['live', 5, 15, 60] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setTimeMode(mode)}
                  style={{
                    padding: '3px 10px',
                    background: timeMode === mode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.03)',
                    border: timeMode === mode ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 2, color: timeMode === mode ? theme.colors.exploit : theme.colors.textDim,
                    fontSize: 9, fontFamily: theme.fonts.mono, fontWeight: 700,
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, transition: 'all 0.2s',
                  }}
                >
                  {mode === 'live' ? '● LIVE' : `${mode}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Center: Clock */}
          <HudClock />

          {/* Right: Search + Exports + Threat Level */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder='SEARCH…'
                style={{
                  width: 180, padding: '5px 10px 5px 28px',
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${searchQuery ? theme.colors.exploit + '60' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 2, color: theme.colors.textPrimary,
                  fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: 1,
                  outline: 'none', transition: 'border-color 0.2s',
                }}
              />
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: theme.colors.textDim }}>⌕</span>
            </div>

            <div style={{ display: 'flex', gap: 3 }}>
              <button onClick={handleExportCSV} style={{ ...hudBtnStyle }}>CSV</button>
              <button onClick={handleExportJSON} style={{ ...hudBtnStyle }}>JSON</button>
              <button onClick={handleExportExcel} style={{ ...hudBtnStyle, borderColor: 'rgba(239,68,68,0.3)', color: theme.colors.exploit }}>XLSX</button>
            </div>

            {/* Threat Level Badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              background: `${threatLevel.color}12`, border: `1px solid ${threatLevel.color}40`,
              borderRadius: 2,
            }}>
              <div className="hud-beacon" style={{ width: 6, height: 6, borderRadius: '50%', background: threatLevel.color, boxShadow: `0 0 8px ${threatLevel.color}` }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: threatLevel.color, letterSpacing: 1.5 }}>{threatLevel.label}</span>
            </div>
          </div>
        </div>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{
          position: 'absolute', top: 60, left: 16, bottom: 16, width: 280,
          display: 'flex', flexDirection: 'column', gap: 16, pointerEvents: 'none',
          zIndex: 10, overflowY: 'auto', paddingLeft: 4, paddingBottom: 16,
          scrollbarWidth: 'none', msOverflowStyle: 'none'
        }}>
          {/* ═══ TOP-LEFT: System Status Panel ═══ */}
          <div className="hud-entrance-left" style={{ width: 260, pointerEvents: 'auto', flexShrink: 0 }}>
            <HudPanel accent="red" title="SYSTEM STATUS">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div className="hud-beacon" style={{ width: 8, height: 8, borderRadius: '50%', background: threatLevel.color, boxShadow: `0 0 10px ${threatLevel.color}` }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: threatLevel.color, letterSpacing: 1.5, fontFamily: theme.fonts.display }}>{threatLevel.label}</span>
              </div>
              <div style={{ fontSize: 8, letterSpacing: 2, color: theme.colors.textDim, marginBottom: 2, textTransform: 'uppercase' }}>Total Attacks {timeMode === 'live' ? '(24H)' : `(${timeMode}M)`}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: theme.fonts.display, marginBottom: 10 }}>{fmt(total)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                <div>
                  <div style={{ fontSize: 7, letterSpacing: 1.5, color: theme.colors.textDim, textTransform: 'uppercase' }}>THREATS/MIN</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: theme.colors.warning, fontFamily: theme.fonts.display }}>{threatsPerMin}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 7, letterSpacing: 1.5, color: theme.colors.textDim, textTransform: 'uppercase' }}>ACTIVE ARCS</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: theme.colors.exploit, fontFamily: theme.fonts.display }}>{activeArcCount}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 7, letterSpacing: 1.5, color: theme.colors.textDim, textTransform: 'uppercase' }}>TREND</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: trendUp ? theme.colors.danger : theme.colors.success, fontFamily: theme.fonts.display }}>
                    {trendUp ? '▲ UP' : '▼ DOWN'}
                  </div>
                </div>
              </div>
            </HudPanel>
          </div>

          {/* ═══ TOP-LEFT (Below Status): KPI Breakdown ═══ */}
          <div className="hud-entrance-left" style={{ width: 260, pointerEvents: 'auto', animationDelay: '0.1s', flexShrink: 0 }}>
            <HudPanel accent="yellow" title="THREAT BREAKDOWN">
              {(['exploit', 'malware', 'phishing'] as AttackType[]).map(type => {
                const count = typeDistribution[type];
                const pct = (count / distTotal) * 100;
                const color = getAttackColor(type);
                return (
                  <div
                    key={type}
                    onClick={() => setActiveTypes(new Set([type]))}
                    style={{
                      marginBottom: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 2,
                      background: activeTypes.has(type) ? `${color}15` : 'transparent',
                      border: activeTypes.has(type) ? `1px solid ${color}30` : '1px solid transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 3 }}>
                      <span style={{ color, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
                        ⚠ {type}
                      </span>
                      <span style={{ color: theme.colors.textDim }}>{fmt(count)} · {pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
                      <div className="hud-bar-fill" style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 1 }} />
                    </div>
                  </div>
                );
              })}
            </HudPanel>
          </div>

          {/* ═══ LEFT-MID: Intelligence Providers ═══ */}
          <div className="hud-entrance-left" style={{ width: 260, pointerEvents: 'auto', animationDelay: '0.15s', flexShrink: 0 }}>
            <HudPanel accent="purple" title="INTEL SOURCES">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
                {topApis.map(([api, count], idx) => {
                  const pct = (count / distTotal) * 100;
                  const color = `hsl(${idx * 40 + 180}, 80%, 55%)`;
                  const active = activeSource === api;
                  return (
                    <div
                      key={api}
                      onClick={() => setActiveSource(active ? null : api)}
                      style={{
                        cursor: 'pointer', padding: '4px 6px', borderRadius: 2,
                        background: active ? `${color}15` : 'transparent',
                        border: active ? `1px solid ${color}40` : '1px solid transparent',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                        <span style={{ textTransform: 'uppercase', color: active ? color : theme.colors.textPrimary, fontWeight: active ? 700 : 400, letterSpacing: 0.5 }}>{api}</span>
                        <span style={{ color: theme.colors.textDim }}>{fmt(count)}</span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 1, transition: 'width 0.6s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </HudPanel>
          </div>

          {/* ═══ BOTTOM-LEFT: Major Origins ═══ */}
          <div className="hud-entrance-left" style={{ width: 260, pointerEvents: 'auto', flexShrink: 0 }}>
            <HudPanel accent="red" title="MAJOR ORIGINS">
              <HudCompactTable
                items={filteredOrigins.slice(0, 6)}
                color={theme.colors.exploit}
                total={distTotal}
                isCountry
                onRowClick={(co) => { setActiveCountry(co === activeCountry ? null : co); setDrillCountry(co); }}
                activeRow={activeCountry}
              />
            </HudPanel>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div style={{
          position: 'absolute', top: 60, right: 16, bottom: 16, width: 360,
          display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-end',
          pointerEvents: 'none', zIndex: 10, overflowY: 'auto', paddingRight: 4, paddingBottom: 16,
          scrollbarWidth: 'none', msOverflowStyle: 'none'
        }}>
          {/* ═══ TOP-RIGHT: Attack Trend ═══ */}
          <div className="hud-entrance-right" style={{ width: 300, pointerEvents: 'auto', flexShrink: 0 }}>
            <HudPanel accent="red" title="ATTACK TREND · 10 MIN">
              <TrendSparkline data={trendData} />
            </HudPanel>
          </div>

          {/* ═══ RIGHT-MID: Top Threat Vectors ═══ */}
          <div className="hud-entrance-right" style={{ width: 300, pointerEvents: 'auto', animationDelay: '0.1s', flexShrink: 0 }}>
            <HudPanel accent="yellow" title="THREAT VECTORS">
              <HudCompactTable
                items={filteredVectors}
                color={theme.colors.warning}
                total={distTotal}
                onRowClick={(name) => setSearchQuery(name === searchQuery ? '' : name)}
                activeRow={searchQuery}
              />
            </HudPanel>
          </div>

          {/* ═══ RIGHT-MID-LOWER: Primary Targets ═══ */}
          <div className="hud-entrance-right" style={{ width: 300, pointerEvents: 'auto', animationDelay: '0.15s', flexShrink: 0 }}>
            <HudPanel accent="blue" title="PRIMARY TARGETS">
              <HudCompactTable
                items={filteredTargets}
                color={theme.colors.phishing}
                total={distTotal}
                isCountry
                onRowClick={(co) => { setActiveCountry(co === activeCountry ? null : co); setDrillCountry(co); }}
                activeRow={activeCountry}
              />
            </HudPanel>
          </div>

          {/* ═══ BOTTOM-RIGHT: Live Threat Feed ═══ */}
          <div className="hud-entrance-right" style={{ width: 340, pointerEvents: 'auto', animationDelay: '0.1s', flexShrink: 0 }}>
            <HudPanel accent="red" title={`LIVE INTERCEPTS · ${filteredFeed.length}/${recentFeed.length}`}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button
                  onClick={() => setFeedPaused(p => !p)}
                  style={{
                    padding: '2px 8px', fontSize: 8, fontFamily: theme.fonts.mono,
                    background: feedPaused ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${feedPaused ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 2, color: feedPaused ? theme.colors.warning : theme.colors.textDim,
                    cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase',
                  }}
                >
                  {feedPaused ? '▶ RESUME' : '⏸ PAUSE'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {filteredFeed.length === 0 ? (
                  <div style={{ color: theme.colors.textDim, fontSize: 9, textAlign: 'center', padding: 12, letterSpacing: 1 }}>
                    {hasFilters ? 'NO MATCHING EVENTS' : 'AWAITING DATA…'}
                  </div>
                ) : (
                  filteredFeed.slice(0, 6).map((event, i) => {
                    const evColor = getAttackColor(event.a_t);
                    return (
                      <div
                        key={event.id || i}
                        onClick={() => setExpandedId(prev => prev === (event.id || String(i)) ? null : (event.id || String(i)))}
                        style={{
                          padding: '6px 8px', borderRadius: 2,
                          background: 'rgba(255,255,255,0.02)',
                          borderLeft: `2px solid ${evColor}`,
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: evColor, letterSpacing: 1, textTransform: 'uppercase', padding: '1px 4px', background: `${evColor}15`, borderRadius: 2 }}>
                            {event.a_t}
                          </span>
                          <span style={{ fontSize: 9, color: theme.colors.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {event.a_n}
                          </span>
                          <span style={{ fontSize: 8, color: theme.colors.textDim }}>{relativeTime(event.timestamp || event.ts)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 9 }}>
                          <span>{getFlag(event.s_co)}</span>
                          <span style={{ color: theme.colors.textDim, fontFamily: theme.fonts.mono, fontSize: 8 }}>{event.s_ip || event.s_co}</span>
                          <span style={{ color: theme.colors.textDim }}>→</span>
                          <span>{getFlag(event.d_co)}</span>
                          <span style={{ color: theme.colors.textDim, fontFamily: theme.fonts.mono, fontSize: 8 }}>{event.d_ip || event.d_co}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 7, color: theme.colors.textDim, letterSpacing: 0.5 }}>via {event.source_api || '?'}</span>
                        </div>
                        {/* Expanded meta */}
                        {expandedId === (event.id || String(i)) && event.meta && (
                          <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {event.meta.malware_family && <MiniTag label="MAL" value={event.meta.malware_family} color="#CC33FF" />}
                              {event.meta.port && <MiniTag label="PORT" value={String(event.meta.port)} color={theme.colors.textSecondary} />}
                              {event.meta.threat_type && <MiniTag label="TYPE" value={event.meta.threat_type} color={theme.colors.warning} />}
                              {event.meta.tags?.slice(0, 3).map((tag: string) => (
                                <MiniTag key={tag} label="TAG" value={`#${tag}`} color={theme.colors.exploit} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </HudPanel>
          </div>
        </div>

        {/* ═══ BOTTOM-CENTER: Attack Corridors ═══ */}
        <div className="hud-entrance-bottom" style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: 320, pointerEvents: 'auto', animationDelay: '0.05s' }}>
          <HudPanel accent="yellow" title="ATTACK CORRIDORS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredCorridors.slice(0, 5).map(([name, count]) => {
                const [src, dst] = name.split('-');
                const pct = ((count / distTotal) * 100).toFixed(1);
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize: 13 }}>{getFlag(src)}</span>
                    <span style={{ fontSize: 8, color: theme.colors.textDim }}>→</span>
                    <span style={{ fontSize: 13 }}>{getFlag(dst)}</span>
                    <span style={{ fontSize: 9, color: theme.colors.textPrimary, flex: 1 }}>{src} → {dst}</span>
                    <span style={{ fontSize: 9, color: theme.colors.textDim }}>{pct}%</span>
                    <span style={{ fontSize: 9, color: theme.colors.malware, fontWeight: 700 }}>{fmt(count)}</span>
                  </div>
                );
              })}
            </div>
          </HudPanel>
        </div>

        {/* ═══ MAP ZOOM CONTROLS ═══ */}
        <div style={{
          position: 'absolute', bottom: 16, left: 312,
          display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'auto',
          background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 4,
          padding: 4, zIndex: 30, boxShadow: '0 0 15px rgba(0,0,0,0.5)',
        }}>
          <button className="hud-zoom-btn" onClick={() => {
            const newZoom = Math.min(zoom * 1.3, 8);
            const center = { x: 600, y: 300 };
            const dx = center.x - pan.x;
            const dy = center.y - pan.y;
            setPan({
              x: center.x - dx * (newZoom / zoom),
              y: center.y - dy * (newZoom / zoom),
            });
            setZoom(newZoom);
          }} style={zoomBtnStyle} title="Zoom In">+</button>
          
          <button className="hud-zoom-btn" onClick={() => {
            const newZoom = Math.max(1, zoom / 1.3);
            const center = { x: 600, y: 300 };
            const dx = center.x - pan.x;
            const dy = center.y - pan.y;
            let newX = center.x - dx * (newZoom / zoom);
            let newY = center.y - dy * (newZoom / zoom);
            const maxPanX = 1200 * (newZoom - 1);
            const maxPanY = 600 * (newZoom - 1);
            newX = Math.max(-maxPanX, Math.min(0, newX));
            newY = Math.max(-maxPanY, Math.min(0, newY));
            setPan({ x: newX, y: newY });
            setZoom(newZoom);
          }} style={zoomBtnStyle} title="Zoom Out">-</button>
          
          <button className="hud-zoom-btn" onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }} style={zoomBtnStyle} title="Reset Map">⟲</button>
          
          <div style={{
            fontSize: 7, color: theme.colors.textDim, fontFamily: theme.fonts.mono,
            textAlign: 'center', marginTop: 2, padding: '2px 0 0 0',
            borderTop: '1px solid rgba(255,255,255,0.06)'
          }}>
            {zoom.toFixed(1)}x
          </div>
        </div>
        
        {/* ═══ CENTER: Map Legend / Crosshair ═══ */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 50, height: 50, pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(239, 68, 68, 0.15)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(239, 68, 68, 0.15)' }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 8, height: 8, borderRadius: '50%', border: '1px solid rgba(239, 68, 68, 0.3)',
          }} />
        </div>

      </div>

      {/* ── Country Drill-Down Slide-Over ──────────────────────────────── */}
      {drillCountry && drillData && (
        <CountryDrillOver data={drillData} onClose={() => setDrillCountry(null)} />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        input::placeholder { color: rgba(90,122,148,0.7); }
        .hud-zoom-btn:hover {
          background: rgba(59, 130, 246, 0.2) !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
          color: #fff !important;
        }
      `}</style>
    </div>
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

/* ─── HUD Button Style ───────────────────────────────────────────────────── */

const zoomBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 2,
  color: theme.colors.textPrimary,
  fontSize: 10,
  fontFamily: theme.fonts.mono,
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.15s',
  outline: 'none',
};

const hudBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 2,
  color: '#fff',
  fontSize: 8,
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: 1,
  textTransform: 'uppercase' as const,
  transition: 'all 0.2s',
};

/* ─── HUD Panel with Corner Brackets ─────────────────────────────────────── */

function HudPanel({ children, title, accent = 'red' }: {
  children: React.ReactNode;
  title?: string;
  accent?: 'red' | 'yellow' | 'blue' | 'purple';
}) {
  const accentColors: Record<string, string> = {
    red: theme.colors.exploit,
    yellow: theme.colors.malware,
    blue: theme.colors.phishing,
    purple: '#8B5CF6',
  };
  const accentColor = accentColors[accent] || accentColors.red;

  return (
    <div className={`hud-panel hud-panel--${accent}`} style={{ padding: '12px 14px' }}>
      <div className="hud-corner-bl" />
      <div className="hud-corner-br" />
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 10, paddingBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ color: accentColor, fontSize: 11 }}>⚠</span>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 2.5,
            textTransform: 'uppercase', color: accentColor,
            fontFamily: theme.fonts.mono,
          }}>
            {title}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{
            width: 4, height: 4, borderRadius: '50%',
            background: accentColor,
            boxShadow: `0 0 6px ${accentColor}`,
            animation: 'pulse 2s infinite',
          }} />
        </div>
      )}
      {children}
    </div>
  );
}

/* ─── HUD Clock ──────────────────────────────────────────────────────────── */

function HudClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = time.getHours().toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');
  const s = time.getSeconds().toString().padStart(2, '0');
  const dateStr = time.toISOString().split('T')[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        fontSize: 22, fontWeight: 800, letterSpacing: 4,
        fontFamily: theme.fonts.mono, color: '#fff',
        textShadow: '0 0 10px rgba(239,68,68,0.3)',
      }}>
        {h}:{m}<span style={{ opacity: 0.4, fontSize: 16 }}>:{s}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 7, letterSpacing: 2, color: theme.colors.textDim, textTransform: 'uppercase', fontFamily: theme.fonts.mono }}>
          {dateStr}
        </span>
        <span style={{ fontSize: 7, letterSpacing: 2, color: theme.colors.exploit, textTransform: 'uppercase', fontFamily: theme.fonts.mono }}>
          UTC {time.getTimezoneOffset() > 0 ? '-' : '+'}{Math.abs(Math.floor(time.getTimezoneOffset() / 60))}
        </span>
      </div>
    </div>
  );
}

/* ─── HUD Compact Table ──────────────────────────────────────────────────── */

function HudCompactTable({ items, color, total, isCountry, onRowClick, activeRow }: {
  items: [string, number][];
  color: string;
  total: number;
  isCountry?: boolean;
  onRowClick: (name: string) => void;
  activeRow: string | null;
}) {
  const max = Math.max(...items.map(i => i[1]), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.slice(0, 8).map(([name, count], idx) => {
        const pct = ((count / total) * 100).toFixed(1);
        const barPct = (count / max) * 100;
        const isActive = activeRow === name;

        return (
          <div
            key={name}
            onClick={() => onRowClick(name)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              padding: '3px 6px', borderRadius: 2, cursor: 'pointer',
              background: isActive ? `${color}12` : 'transparent',
              border: isActive ? `1px solid ${color}30` : '1px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 8, fontFamily: theme.fonts.mono, color: theme.colors.textDim, width: 14 }}>{idx + 1}.</span>
              {isCountry && <span style={{ fontSize: 12 }}>{getFlag(name)}</span>}
              <span style={{
                fontSize: 9, color: isActive ? color : theme.colors.textPrimary, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: isActive ? 700 : 400,
              }}>{name}</span>
              <span style={{ fontSize: 8, fontFamily: theme.fonts.mono, color: theme.colors.textDim }}>{pct}%</span>
              <span style={{ fontSize: 9, fontFamily: theme.fonts.mono, color, fontWeight: 600 }}>{fmt(count)}</span>
            </div>
            <div style={{ height: 1.5, background: 'rgba(255,255,255,0.04)', borderRadius: 1, marginLeft: isCountry ? 40 : 20 }}>
              <div style={{ width: `${barPct}%`, height: '100%', background: `linear-gradient(90deg, ${color}60, ${color})`, borderRadius: 1, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── MiniTag ─────────────────────────────────────────────────────────────── */

function MiniTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 7, letterSpacing: 1, color: theme.colors.textDim, textTransform: 'uppercase', fontFamily: theme.fonts.mono }}>{label}</span>
      <span style={{ fontSize: 8, color, padding: '1px 4px', background: `${color}15`, borderRadius: 2, border: `1px solid ${color}20`, fontFamily: theme.fonts.mono }}>{value}</span>
    </div>
  );
}

/* ─── TopoJSON Decoding Helpers for 2D Map ────────────────────────────────── */

function decodeTopology(topology: any): number[][][] {
  const { arcs: topoArcs, transform } = topology;
  const { scale, translate } = transform || { scale: [1, 1], translate: [0, 0] };

  return topoArcs.map((arc: number[][]) => {
    let x = 0, y = 0;
    return arc.map((point: number[]) => {
      x += point[0];
      y += point[1];
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function resolveArcs(arcIndices: number[], decodedArcs: number[][][]): number[][] {
  const coords: number[][] = [];
  for (const idx of arcIndices) {
    const arcIdx = idx < 0 ? ~idx : idx;
    const arc = decodedArcs[arcIdx];
    if (!arc) continue;
    const points = idx < 0 ? [...arc].reverse() : arc;
    for (let i = coords.length > 0 ? 1 : 0; i < points.length; i++) {
      coords.push(points[i]);
    }
  }
  return coords;
}

let cachedPolygons: number[][][] | null = null;

/* ─── World Map SVG ──────────────────────────────────────────────────────── */

function WorldMapSVG({
  zoom,
  setZoom,
  pan,
  setPan,
}: {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}) {
  const [polygons, setPolygons] = useState<number[][][]>(cachedPolygons || []);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const mapRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (polygons.length > 0) return;
    
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(res => res.json())
      .then(topology => {
        const decodedArcs = decodeTopology(topology);
        const geometries = topology.objects.countries?.geometries || [];
        const extracted: number[][][] = [];
        for (const geo of geometries) {
          if (geo.type === 'Polygon') {
            for (const ring of geo.arcs) {
              extracted.push(resolveArcs(ring, decodedArcs));
            }
          } else if (geo.type === 'MultiPolygon') {
            for (const polygon of geo.arcs) {
              for (const ring of polygon) {
                extracted.push(resolveArcs(ring, decodedArcs));
              }
            }
          }
        }
        cachedPolygons = extracted;
        setPolygons(extracted);
      })
      .catch(err => console.warn('Failed to load SVG background map:', err));
  }, [polygons.length]);

  // Prevent default scroll during wheel zoom
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl) return;

    const handleDOMWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const zoomFactor = 1.15;
      let newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
      newZoom = Math.max(1, Math.min(newZoom, 8)); // clamp zoom between 1x and 8x
      
      const rect = mapEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const svgX = (mouseX / rect.width) * 1200;
      const svgY = (mouseY / rect.height) * 600;

      const dx = svgX - pan.x;
      const dy = svgY - pan.y;
      
      let newX = svgX - dx * (newZoom / zoom);
      let newY = svgY - dy * (newZoom / zoom);
      
      const maxPanX = 1200 * (newZoom - 1);
      const maxPanY = 600 * (newZoom - 1);
      newX = Math.max(-maxPanX, Math.min(0, newX));
      newY = Math.max(-maxPanY, Math.min(0, newY));

      setPan({ x: newX, y: newY });
      setZoom(newZoom);
    };

    mapEl.addEventListener('wheel', handleDOMWheel, { passive: false });
    return () => {
      mapEl.removeEventListener('wheel', handleDOMWheel);
    };
  }, [zoom, pan, setZoom, setPan]);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    let newX = e.clientX - dragStart.current.x;
    let newY = e.clientY - dragStart.current.y;
    
    const maxPanX = 1200 * (zoom - 1);
    const maxPanY = 600 * (zoom - 1);
    newX = Math.max(-maxPanX, Math.min(0, newX));
    newY = Math.max(-maxPanY, Math.min(0, newY));
    
    setPan({ x: newX, y: newY });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const paths = useMemo(() => {
    return polygons.map(ring => {
      if (ring.length < 3) return '';
      const dPoints = ring.map(([lon, lat]) => {
        const x = ((lon + 180) / 360) * 1200;
        const y = ((90 - lat) / 180) * 600;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      return `M${dPoints.join(' L')} Z`;
    }).filter(Boolean);
  }, [polygons]);

  const MAP_HOTSPOTS = [
    { label: 'US', lat: 37.09, lon: -95.71 },
    { label: 'EU', lat: 51.17, lon: 10.45 },
    { label: 'CN', lat: 35.86, lon: 104.20 },
    { label: 'JP', lat: 36.20, lon: 138.25 },
    { label: 'IN', lat: 20.59, lon: 78.96 },
    { label: 'RU', lat: 61.52, lon: 105.32 },
    { label: 'AF', lat: 9.08, lon: 8.68 }, 
    { label: 'AU', lat: -25.27, lon: 133.78 },
    { label: 'BR', lat: -14.24, lon: -51.93 },
  ];

  return (
    <svg
      ref={mapRef}
      viewBox="0 0 1200 600"
      style={{
        width: '100%',
        height: '100%',
        maxHeight: '100vh',
        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
      xmlns="http://www.w3.org/2000/svg"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
    >
      {/* Grid lines */}
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="1200" height="600" fill="url(#grid)" />

      {/* Scalable & Pannable Group */}
      <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
        {/* Latitude lines */}
        {[100, 200, 300, 400, 500].map(y => (
          <line key={`lat-${y}`} x1="0" y1={y} x2="1200" y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" strokeDasharray="4,8" />
        ))}
        {/* Longitude lines */}
        {[200, 400, 600, 800, 1000].map(x => (
          <line key={`lon-${x}`} x1={x} y1="0" x2={x} y2="600" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" strokeDasharray="4,8" />
        ))}

        {/* Real world map - continents as path shapes */}
        <g fill="rgba(15, 23, 42, 0.6)" stroke="rgba(0, 210, 255, 0.8)" strokeWidth={1.2 / Math.sqrt(zoom)} style={{ transition: 'opacity 0.5s ease', opacity: polygons.length > 0 ? 1 : 0 }}>
          {paths.map((d, idx) => (
            <path key={idx} d={d} />
          ))}
        </g>

        {/* Equator */}
        <line x1="0" y1="300" x2="1200" y2="300" stroke="rgba(239, 68, 68, 0.22)" strokeWidth="0.5" strokeDasharray="8,4" />
        {/* Tropics */}
        <line x1="0" y1="200" x2="1200" y2="200" stroke="rgba(245, 158, 11, 0.18)" strokeWidth="0.5" strokeDasharray="4,12" />
        <line x1="0" y1="400" x2="1200" y2="400" stroke="rgba(245, 158, 11, 0.18)" strokeWidth="0.5" strokeDasharray="4,12" />

        {/* Marker dots for key cities/hotspots */}
        {MAP_HOTSPOTS.map(({ label, lat, lon }) => {
          const x = ((lon + 180) / 360) * 1200;
          const y = ((90 - lat) / 180) * 600;
          return (
            <g key={label}>
              <circle cx={x} cy={y} r={3.5 / zoom} fill={theme.colors.exploit} opacity="0.75" />
              <circle cx={x} cy={y} r={7 / zoom} fill="none" stroke={theme.colors.exploit} strokeWidth={0.75 / zoom} opacity="0.4" />
              <text x={x + 10 / zoom} y={y + 3.5 / zoom} fill={theme.colors.textSecondary} fontSize={8 / zoom} fontWeight="600" opacity="0.7" fontFamily={theme.fonts.mono}>{label}</text>
            </g>
          );
        })}

        {/* Coordinate labels */}
        <text x="1190" y="305" fill="rgba(255, 255, 255, 0.25)" fontSize="6" textAnchor="end" fontFamily="'JetBrains Mono', monospace">0°</text>
        <text x="1190" y="205" fill="rgba(255, 255, 255, 0.18)" fontSize="6" textAnchor="end" fontFamily="'JetBrains Mono', monospace">23.4°N</text>
        <text x="1190" y="405" fill="rgba(255, 255, 255, 0.18)" fontSize="6" textAnchor="end" fontFamily="'JetBrains Mono', monospace">23.4°S</text>
      </g>
    </svg>
  );
}

