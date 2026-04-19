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
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.18 }}>
        <WorldMapSVG />
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

        {/* ═══ TOP-LEFT: System Status Panel ═══ */}
        <div className="hud-entrance-left" style={{ position: 'absolute', top: 60, left: 16, width: 260, pointerEvents: 'auto' }}>
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
        <div className="hud-entrance-left" style={{ position: 'absolute', top: 270, left: 16, width: 260, pointerEvents: 'auto', animationDelay: '0.1s' }}>
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
        <div className="hud-entrance-left" style={{ position: 'absolute', top: 450, left: 16, width: 260, pointerEvents: 'auto', animationDelay: '0.15s' }}>
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

        {/* ═══ TOP-RIGHT: Attack Trend ═══ */}
        <div className="hud-entrance-right" style={{ position: 'absolute', top: 60, right: 16, width: 300, pointerEvents: 'auto' }}>
          <HudPanel accent="red" title="ATTACK TREND · 10 MIN">
            <TrendSparkline data={trendData} />
          </HudPanel>
        </div>

        {/* ═══ RIGHT-MID: Top Threat Vectors ═══ */}
        <div className="hud-entrance-right" style={{ position: 'absolute', top: 210, right: 16, width: 300, pointerEvents: 'auto', animationDelay: '0.1s' }}>
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
        <div className="hud-entrance-right" style={{ position: 'absolute', top: 420, right: 16, width: 300, pointerEvents: 'auto', animationDelay: '0.15s' }}>
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

        {/* ═══ BOTTOM-LEFT: Major Origins ═══ */}
        <div className="hud-entrance-bottom" style={{ position: 'absolute', bottom: 16, left: 16, width: 260, pointerEvents: 'auto' }}>
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

        {/* ═══ BOTTOM-RIGHT: Live Threat Feed ═══ */}
        <div className="hud-entrance-right" style={{ position: 'absolute', bottom: 16, right: 16, width: 340, pointerEvents: 'auto', animationDelay: '0.1s' }}>
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

/* ─── HUD Button Style ───────────────────────────────────────────────────── */

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

/* ─── World Map SVG ──────────────────────────────────────────────────────── */

function WorldMapSVG() {
  return (
    <svg
      viewBox="0 0 1200 600"
      style={{ width: '100%', height: '100%', maxHeight: '100vh' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Grid lines */}
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="1200" height="600" fill="url(#grid)" />

      {/* Latitude lines */}
      {[100, 200, 300, 400, 500].map(y => (
        <line key={`lat-${y}`} x1="0" y1={y} x2="1200" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="4,8" />
      ))}
      {/* Longitude lines */}
      {[200, 400, 600, 800, 1000].map(x => (
        <line key={`lon-${x}`} x1={x} y1="0" x2={x} y2="600" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="4,8" />
      ))}

      {/* Simplified world map - continents as path shapes */}
      <g fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5">
        {/* North America */}
        <path d="M150,100 L180,80 L220,75 L280,80 L320,100 L340,130 L350,160 L340,190 L320,210 L280,240 L260,280 L240,300 L220,290 L200,280 L180,260 L160,230 L140,200 L130,170 L140,140 Z" />
        {/* Central America */}
        <path d="M220,290 L240,300 L250,320 L240,340 L230,350 L220,340 L215,320 L218,300 Z" />
        {/* South America */}
        <path d="M240,340 L260,350 L290,370 L310,400 L320,440 L310,480 L290,510 L270,530 L260,520 L250,490 L240,460 L230,420 L225,390 L230,360 Z" />
        {/* Europe */}
        <path d="M520,100 L540,90 L570,85 L600,90 L620,100 L630,120 L620,140 L600,160 L580,170 L560,165 L540,150 L520,130 L515,115 Z" />
        {/* UK/Ireland */}
        <path d="M490,100 L505,95 L510,110 L505,125 L495,120 L490,110 Z" />
        {/* Scandinavia */}
        <path d="M560,60 L570,50 L590,55 L600,70 L595,85 L580,90 L565,80 Z" />
        {/* Africa */}
        <path d="M530,200 L560,190 L590,195 L620,210 L640,240 L650,280 L645,320 L630,360 L610,400 L590,430 L570,440 L550,430 L540,400 L520,360 L510,320 L505,280 L510,240 L520,220 Z" />
        {/* Middle East */}
        <path d="M630,160 L660,150 L690,160 L700,180 L690,200 L670,210 L650,205 L635,190 L630,175 Z" />
        {/* Russia/Central Asia */}
        <path d="M620,80 L680,60 L740,50 L800,45 L860,50 L920,60 L960,70 L980,85 L970,100 L940,110 L900,115 L850,110 L800,105 L750,100 L700,95 L660,95 L630,90 Z" />
        {/* India */}
        <path d="M720,200 L740,190 L760,200 L770,230 L760,260 L740,280 L720,270 L710,240 L715,220 Z" />
        {/* China/East Asia */}
        <path d="M800,120 L840,110 L880,115 L920,130 L940,150 L930,170 L910,185 L880,195 L850,190 L820,180 L800,165 L790,145 Z" />
        {/* Japan */}
        <path d="M950,140 L960,130 L965,145 L960,160 L955,155 Z" />
        {/* Southeast Asia */}
        <path d="M830,230 L860,220 L880,230 L890,250 L880,270 L860,280 L840,275 L830,260 L825,245 Z" />
        {/* Indonesia */}
        <path d="M840,300 L870,295 L900,300 L920,310 L910,320 L880,315 L855,310 Z" />
        {/* Australia */}
        <path d="M880,380 L920,370 L960,375 L990,390 L1000,420 L990,450 L970,470 L940,475 L910,470 L890,450 L880,420 L875,400 Z" />
        {/* New Zealand */}
        <path d="M1020,460 L1030,450 L1035,465 L1030,480 L1022,475 Z" />
        {/* Greenland */}
        <path d="M340,40 L380,35 L410,45 L420,60 L410,75 L380,80 L350,70 L340,55 Z" />
        {/* Madagascar */}
        <path d="M650,400 L660,395 L665,415 L660,430 L652,422 Z" />
      </g>

      {/* Equator */}
      <line x1="0" y1="300" x2="1200" y2="300" stroke="rgba(239,68,68,0.08)" strokeWidth="0.5" strokeDasharray="8,4" />
      {/* Tropics */}
      <line x1="0" y1="200" x2="1200" y2="200" stroke="rgba(245,158,11,0.05)" strokeWidth="0.5" strokeDasharray="4,12" />
      <line x1="0" y1="400" x2="1200" y2="400" stroke="rgba(245,158,11,0.05)" strokeWidth="0.5" strokeDasharray="4,12" />

      {/* Marker dots for key cities/hotspots */}
      {[
        { x: 280, y: 180, label: 'US' },
        { x: 560, y: 130, label: 'EU' },
        { x: 850, y: 150, label: 'CN' },
        { x: 950, y: 145, label: 'JP' },
        { x: 740, y: 250, label: 'IN' },
        { x: 650, y: 120, label: 'RU' },
        { x: 560, y: 300, label: 'AF' },
        { x: 940, y: 420, label: 'AU' },
        { x: 270, y: 390, label: 'BR' },
      ].map(({ x, y, label }) => (
        <g key={label}>
          <circle cx={x} cy={y} r="3" fill="rgba(239,68,68,0.4)" />
          <circle cx={x} cy={y} r="6" fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth="0.5" />
          <text x={x + 10} y={y + 3} fill="rgba(255,255,255,0.2)" fontSize="7" fontFamily="'JetBrains Mono', monospace">{label}</text>
        </g>
      ))}

      {/* Coordinate labels */}
      <text x="1190" y="305" fill="rgba(255,255,255,0.1)" fontSize="6" textAnchor="end" fontFamily="'JetBrains Mono', monospace">0°</text>
      <text x="1190" y="205" fill="rgba(255,255,255,0.06)" fontSize="6" textAnchor="end" fontFamily="'JetBrains Mono', monospace">23.4°N</text>
      <text x="1190" y="405" fill="rgba(255,255,255,0.06)" fontSize="6" textAnchor="end" fontFamily="'JetBrains Mono', monospace">23.4°S</text>
    </svg>
  );
}

