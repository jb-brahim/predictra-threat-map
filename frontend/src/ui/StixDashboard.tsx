import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { theme } from '../theme/theme';
import { GlassPanel } from './GlassPanel';

// ─── STIX JSON DATA (embedded) ───────────────────────────────────────────────
// @ts-ignore
import cisaRaw from '../data/cisa.json';
// @ts-ignore
import ivantiRaw from '../data/ivanti.json';
import type { Definition } from '../data/definitions';
import { DEFINITIONS } from '../data/definitions';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface StixObject {
  id: string;
  type: string;
  name?: string;
  description?: string;
  created?: string;
  modified?: string;
  published?: string;
  pattern?: string;
  pattern_type?: string;
  indicator_types?: string[];
  valid_from?: string;
  external_references?: { external_id?: string; source_name?: string; url?: string }[];
  object_refs?: string[];
  source_ref?: string;
  target_ref?: string;
  relationship_type?: string;
  country?: string;
  administrative_area?: string;
  spec_version?: string;
  created_by_ref?: string;
  [key: string]: unknown;
}

interface StixBundle {
  type: string;
  id: string;
  objects: StixObject[];
}

interface ParsedStixData {
  reports: StixObject[];
  attackPatterns: StixObject[];
  indicators: StixObject[];
  locations: StixObject[];
  relationships: StixObject[];
  identities: StixObject[];
  markingDefinitions: StixObject[];
  allObjects: StixObject[];
  objectMap: Map<string, StixObject>;
}

// ─── STIX PARSER ─────────────────────────────────────────────────────────────
function parseBundle(bundle: StixBundle): ParsedStixData {
  const reports: StixObject[] = [];
  const attackPatterns: StixObject[] = [];
  const indicators: StixObject[] = [];
  const locations: StixObject[] = [];
  const relationships: StixObject[] = [];
  const identities: StixObject[] = [];
  const markingDefinitions: StixObject[] = [];
  const objectMap = new Map<string, StixObject>();

  for (const obj of bundle.objects) {
    objectMap.set(obj.id, obj);
    switch (obj.type) {
      case 'report': reports.push(obj); break;
      case 'attack-pattern': attackPatterns.push(obj); break;
      case 'indicator': indicators.push(obj); break;
      case 'location': locations.push(obj); break;
      case 'relationship': relationships.push(obj); break;
      case 'identity': identities.push(obj); break;
      case 'marking-definition': markingDefinitions.push(obj); break;
    }
  }

  return {
    reports, attackPatterns, indicators, locations,
    relationships, identities, markingDefinitions,
    allObjects: bundle.objects,
    objectMap,
  };
}

function mergeData(a: ParsedStixData, b: ParsedStixData): ParsedStixData {
  const objectMap = new Map([...a.objectMap, ...b.objectMap]);
  return {
    reports: [...a.reports, ...b.reports],
    attackPatterns: dedup([...a.attackPatterns, ...b.attackPatterns]),
    indicators: dedup([...a.indicators, ...b.indicators]),
    locations: dedup([...a.locations, ...b.locations]),
    relationships: [...a.relationships, ...b.relationships],
    identities: dedup([...a.identities, ...b.identities]),
    markingDefinitions: dedup([...a.markingDefinitions, ...b.markingDefinitions]),
    allObjects: [...a.allObjects, ...b.allObjects],
    objectMap,
  };
}

function dedup(arr: StixObject[]): StixObject[] {
  const seen = new Set<string>();
  return arr.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
}

const STIX_COLORS: Record<string, string> = {
  'report': '#8B5CF6',
  'attack-pattern': '#EF4444',
  'indicator': '#F59E0B',
  'location': '#3B82F6',
  'identity': '#10B981',
  'malware': '#D946EF',
  'campaign': '#F43F5E',
  'threat-actor': '#F97316',
};

// ─── MITRE ATT&CK KILL CHAIN PHASES ─────────────────────────────────────────
const KILL_CHAIN_PHASES = [
  { id: 'recon', label: 'Reconnaissance', keywords: ['reconnaissance', 'scanning', 'active scanning'], color: '#8B5CF6' },
  { id: 'resource', label: 'Resource Dev', keywords: ['resource development', 'acquire infrastructure', 'compromise infrastructure'], color: '#A855F7' },
  { id: 'initial', label: 'Initial Access', keywords: ['initial access', 'exploit public-facing', 'phishing'], color: '#EF4444' },
  { id: 'execution', label: 'Execution', keywords: ['execution', 'command and scripting', 'powershell'], color: '#F97316' },
  { id: 'persistence', label: 'Persistence', keywords: ['persistence', 'server software', 'web shell', 'scheduled task', 'cron', 'bits jobs'], color: '#F59E0B' },
  { id: 'privesc', label: 'Privilege Esc.', keywords: ['privilege escalation', 'exploitation for privilege', 'valid accounts'], color: '#EAB308' },
  { id: 'defense', label: 'Defense Evasion', keywords: ['defense evasion', 'obfuscated', 'indicator removal', 'indirect command'], color: '#22C55E' },
  { id: 'cred', label: 'Credential Access', keywords: ['credential', 'brute force'], color: '#10B981' },
  { id: 'discovery', label: 'Discovery', keywords: ['discovery', 'account discovery', 'file and directory', 'network service', 'process discovery', 'remote system', 'system information', 'system network', 'system owner'], color: '#06B6D4' },
  { id: 'lateral', label: 'Lateral Mvmt', keywords: ['lateral movement', 'remote services', 'remote desktop'], color: '#3B82F6' },
  { id: 'collection', label: 'Collection', keywords: ['collection', 'data from information'], color: '#6366F1' },
  { id: 'c2', label: 'Command & Control', keywords: ['command and control', 'proxy', 'data obfuscation', 'ingress tool', 'protocol impersonation'], color: '#8B5CF6' },
];

function mapAttackToPhase(name: string): string[] {
  const lower = name.toLowerCase();
  const phases: string[] = [];
  for (const phase of KILL_CHAIN_PHASES) {
    if (phase.keywords.some(kw => lower.includes(kw))) {
      phases.push(phase.id);
    }
  }
  return phases.length > 0 ? phases : ['unknown'];
}

// ─── INDICATOR CLASSIFIER ────────────────────────────────────────────────────
function classifyIndicator(obj: StixObject): { type: string; value: string; icon: string } {
  const pattern = obj.pattern || '';
  if (pattern.includes('ipv4-addr')) {
    const match = pattern.match(/(\d+\.\d+\.\d+\.\d+)/);
    return { type: 'IPv4', value: match ? match[1] : pattern, icon: '🌐' };
  }
  if (pattern.includes('ipv6-addr')) {
    return { type: 'IPv6', value: pattern, icon: '🌐' };
  }
  if (pattern.includes('file:hashes')) {
    const md5 = pattern.match(/MD5\s*=\s*'([^']+)'/i);
    const sha256 = pattern.match(/SHA-256[^=]*=\s*'([^']+)'/i);
    const sha1 = pattern.match(/SHA-1[^=]*=\s*'([^']+)'/i);
    const val = md5?.[1] || sha256?.[1] || sha1?.[1] || pattern;
    const hashType = sha256?.[1] ? 'SHA-256' : sha1?.[1] ? 'SHA-1' : 'MD5';
    return { type: `File (${hashType})`, value: val, icon: '📄' };
  }
  if (pattern.includes('mutex')) {
    const match = pattern.match(/'([^']+)'/);
    return { type: 'Mutex', value: match ? match[1] : pattern, icon: '🔒' };
  }
  if (pattern.includes('domain-name')) {
    return { type: 'Domain', value: pattern, icon: '🔗' };
  }
  if (pattern.includes('url')) {
    return { type: 'URL', value: pattern, icon: '🌍' };
  }
  return { type: 'Other', value: pattern, icon: '❓' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function StixDashboard() {
  const data = useMemo(() => {
    const d1 = parseBundle(cisaRaw as StixBundle);
    const d2 = parseBundle(ivantiRaw as StixBundle);
    return mergeData(d1, d2);
  }, []);

  const [selectedReport, setSelectedReport] = useState<StixObject | null>(null);
  const [iocFilter, setIocFilter] = useState('');
  const [iocTypeFilter, setIocTypeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'iocs' | 'visualizer'>('overview');
  const [selectedItem, setSelectedItem] = useState<{ type: string; id: string; data?: any } | null>(null);

  // Stats
  const classifiedIndicators = useMemo(() => data.indicators.map(i => ({
    ...i,
    classified: classifyIndicator(i),
  })), [data]);

  const iocTypes = useMemo(() => {
    const types = new Set(classifiedIndicators.map(i => i.classified.type));
    return ['all', ...Array.from(types)];
  }, [classifiedIndicators]);

  const filteredIOCs = useMemo(() => {
    return classifiedIndicators.filter(ioc => {
      const matchesSearch = iocFilter === '' ||
        ioc.classified.value.toLowerCase().includes(iocFilter.toLowerCase()) ||
        ioc.classified.type.toLowerCase().includes(iocFilter.toLowerCase());
      const matchesType = iocTypeFilter === 'all' || ioc.classified.type === iocTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [classifiedIndicators, iocFilter, iocTypeFilter]);

  // Kill chain mapping
  const killChainMap = useMemo(() => {
    const map: Record<string, StixObject[]> = {};
    for (const ap of data.attackPatterns) {
      const phases = mapAttackToPhase(ap.name || '');
      for (const phase of phases) {
        if (!map[phase]) map[phase] = [];
        map[phase].push(ap);
      }
    }
    return map;
  }, [data]);

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: '340px 1fr' + (selectedItem ? ' 420px' : ''),
      height: '100%', 
      overflow: 'hidden',
      background: 'rgba(5, 5, 15, 0.4)',
      gap: 0,
      transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      {/* ─── LEFT SIDEBAR: REPORT BROWSER ────────────────────────── */}
      <div style={{ 
        borderRight: '1px solid rgba(255,255,255,0.06)', 
        display: 'flex', 
        flexDirection: 'column',
        background: 'rgba(10, 15, 30, 0.4)',
        zIndex: 10
      }}>
        <div style={{ padding: '24px 24px 12px' }}>
          <h2 style={{
            margin: 0, fontSize: 18, fontFamily: theme.fonts.display, fontWeight: 900,
            letterSpacing: 2, color: theme.colors.textPrimary, display: 'flex', alignItems: 'center', gap: 10
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B5CF6', boxShadow: '0 0 12px #8B5CF6' }} />
            SENTINEL HUB
          </h2>
          <div style={{ fontSize: 9, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4, fontWeight: 700 }}>
            Threat Intelligence Matrix
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          <div style={{ 
            fontSize: 10, fontWeight: 800, color: theme.colors.textDim, 
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <span style={{ opacity: 0.5 }}>📂</span> Intelligence Bundles ({data.reports.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.reports.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                isSelected={selectedReport?.id === report.id}
                onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}
                attackCount={report.object_refs?.filter(r => r.startsWith('attack-pattern')).length || 0}
                indicatorCount={report.object_refs?.filter(r => r.startsWith('indicator')).length || 0}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ─── MAIN CONTENT ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* TELEMETRY STRIP (Compact Header) */}
        <div style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', gap: 32 }}>
            <TelemetryItem 
              label="Intelligence" 
              value={data.reports.length} 
              color="#8B5CF6" 
              icon="📄" 
              onClick={() => setSelectedItem({ type: 'definition', id: 'threat-reports' })}
            />
            <TelemetryItem 
              label="Techniques" 
              value={data.attackPatterns.length} 
              color={theme.colors.exploit} 
              icon="⚔️" 
              onClick={() => setSelectedItem({ type: 'definition', id: 'attack-patterns' })}
            />
            <TelemetryItem 
              label="IOCs" 
              value={data.indicators.length} 
              color={theme.colors.malware} 
              icon="🎯" 
              onClick={() => setSelectedItem({ type: 'definition', id: 'indicators' })}
            />
            <TelemetryItem 
              label="Kill Chain" 
              value={`${Object.keys(killChainMap).filter(k => k !== 'unknown').length}/${KILL_CHAIN_PHASES.length}`} 
              color="#06B6D4" 
              icon="🔗" 
              onClick={() => setSelectedItem({ type: 'definition', id: 'kill-chain' })}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
            {(['overview', 'iocs', 'visualizer'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: activeTab === tab ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                  border: 'none',
                  color: activeTab === tab ? '#C4B5FD' : theme.colors.textDim,
                  fontSize: 10,
                  fontWeight: 900,
                  fontFamily: theme.fonts.display,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Canvas */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeTab === 'overview' && (
            <OverviewTab
              data={data}
              killChainMap={killChainMap}
              selectedReport={selectedReport}
              setSelectedItem={setSelectedItem}
            />
          )}
          {activeTab === 'iocs' && (
            <IOCTab
              filteredIOCs={filteredIOCs}
              iocFilter={iocFilter}
              setIocFilter={setIocFilter}
              iocTypeFilter={iocTypeFilter}
              setIocTypeFilter={setIocTypeFilter}
              iocTypes={iocTypes}
              totalCount={classifiedIndicators.length}
            />
          )}
          {activeTab === 'visualizer' && (
            <VisualizerTab data={data} setSelectedObject={(o) => setSelectedItem({ type: 'stix', id: o.id, data: o })} />
          )}
        </div>
      </div>

      {/* ─── CONTEXT PANEL ────────────────────────────────────────── */}
      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}

function OverviewTab({ data, killChainMap, selectedReport, setSelectedItem }: {
  data: ParsedStixData;
  killChainMap: Record<string, StixObject[]>;
  selectedReport: StixObject | null;
  setSelectedItem: (item: { type: string; id: string; data?: any }) => void;
}) {
  const [activePhase, setActivePhase] = useState<string | null>(null);

  // Filter techniques if a report is selected
  const filteredKillChainMap = useMemo(() => {
    if (!selectedReport) return killChainMap;
    const reportRefs = new Set(selectedReport.object_refs || []);
    const newMap: Record<string, StixObject[]> = {};
    for (const [phase, techs] of Object.entries(killChainMap)) {
      const filtered = techs.filter(t => reportRefs.has(t.id));
      if (filtered.length > 0) newMap[phase] = filtered;
    }
    return newMap;
  }, [selectedReport, killChainMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
      {/* ─── INTERACTIVE KILL CHAIN FILTER ─────────────────────────── */}
      <GlassPanel style={{ flexShrink: 0, paddingBottom: 12 }}>
        <div style={{
          fontSize: 10, fontFamily: theme.fonts.display, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: 1.5, color: theme.colors.textDim,
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6', boxShadow: '0 0 8px #8B5CF6' }} />
          MATRIX NAVIGATION: SELECT PHASE TO DRILL DOWN
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${KILL_CHAIN_PHASES.length}, 1fr)`,
          gap: 4,
        }}>
          {KILL_CHAIN_PHASES.map(phase => {
            const techniques = filteredKillChainMap[phase.id] || [];
            const isActive = techniques.length > 0;
            const isSelected = activePhase === phase.id;
            
            return (
              <div
                key={phase.id}
                onClick={() => setActivePhase(isSelected ? null : phase.id)}
                style={{
                  position: 'relative',
                  padding: '12px 6px',
                  borderRadius: 6,
                  background: isSelected
                    ? `${phase.color}25`
                    : isActive
                      ? `linear-gradient(180deg, ${phase.color}15, transparent)`
                      : 'rgba(255,255,255,0.01)',
                  borderTop: `2px solid ${isActive ? phase.color : 'rgba(255,255,255,0.03)'}`,
                  textAlign: 'center',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  opacity: (!activePhase || isSelected) ? 1 : 0.4,
                  transform: isSelected ? 'translateY(-2px)' : 'none',
                }}
              >
                <div style={{
                  fontSize: 16, fontWeight: 900, fontFamily: theme.fonts.display,
                  color: isActive ? phase.color : 'rgba(255,255,255,0.1)',
                  marginBottom: 2,
                }}>
                  {techniques.length || '0'}
                </div>
                <div style={{
                  fontSize: 7, fontWeight: 800, fontFamily: theme.fonts.display,
                  textTransform: 'uppercase', letterSpacing: 0.2, whiteSpace: 'nowrap',
                  color: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.05)',
                }}>
                  {phase.id.substring(0, 6)}
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* ─── INTELLIGENCE MATRIX: GROUPED TECHNIQUES ────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, fontFamily: theme.fonts.display,
          textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.colors.malware, boxShadow: `0 0 8px ${theme.colors.malware}` }} />
          INTELLIGENCE MATRIX {selectedReport ? `— FILTERED BY ${selectedReport.id.split('--')[1].substring(0,8)}` : ''}
        </div>
        
        <GlassPanel style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 24 }}>
            {KILL_CHAIN_PHASES.filter(p => !activePhase || activePhase === p.id).map(phase => {
              const techniques = filteredKillChainMap[phase.id];
              if (!techniques || techniques.length === 0) return null;
              
              return (
                <div key={phase.id}>
                  <div style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2,
                    color: phase.color, marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 8,
                    paddingBottom: 8, borderBottom: `1px solid ${phase.color}20`
                  }}>
                    <span style={{ fontSize: 14 }}>{getPhaseIcon(phase.id)}</span>
                    {phase.label} ({techniques.length})
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {techniques.map(tech => {
                      const mitreRef = tech.external_references?.find(r => r.source_name === 'mitre-attack');
                      return (
                        <div
                          key={tech.id}
                          onClick={() => setSelectedItem({ type: 'stix', id: tech.id, data: tech })}
                          style={{
                            padding: '12px 14px', borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            transition: 'all 0.2s',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.borderColor = `${phase.color}40`;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: theme.colors.textPrimary, flex: 1 }}>
                              {tech.name}
                            </span>
                            {mitreRef?.external_id && (
                              <span style={{
                                fontSize: 9, fontFamily: theme.fonts.mono, color: phase.color,
                                padding: '2px 6px', borderRadius: 4,
                                background: `${phase.color}15`, border: `1px solid ${phase.color}30`,
                              }}>
                                {mitreRef.external_id}
                              </span>
                            )}
                          </div>
                          
                          <div style={{ fontSize: 10, color: theme.colors.textDim, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {tech.description || 'No detailed TTP analysis available.'}
                          </div>
                          
                          {/* Mini-stats for the technique */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                             <div style={{ fontSize: 8, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                               Detected in {data.reports.filter(r => r.object_refs?.includes(tech.id)).length} reports
                             </div>
                          </div>
                        </div>
                      );
                    })}
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

function getPhaseIcon(id: string): string {
  switch (id) {
    case 'recon': return '🔍';
    case 'resource': return '🏗️';
    case 'initial': return '🚪';
    case 'execution': return '⚡';
    case 'persistence': return '⚓';
    case 'privesc': return '🔼';
    case 'defense': return '🎭';
    case 'cred': return '🔑';
    case 'discovery': return '🗺️';
    case 'lateral': return '➡️';
    case 'collection': return '📦';
    case 'c2': return '📡';
    default: return '🛡️';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// IOC TAB
// ═══════════════════════════════════════════════════════════════════════════════
function IOCTab({ filteredIOCs, iocFilter, setIocFilter, iocTypeFilter, setIocTypeFilter, iocTypes, totalCount }: {
  filteredIOCs: (StixObject & { classified: { type: string; value: string; icon: string } })[];
  iocFilter: string;
  setIocFilter: (v: string) => void;
  iocTypeFilter: string;
  setIocTypeFilter: (v: string) => void;
  iocTypes: string[];
  totalCount: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          flex: 1, position: 'relative',
        }}>
          <input
            type="text"
            placeholder="Search IOCs by value, hash, IP..."
            value={iocFilter}
            onChange={e => setIocFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px 10px 40px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              color: theme.colors.textPrimary,
              fontSize: 13,
              fontFamily: theme.fonts.body,
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(139, 92, 246, 0.4)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            fontSize: 16, opacity: 0.4,
          }}>🔍</span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {iocTypes.map(type => (
            <button
              key={type}
              onClick={() => setIocTypeFilter(type)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: iocTypeFilter === type
                  ? '1px solid rgba(139, 92, 246, 0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                background: iocTypeFilter === type
                  ? 'rgba(139, 92, 246, 0.12)'
                  : 'rgba(255,255,255,0.02)',
                color: iocTypeFilter === type ? '#C4B5FD' : theme.colors.textDim,
                fontSize: 10,
                fontWeight: 700,
                fontFamily: theme.fonts.display,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {type === 'all' ? `All (${totalCount})` : type}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div style={{
        fontSize: 11, color: theme.colors.textDim, fontFamily: theme.fonts.mono,
        flexShrink: 0,
      }}>
        Showing {filteredIOCs.length} of {totalCount} indicators
      </div>

      {/* IOC Table */}
      <GlassPanel style={{ flex: 1, overflow: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.98)', zIndex: 1 }}>
              {['', 'Type', 'Value', 'Indicator Type', 'Valid From'].map(h => (
                <th key={h} style={{
                  padding: '12px 14px',
                  textAlign: 'left',
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: theme.fonts.display,
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: theme.colors.textDim,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredIOCs.slice(0, 200).map((ioc) => (
              <tr
                key={ioc.id}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  transition: 'background 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '8px 14px', fontSize: 14 }}>{ioc.classified.icon}</td>
                <td style={{ padding: '8px 14px' }}>
                  <span style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: 4,
                    background: getIOCColor(ioc.classified.type) + '15',
                    border: `1px solid ${getIOCColor(ioc.classified.type)}30`,
                    color: getIOCColor(ioc.classified.type),
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {ioc.classified.type}
                  </span>
                </td>
                <td style={{
                  padding: '8px 14px', fontFamily: theme.fonts.mono,
                  fontSize: 11, color: theme.colors.textPrimary,
                  maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ioc.classified.value}
                </td>
                <td style={{ padding: '8px 14px', color: theme.colors.textDim, fontSize: 11 }}>
                  {ioc.indicator_types?.join(', ') || '—'}
                </td>
                <td style={{
                  padding: '8px 14px', color: theme.colors.textDim, fontSize: 10,
                  fontFamily: theme.fonts.mono,
                }}>
                  {ioc.valid_from ? new Date(ioc.valid_from).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredIOCs.length > 200 && (
          <div style={{
            padding: 16, textAlign: 'center', color: theme.colors.textDim, fontSize: 12,
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            Showing first 200 of {filteredIOCs.length} results. Use search to narrow down.
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

function getIOCColor(type: string): string {
  if (type.includes('IPv')) return '#3B82F6';
  if (type.includes('File')) return '#F59E0B';
  if (type.includes('Mutex')) return '#8B5CF6';
  if (type.includes('Domain')) return '#EF4444';
  if (type.includes('URL')) return '#06B6D4';
  return '#6B7280';
}

// ═══════════════════════════════════════════════════════════════════════════════
// STIX VISUALIZER TAB (Canvas Force-Directed Graph)
// ═══════════════════════════════════════════════════════════════════════════════
interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pinned: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

function buildGraph(data: ParsedStixData): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  const typeConfig: Record<string, { color: string; radius: number }> = {
    'report': { color: '#8B5CF6', radius: 22 },
    'attack-pattern': { color: '#EF4444', radius: 10 },
    'indicator': { color: '#F59E0B', radius: 6 },
    'location': { color: '#3B82F6', radius: 14 },
    'identity': { color: '#10B981', radius: 14 },
    'relationship': { color: '#6B7280', radius: 4 },
    'marking-definition': { color: '#64748B', radius: 4 },
  };

  // Add reports
  for (const r of data.reports) {
    addNode(r, 'report');
    // Connect report to its object_refs
    if (r.object_refs) {
      for (const ref of r.object_refs) {
        if (data.objectMap.has(ref)) {
          const target = data.objectMap.get(ref)!;
          if (target.type !== 'marking-definition') {
            addNode(target, target.type);
            edges.push({ source: r.id, target: ref, label: 'references' });
          }
        }
      }
    }
  }

  // Add relationships
  for (const rel of data.relationships) {
    if (rel.source_ref && rel.target_ref) {
      const src = data.objectMap.get(rel.source_ref);
      const tgt = data.objectMap.get(rel.target_ref);
      if (src && tgt) {
        addNode(src, src.type);
        addNode(tgt, tgt.type);
        edges.push({
          source: rel.source_ref,
          target: rel.target_ref,
          label: rel.relationship_type || 'related',
        });
      }
    }
  }

  function addNode(obj: StixObject, type: string) {
    if (nodeIds.has(obj.id)) return;
    if (type === 'marking-definition') return;
    nodeIds.add(obj.id);

    const cfg = typeConfig[type] || { color: '#6B7280', radius: 8 };
    let label = obj.name || obj.type || obj.id.split('--')[0];
    if (label.length > 30) label = label.substring(0, 30) + '…';

    nodes.push({
      id: obj.id,
      label,
      type,
      x: (Math.random() - 0.5) * 800,
      y: (Math.random() - 0.5) * 600,
      vx: 0,
      vy: 0,
      radius: cfg.radius,
      color: cfg.color,
      pinned: false,
    });
  }

  return { nodes, edges };
}

function VisualizerTab({ data, setSelectedObject }: { data: ParsedStixData; setSelectedObject?: (o: StixObject) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dragNode, setDragNode] = useState<GraphNode | null>(null);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const [selectedType, setSelectedType] = useState<string>('all');

  // Build graph once
  useEffect(() => {
    graphRef.current = buildGraph(data);
  }, [data]);

  // Simulation loop
  const simulate = useCallback(() => {
    const { nodes, edges } = graphRef.current;
    if (nodes.length === 0) return;

    const edgeMap = new Map<string, string[]>();
    for (const e of edges) {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
      if (!edgeMap.has(e.target)) edgeMap.set(e.target, []);
      edgeMap.get(e.source)!.push(e.target);
      edgeMap.get(e.target)!.push(e.source);
    }

    // Force simulation step
    const REPULSION = 2000;
    const ATTRACTION = 0.003;
    const DAMPING = 0.85;
    const CENTER_FORCE = 0.0005;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.pinned) continue;

      let fx = 0, fy = 0;

      // Center gravity
      fx -= n.x * CENTER_FORCE;
      fy -= n.y * CENTER_FORCE;

      // Node repulsion (only nearby nodes for performance)
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const m = nodes[j];
        const dx = n.x - m.x;
        const dy = n.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        if (dist < 400) {
          const force = REPULSION / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }

      // Edge attraction
      const neighbors = edgeMap.get(n.id) || [];
      for (const nid of neighbors) {
        const m = nodes.find(nn => nn.id === nid);
        if (!m) continue;
        const dx = m.x - n.x;
        const dy = m.y - n.y;
        fx += dx * ATTRACTION;
        fy += dy * ATTRACTION;
      }

      n.vx = (n.vx + fx) * DAMPING;
      n.vy = (n.vy + fy) * DAMPING;
      n.x += n.vx;
      n.y += n.vy;
    }
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const container = containerRef.current;
      if (container) {
        canvas.width = container.clientWidth * window.devicePixelRatio;
        canvas.height = container.clientHeight * window.devicePixelRatio;
        canvas.style.width = container.clientWidth + 'px';
        canvas.style.height = container.clientHeight + 'px';
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }

      simulate();

      const { nodes, edges } = graphRef.current;
      const cam = cameraRef.current;
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + cam.x, h / 2 + cam.y);
      ctx.scale(cam.zoom, cam.zoom);

      // Filter
      const visibleNodes = selectedType === 'all' ? nodes : nodes.filter(n => n.type === selectedType || n.type === 'report');
      const visibleIds = new Set(visibleNodes.map(n => n.id));
      const visibleEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

      // Draw edges
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 0.5;
      for (const e of visibleEdges) {
        const src = nodes.find(n => n.id === e.source);
        const tgt = nodes.find(n => n.id === e.target);
        if (!src || !tgt) continue;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
      }

      // Draw nodes
      ctx.globalAlpha = 1;
      for (const n of visibleNodes) {
        // Glow
        ctx.shadowColor = n.color;
        ctx.shadowBlur = hoveredNode?.id === n.id ? 20 : 8;
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Label for larger nodes
        if (n.radius > 8 || hoveredNode?.id === n.id) {
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = `${Math.max(8, n.radius * 0.7)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + n.radius + 12);
        }
      }

      ctx.restore();

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [simulate, hoveredNode, selectedType]);

  // Mouse interaction
  const screenToWorld = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const cx = rect.width / 2 + cam.x;
    const cy = rect.height / 2 + cam.y;
    return {
      x: (sx - rect.left - cx) / cam.zoom,
      y: (sy - rect.top - cy) / cam.zoom,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = screenToWorld(e.clientX, e.clientY);
    const { nodes } = graphRef.current;
    const hit = nodes.find(n => {
      const dx = n.x - pos.x;
      const dy = n.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) < n.radius + 5;
    });

    if (hit) {
      hit.pinned = true;
      setDragNode(hit);
      const stixObj = data.allObjects.find(o => o.id === hit.id);
      if (stixObj && setSelectedObject) setSelectedObject(stixObj);
    } else {
      isPanningRef.current = true;
    }
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, [screenToWorld]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragNode) {
      const pos = screenToWorld(e.clientX, e.clientY);
      dragNode.x = pos.x;
      dragNode.y = pos.y;
      dragNode.vx = 0;
      dragNode.vy = 0;
    } else if (isPanningRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    } else {
      // Hover detection
      const pos = screenToWorld(e.clientX, e.clientY);
      const { nodes } = graphRef.current;
      const hit = nodes.find(n => {
        const dx = n.x - pos.x;
        const dy = n.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) < n.radius + 5;
      });
      setHoveredNode(hit || null);
    }
  }, [dragNode, screenToWorld]);

  const handleMouseUp = useCallback(() => {
    if (dragNode) {
      dragNode.pinned = false;
      setDragNode(null);
    }
    isPanningRef.current = false;
  }, [dragNode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    cameraRef.current.zoom = Math.max(0.1, Math.min(5, cameraRef.current.zoom * factor));
  }, []);

  const nodeTypes = [
    { id: 'all', label: 'All', color: '#8B5CF6' },
    { id: 'report', label: 'Reports', color: '#8B5CF6' },
    { id: 'attack-pattern', label: 'Attacks', color: '#EF4444' },
    { id: 'indicator', label: 'IOCs', color: '#F59E0B' },
    { id: 'location', label: 'Locations', color: '#3B82F6' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      {/* Type filter + Legend */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: theme.colors.textDim, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginRight: 8 }}>
          Filter by type:
        </span>
        {nodeTypes.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedType(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 6,
              border: selectedType === t.id ? `1px solid ${t.color}60` : '1px solid rgba(255,255,255,0.06)',
              background: selectedType === t.id ? `${t.color}15` : 'rgba(255,255,255,0.02)',
              color: selectedType === t.id ? t.color : theme.colors.textDim,
              fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
              fontFamily: theme.fonts.display, textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.color }} />
            {t.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>
          {graphRef.current.nodes.length} nodes · {graphRef.current.edges.length} edges
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1, padding: 0, overflow: 'hidden', position: 'relative',
          cursor: dragNode ? 'grabbing' : 'grab',
          background: theme.colors.panel,
          backdropFilter: `blur(${theme.blur.panel})`,
          border: `1px solid ${theme.colors.panelBorder}`,
          borderRadius: theme.radii.panel,
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {/* Tooltip */}
        {hoveredNode && !dragNode && (
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(5, 8, 15, 0.95)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${hoveredNode.color}40`,
            borderRadius: 10,
            padding: '12px 16px',
            maxWidth: 320,
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: hoveredNode.color,
                boxShadow: `0 0 8px ${hoveredNode.color}`,
              }} />
              <span style={{
                fontSize: 9, padding: '1px 8px', borderRadius: 4,
                background: `${hoveredNode.color}15`, border: `1px solid ${hoveredNode.color}30`,
                color: hoveredNode.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {hoveredNode.type}
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.colors.textPrimary, wordBreak: 'break-word' }}>
              {hoveredNode.label}
            </div>
            <div style={{ fontSize: 9, fontFamily: theme.fonts.mono, color: theme.colors.textDim, marginTop: 4 }}>
              {hoveredNode.id}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 9, color: 'rgba(255,255,255,0.3)',
          fontFamily: theme.fonts.mono,
          textAlign: 'right',
          lineHeight: 1.6,
        }}>
          Drag: move nodes<br />
          Scroll: zoom<br />
          Click+Drag (empty): pan
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE DETAIL PANEL (Slide-In)
// ═══════════════════════════════════════════════════════════════════════════════
function DetailPanel({ item, onClose }: { 
  item: { type: string; id: string; data?: any }; 
  onClose: () => void;
}) {
  let content: Definition | null = null;
  let stixData: StixObject | null = null;

  if (item.type === 'definition') {
    content = DEFINITIONS[item.id] || { title: item.id, description: 'No definition found.', category: 'concept' };
    if (item.id === 'kill-chain') {
      content = {
        title: 'MITRE ATT&CK Kill Chain',
        category: 'concept',
        description: 'A series of stages that describe the evolution of a cyber attack.',
        moreInfo: 'Defenders use this model to identify where an adversary is in their operation and how to best interrupt it.'
      };
    }
  } else if (item.type === 'stix') {
    stixData = item.data;
  }

  const accentColor = stixData ? (STIX_COLORS[stixData.type] || '#8B5CF6') : (content?.category === 'phase' ? theme.colors.exploit : '#8B5CF6');

  return (
    <div style={{
      width: 400, background: 'rgba(10, 15, 30, 0.98)', borderLeft: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      animation: 'slideIn 0.3s ease-out', zIndex: 1000,
      boxShadow: '-20px 0 50px rgba(0,0,0,0.5)'
    }}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      
      {/* Panel Header */}
      <div style={{ padding: '24px 30px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2.5, color: accentColor }}>
          Intelligence Briefing
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, opacity: 0.5 }}>×</button>
      </div>

      <div style={{ padding: 30, flex: 1, overflow: 'auto' }}>
        {content ? (
          <div>
            <h3 style={{ fontSize: 24, fontWeight: 900, fontFamily: theme.fonts.display, margin: '0 0 16px', color: '#fff' }}>{content.title}</h3>
            <div style={{ fontSize: 13, color: '#fff', opacity: 0.8, lineHeight: 1.6, marginBottom: 24, padding: '16px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', borderLeft: `4px solid ${accentColor}` }}>
              {content.description}
            </div>
            {content.moreInfo && (
              <div>
                <h4 style={{ fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Detailed Analysis</h4>
                <p style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.6 }}>{content.moreInfo}</p>
              </div>
            )}
          </div>
        ) : stixData ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${accentColor}20`, color: accentColor, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>
                {stixData.type}
              </span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 900, fontFamily: theme.fonts.display, margin: '0 0 20px', color: '#fff' }}>{stixData.name || stixData.id}</h3>
            
            <div style={{ padding: 16, borderRadius: 8, background: 'rgba(255,255,255,0.02)', marginBottom: 24 }}>
               <p style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 1.6, margin: 0 }}>
                 {stixData.description || 'No detailed description available for this threat object.'}
               </p>
            </div>

            {stixData.external_references && stixData.external_references.length > 0 && (
              <div>
                <h4 style={{ fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>References</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stixData.external_references.map((ref, i) => (
                    <a key={i} href={ref.url} target="_blank" rel="noreferrer" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 11 }}>
                      <span>{ref.source_name}</span>
                      <span style={{ color: accentColor }}>{ref.external_id || 'View'} ↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function ReportCard({ report, isSelected, onClick, attackCount, indicatorCount }: {
  report: StixObject;
  isSelected: boolean;
  onClick: () => void;
  attackCount: number;
  indicatorCount: number;
}) {
  const isCISA = report.name?.includes('CISA') || report.name?.includes('AA25');
  const isIvanti = report.name?.includes('Ivanti') || report.name?.includes('AA23');
  const accentColor = isCISA ? '#EF4444' : '#8B5CF6';

  // Extract CVEs from description
  const cves = report.description?.match(/CVE-\d{4}-\d{4,7}/g) || [];
  const uniqueCves = [...new Set(cves)];

  return (
    <GlassPanel
      hoverable
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderLeft: `3px solid ${accentColor}`,
        background: isSelected
          ? `linear-gradient(135deg, ${accentColor}12, rgba(15,23,42,0.95))`
          : undefined,
        border: isSelected
          ? `1px solid ${accentColor}40`
          : undefined,
        borderLeftWidth: 3,
        borderLeftStyle: 'solid',
        borderLeftColor: accentColor,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${accentColor}15`, border: `1px solid ${accentColor}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>
          {isCISA ? '🛡️' : '🐛'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: theme.colors.textPrimary,
            lineHeight: 1.35,
          }}>
            {report.name}
          </div>
          <div style={{
            fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.mono,
            marginTop: 2,
          }}>
            Published: {report.published ? new Date(report.published).toLocaleDateString() : '—'}
          </div>
        </div>
      </div>

      {/* CVE badges */}
      {uniqueCves.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {uniqueCves.map(cve => (
            <span key={cve} style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#EF4444', fontWeight: 700, fontFamily: theme.fonts.mono,
            }}>
              {cve}
            </span>
          ))}
        </div>
      )}

      {/* Description (collapsible) */}
      {isSelected && report.description && (
        <div style={{
          fontSize: 11, color: theme.colors.textSecondary, lineHeight: 1.5,
          marginBottom: 10, maxHeight: 120, overflow: 'auto',
          padding: '8px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}>
          {report.description.replace(/\\n/g, '\n').replace(/\\u2019/g, "'").substring(0, 500)}
          {(report.description?.length || 0) > 500 && '...'}
        </div>
      )}

      {/* Footer stats */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <StatChip label="Techniques" value={attackCount} color={theme.colors.exploit} />
        <StatChip label="IOCs" value={indicatorCount} color={theme.colors.malware} />
        {isIvanti && <StatChip label="Victim" value="🇳🇴 Norway" color="#8B5CF6" isText />}
        {isCISA && <StatChip label="Victim" value="🇺🇸 US FCEB" color="#3B82F6" isText />}
      </div>
    </GlassPanel>
  );
}

function StatChip({ label, value, color, isText }: {
  label: string; value: number | string; color: string; isText?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 8px', borderRadius: 6,
      background: `${color}10`, border: `1px solid ${color}20`,
    }}>
      <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: theme.colors.textDim }}>
        {label}
      </span>
      <span style={{
        fontSize: isText ? 10 : 12,
        fontWeight: 800,
        fontFamily: isText ? theme.fonts.body : theme.fonts.mono,
        color,
      }}>
        {value}
      </span>
    </div>
  );
}

function TelemetryItem({ label, value, color, icon, onClick }: {
  label: string; value: number | string; color: string; icon: string; onClick: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', opacity: 0.8, transition: 'opacity 0.2s' }}
      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
      onMouseLeave={e => e.currentTarget.style.opacity = '0.8'}
    >
      <div style={{ 
        width: 32, height: 32, borderRadius: 8, background: `${color}15`, 
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        fontSize: 14, border: `1px solid ${color}30` 
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 8, fontWeight: 800, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: color, fontFamily: theme.fonts.display }}>{value}</div>
      </div>
    </div>
  );
}
