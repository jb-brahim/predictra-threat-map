import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { theme } from '../theme/theme';
import { GlassPanel } from './GlassPanel';

// ─── STIX JSON DATA (embedded) ───────────────────────────────────────────────
// @ts-ignore
import cisaRaw from '../data/cisa.json';
// @ts-ignore
import ivantiRaw from '../data/ivanti.json';

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

// ─── CONSTANTS & CONFIG ──────────────────────────────────────────────────────
const STIX_COLORS: Record<string, string> = {
  'report': '#8B5CF6',        // Purple
  'threat-actor': '#ef4444',  // Red
  'malware': '#f97316',       // Orange
  'tool': '#eab308',          // Yellow
  'vulnerability': '#a855f7', // Purple-Pink
  'attack-pattern': '#10b981', // Green
  'identity': '#3b82f6',      // Blue
  'indicator': '#ec4899',     // Pink
  'campaign': '#06b6d4',      // Cyan
  'location': '#3B82F6',      // Blue
  'identity-sect': '#10b981', // Emerald
};

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

  const [selectedObject, setSelectedObject] = useState<StixObject | null>(null);
  const [iocFilter, setIocFilter] = useState('');
  const [iocTypeFilter, setIocTypeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'iocs' | 'visualizer'>('overview');

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
      display: 'flex', flexDirection: 'column', gap: 24, height: '100%', overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Background Holographic Layer */}
      <div className="cyber-grid-bg" style={{ position: 'absolute', inset: -100, opacity: 0.3 }} />
      <div className="cyber-scanline" />

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        padding: '0 4px', zIndex: 10,
      }}>
        <div className="entrance-anim" style={{ animationDelay: '0.1s' }}>
          <h2 style={{
            margin: 0,
            fontSize: 28,
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            letterSpacing: 3,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <span style={{
              width: 12, height: 12, borderRadius: 2,
              background: '#00D1FF',
              boxShadow: '0 0 16px #00D1FF',
            }} />
            STIX INTELLIGENCE CENTER
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: theme.colors.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <span style={{ color: '#8B5CF6' }}>LIVE THREAT DATASET</span> · {data.reports.length} Reports · {data.attackPatterns.length} Attacks · {data.indicators.length} IOCs
          </p>
        </div>

        {/* View Switches */}
        <div className="entrance-anim" style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 8,
          padding: 4,
          animationDelay: '0.2s',
        }}>
          {(['overview', 'iocs', 'visualizer'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 24px',
                background: activeTab === tab ? 'rgba(0, 209, 255, 0.1)' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(0, 209, 255, 0.2)' : '1px solid transparent',
                borderRadius: 6,
                color: activeTab === tab ? '#fff' : theme.colors.textDim,
                fontSize: 11,
                fontWeight: 800,
                fontFamily: theme.fonts.display,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {tab === 'overview' ? '📊 Overview' : tab === 'iocs' ? '🔍 IOCs' : '🕸️ Visualizer'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── CONTENT AREA ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 24, zIndex: 10 }}>
        {activeTab === 'overview' && (
          <OverviewTab
            data={data}
            killChainMap={killChainMap}
            classifiedIndicators={classifiedIndicators}
            setSelectedObject={setSelectedObject}
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
            totalCount={data.indicators.length}
            setSelectedObject={setSelectedObject}
          />
        )}
        {activeTab === 'visualizer' && (
          <VisualizerTab data={data} setSelectedObject={setSelectedObject} />
        )}
      </div>

      {/* ─── INTELLIGENCE DETAIL PANEL ─────────────────────────────────── */}
      <DetailPanel
        object={selectedObject}
        onClose={() => setSelectedObject(null)}
        objectMap={data.objectMap}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETAIL PANEL (Slide-in Deep Dive)
// ═══════════════════════════════════════════════════════════════════════════════
function DetailPanel({ object, onClose, objectMap }: {
  object: StixObject | null;
  onClose: () => void;
  objectMap: Map<string, StixObject>;
}) {
  const isOpen = !!object;

  const relatedObjects = useMemo(() => {
    if (!object) return [];
    const related: StixObject[] = [];

    // Find objects referenced in object_refs
    if (Array.isArray(object.object_refs)) {
      for (const ref of object.object_refs) {
        const tgt = objectMap.get(ref);
        if (tgt) related.push(tgt);
      }
    }

    return related;
  }, [object, objectMap]);

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.4s',
          zIndex: 3000,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 550,
          background: 'rgba(7, 13, 23, 0.95)',
          backdropFilter: 'blur(30px)',
          borderLeft: '1px solid rgba(0, 209, 255, 0.2)',
          boxShadow: '-20px 0 50px rgba(0,0,0,0.8)',
          transform: `translateX(${isOpen ? 0 : 100}%)`,
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 3100,
          display: 'flex', flexDirection: 'column',
          padding: 40,
        }}
      >
        {object && (
          <>
            {/* Header */}
            <div style={{ marginBottom: 30 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: STIX_COLORS[object.type] || '#fff',
                  padding: '4px 12px', background: `${STIX_COLORS[object.type] || '#fff'}15`,
                  border: `1px solid ${STIX_COLORS[object.type] || '#fff'}30`,
                  borderRadius: 100, textTransform: 'uppercase', letterSpacing: 2
                }}>
                  {object.type.replace('-', ' ')}
                </span>
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer',
                    opacity: 0.5, transition: 'opacity 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.opacity = '1'}
                  onMouseOut={e => e.currentTarget.style.opacity = '0.5'}
                >
                  ✕
                </button>
              </div>
              <h1 style={{
                fontSize: 28, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2,
                fontFamily: theme.fonts.display, letterSpacing: 1
              }}>
                {object.name || object.id.split('--')[0]}
              </h1>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflow: 'auto', paddingRight: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
                {/* Description */}
                <div>
                  <h4 style={{
                    fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase',
                    letterSpacing: 2, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)',
                    paddingBottom: 8
                  }}>
                    Intelligence Definition
                  </h4>
                  <p style={{
                    fontSize: 14, lineHeight: 1.7, color: theme.colors.textSecondary,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {String(object.description || "No detailed description provided for this intelligence artifact.").replace(/\\n/g, '\n').replace(/\\u2019/g, "'")}
                  </p>
                </div>

                {/* Indicators / Patterns */}
                {object.pattern && (
                  <div>
                    <h4 style={{
                      fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase',
                      letterSpacing: 2, marginBottom: 12
                    }}>
                      Pattern Match
                    </h4>
                    <div style={{
                      padding: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 8,
                      fontFamily: theme.fonts.mono, fontSize: 13, color: '#00D1FF',
                      border: '1px solid rgba(0, 209, 255, 0.1)'
                    }}>
                      {object.pattern}
                    </div>
                  </div>
                )}

                {/* External References */}
                {object.external_references && object.external_references.length > 0 && (
                  <div>
                    <h4 style={{
                      fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase',
                      letterSpacing: 2, marginBottom: 12
                    }}>
                      External References
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {object.external_references.map((ref, i) => (
                        <a
                          key={i}
                          href={ref.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '12px 16px', background: 'rgba(255,255,255,0.03)',
                            borderRadius: 8, textDecoration: 'none', transition: 'background 0.2s'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                          onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        >
                          <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{ref.source_name}</span>
                          <span style={{ fontSize: 11, color: '#00D1FF', fontFamily: theme.fonts.mono }}>{ref.external_id || 'View Report'}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Relationships */}
                {relatedObjects.length > 0 && (
                  <div>
                    <h4 style={{
                      fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase',
                      letterSpacing: 2, marginBottom: 12
                    }}>
                      Related Intelligence
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                      {relatedObjects.map(rel => (
                        <div
                          key={rel.id}
                          style={{
                            padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                            borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', gap: 12
                          }}
                        >
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: STIX_COLORS[rel.type] || '#fff'
                          }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: theme.colors.textDim, textTransform: 'uppercase' }}>{rel.type}</div>
                            <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{rel.name || rel.id.split('--')[0]}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div style={{
                  marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: theme.colors.textDim }}>SPEC VERSION</span>
                    <span style={{ fontSize: 10, color: theme.colors.textSecondary, fontFamily: theme.fonts.mono }}>{object.spec_version || '2.1'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: theme.colors.textDim }}>ID VERSION</span>
                    <span style={{ fontSize: 10, color: theme.colors.textSecondary, fontFamily: theme.fonts.mono }}>{object.id.split('--')[1]}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: theme.colors.textDim }}>DATE MODIFIED</span>
                    <span style={{ fontSize: 10, color: theme.colors.textSecondary }}>{object.modified ? new Date(object.modified).toLocaleDateString() : 'Unknown'}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ data, killChainMap, classifiedIndicators, setSelectedObject }: {
  data: ParsedStixData;
  killChainMap: Record<string, StixObject[]>;
  classifiedIndicators: (StixObject & { classified: { type: string; value: string; icon: string } })[];
  setSelectedObject: (o: StixObject) => void;
}) {
  const iocTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of classifiedIndicators) {
      const t = i.classified.type;
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [classifiedIndicators]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: 1, minHeight: 0 }}>
      {/* ─── KPI ROW ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, flexShrink: 0
      }}>
        <KPICard
          label="THREAT REPORTS" value={data.reports.length} icon="📋" color="#8B5CF6"
          subtitle="CISA / NCSC-NO VERIFIED" delay="0.3s"
        />
        <KPICard
          label="MITRE TTPs" value={data.attackPatterns.length} icon="⚔️" color={theme.colors.exploit}
          subtitle="IDENTIFIED TECHNIQUES" delay="0.4s"
        />
        <KPICard
          label="ACTIVE IOCs" value={data.indicators.length} icon="🎯" color={theme.colors.malware}
          subtitle={Object.entries(iocTypeCounts).slice(0, 3).map(([t, c]) => `${c} ${t}`).join(' · ')} delay="0.5s"
        />
        <KPICard
          label="COVERAGE" value={`${Object.keys(killChainMap).filter(k => k !== 'unknown').length}/${KILL_CHAIN_PHASES.length}`}
          icon="🔗" color="#06B6D4" subtitle="PHASES MAPPED" delay="0.6s"
        />
      </div>

      {/* ─── KILL CHAIN ───────────────────────────────────────────────── */}
      <div className="entrance-anim" style={{ animationDelay: '0.7s' }}>
        <GlassPanel className="cyber-panel-border" style={{ flexShrink: 0, padding: '24px 30px' }}>
          <div style={{
            fontSize: 11, fontFamily: theme.fonts.display, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: 2.5, color: '#00D1FF',
            marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#00D1FF', boxShadow: '0 0 10px #00D1FF' }} />
            STRATEGIC KILL CHAIN MAPPING
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${KILL_CHAIN_PHASES.length}, 1fr)`, gap: 6,
          }}>
            {KILL_CHAIN_PHASES.map((phase) => {
              const techniques = killChainMap[phase.id] || [];
              const isActive = techniques.length > 0;
              return (
                <div
                  key={phase.id}
                  style={{
                    position: 'relative', padding: '16px 8px', borderRadius: 4,
                    background: isActive ? `linear-gradient(180deg, ${phase.color}15, rgba(0,0,0,0.2))` : 'rgba(255,255,255,0.01)',
                    border: isActive ? `1px solid ${phase.color}40` : '1px solid rgba(255,255,255,0.02)',
                    textAlign: 'center', transition: 'all 0.4s', cursor: isActive ? 'pointer' : 'default',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (isActive) e.currentTarget.style.borderColor = phase.color; }}
                  onMouseLeave={e => { if (isActive) e.currentTarget.style.borderColor = `${phase.color}40`; }}
                >
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: phase.color,
                      boxShadow: `0 0 10px ${phase.color}`
                    }} />
                  )}
                  <div style={{
                    fontSize: 22, fontWeight: 900, fontFamily: theme.fonts.display,
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.05)', marginBottom: 4,
                  }}>
                    {techniques.length || '0'}
                  </div>
                  <div style={{
                    fontSize: 8, fontWeight: 800, fontFamily: theme.fonts.display,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    color: isActive ? phase.color : 'rgba(255,255,255,0.1)', lineHeight: 1.3,
                  }}>
                    {phase.label}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </div>

      {/* ─── MAIN GRID ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24, flex: 1, minHeight: 0 }}>
        {/* Reports Side */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div className="entrance-anim" style={{
            fontSize: 10, fontWeight: 900, fontFamily: theme.fonts.display,
            textTransform: 'uppercase', letterSpacing: 2.5, color: theme.colors.textDim,
            display: 'flex', alignItems: 'center', gap: 10, animationDelay: '0.8s'
          }}>
            <div style={{ width: 8, height: 2, background: theme.colors.exploit }} />
            INTEL ADVISORIES
          </div>
          <div className="entrance-anim" style={{
            display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto',
            animationDelay: '0.9s', flex: 1, paddingRight: 4
          }}>
            {data.reports.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                onClick={() => setSelectedObject(report)}
                attackCount={report.object_refs?.filter(r => r.startsWith('attack-pattern')).length || 0}
                indicatorCount={report.object_refs?.filter(r => r.startsWith('indicator')).length || 0}
              />
            ))}
          </div>
        </div>

        {/* Attacks Side */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div className="entrance-anim" style={{
            fontSize: 10, fontWeight: 900, fontFamily: theme.fonts.display,
            textTransform: 'uppercase', letterSpacing: 2.5, color: theme.colors.textDim,
            display: 'flex', alignItems: 'center', gap: 10, animationDelay: '1.0s'
          }}>
            <div style={{ width: 8, height: 2, background: theme.colors.malware }} />
            TACTICAL OVERVIEW ({data.attackPatterns.length} TTPs)
          </div>
          <div className="entrance-anim" style={{ animationDelay: '1.1s', flex: 1, overflow: 'hidden' }}>
            <GlassPanel className="cyber-panel-border" style={{ height: '100%', padding: 24, overflow: 'auto' }}>
              {KILL_CHAIN_PHASES.map(phase => {
                const techniques = killChainMap[phase.id];
                if (!techniques || techniques.length === 0) return null;
                return (
                  <div key={phase.id} style={{ marginBottom: 24 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2,
                      color: phase.color, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: phase.color }} />
                      {phase.label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                      {techniques.map(tech => (
                        <div
                          key={tech.id}
                          onClick={() => setSelectedObject(tech)}
                          className="cyan-glow-border"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 16px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            transition: 'all 0.3s', cursor: 'pointer'
                          }}
                        >
                          <span style={{ fontSize: 13, color: '#eee', fontWeight: 500 }}>{tech.name}</span>
                          <span style={{
                            fontSize: 10, fontFamily: theme.fonts.mono, color: phase.color,
                            background: `${phase.color}15`, padding: '2px 8px', borderRadius: 4,
                            fontWeight: 700
                          }}>
                            {tech.external_references?.find(r => r.source_name === 'mitre-attack')?.external_id || 'TTP'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </GlassPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// IOC TAB
// ═══════════════════════════════════════════════════════════════════════════════
function IOCTab({ filteredIOCs, iocFilter, setIocFilter, iocTypeFilter, setIocTypeFilter, iocTypes, setSelectedObject }: {
  filteredIOCs: (StixObject & { classified: { type: string; value: string; icon: string } })[];
  iocFilter: string;
  setIocFilter: (v: string) => void;
  iocTypeFilter: string;
  setIocTypeFilter: (v: string) => void;
  iocTypes: string[];
  totalCount?: number;
  setSelectedObject: (o: StixObject) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, minHeight: 0 }}>
      <div className="entrance-anim" style={{ display: 'flex', gap: 20, alignItems: 'center', animationDelay: '0.3s' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="Search Intelligence Indicators..."
            value={iocFilter}
            onChange={e => setIocFilter(e.target.value)}
            style={{
              width: '100%', padding: '14px 20px 14px 50px',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, color: '#fff', fontSize: 14, fontFamily: theme.fonts.body,
              outline: 'none', transition: 'all 0.3s',
            }}
            onFocus={e => { e.target.style.borderColor = '#00D1FF'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.background = 'rgba(255,255,255,0.03)'; }}
          />
          <span style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.4 }}>🔍</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {iocTypes.map(type => (
            <button
              key={type}
              onClick={() => setIocTypeFilter(type)}
              style={{
                padding: '10px 16px', borderRadius: 8,
                background: iocTypeFilter === type ? 'rgba(0, 209, 255, 0.15)' : 'rgba(255,255,255,0.02)',
                border: iocTypeFilter === type ? '1px solid #00D1FF' : '1px solid rgba(255,255,255,0.05)',
                color: iocTypeFilter === type ? '#fff' : theme.colors.textDim,
                fontSize: 10, fontWeight: 800, fontFamily: theme.fonts.display,
                textTransform: 'uppercase', letterSpacing: 1.5, cursor: 'pointer', transition: 'all 0.3s'
              }}
            >
              {type === 'all' ? `All Items` : type}
            </button>
          ))}
        </div>
      </div>

      <div className="entrance-anim" style={{ flex: 1, animationDelay: '0.4s', overflow: 'hidden' }}>
        <GlassPanel className="cyber-panel-border" style={{ height: '100%', padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'rgba(10, 20, 30, 0.95)', zIndex: 10 }}>
              <tr>
                {['', 'Indicator Type', 'Information Value', 'Validation Date'].map(h => (
                  <th key={h} style={{
                    padding: '20px 24px', fontSize: 10, fontWeight: 900, color: theme.colors.textDim,
                    textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid rgba(255,255,255,0.05)'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredIOCs.map((ioc) => (
                <tr
                  key={ioc.id}
                  onClick={() => setSelectedObject(ioc)}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.02)',
                    transition: 'all 0.2s', cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 209, 255, 0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '16px 24px', fontSize: 18 }}>{ioc.classified.icon}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 4,
                      background: `${getIOCColor(ioc.classified.type)}15`,
                      border: `1px solid ${getIOCColor(ioc.classified.type)}30`,
                      color: getIOCColor(ioc.classified.type), textTransform: 'uppercase'
                    }}>
                      {ioc.classified.type}
                    </span>
                  </td>
                  <td style={{
                    padding: '16px 24px', fontFamily: theme.fonts.mono, fontSize: 13, color: '#fff'
                  }}>{ioc.classified.value}</td>
                  <td style={{
                    padding: '16px 24px', fontSize: 11, color: theme.colors.textDim, fontFamily: theme.fonts.mono
                  }}>
                    {ioc.valid_from ? new Date(ioc.valid_from).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUALIZER TAB (Friend's Advanced Version)
// ═══════════════════════════════════════════════════════════════════════════════
function VisualizerTab({ data, setSelectedObject }: { data: ParsedStixData; setSelectedObject: (o: StixObject) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const [hoverNode, setHoverNode] = useState<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const resize = () => {
      setDim({
        w: containerRef.current!.clientWidth,
        h: containerRef.current!.clientHeight
      });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const graphData = useMemo(() => {
    const nodes = data.allObjects
      .filter(o => o.type !== 'relationship' && o.type !== 'marking-definition')
      .map(o => ({
        id: o.id,
        name: o.name || o.id.split('--')[0],
        type: o.type,
        color: STIX_COLORS[o.type] || '#888',
        stix: o
      }));

    const links = data.relationships
      .filter(r => r.source_ref && r.target_ref)
      .map(r => ({
        source: r.source_ref,
        target: r.target_ref,
        label: r.relationship_type,
        stix: r
      }));

    return { nodes, links };
  }, [data]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { x, y, color, type, name } = node;
    const r = 10;
    const isHovered = hoverNode === node;

    // Pulse effect for critical nodes (threat actors, campaigns)
    if (type === 'threat-actor' || type === 'campaign' || type === 'report' || isHovered) {
      const now = Date.now();
      const pulseT = (now % 2000) / 2000;
      const pulseR = r + (pulseT * 15);
      ctx.beginPath();
      ctx.arc(x, y, pulseR, 0, 2 * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * (1 - pulseT) / globalScale;
      ctx.globalAlpha = (1 - pulseT) * 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Main Circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    if (isHovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Icon (Simplified Friend's Logic)
    ctx.strokeStyle = '#050B14';
    ctx.lineWidth = 1.5;
    const iconR = r * 0.5;
    ctx.beginPath();
    if (type === 'report' || type === 'threat-actor') {
      ctx.arc(x, y, iconR, 0, 2 * Math.PI);
      ctx.moveTo(x - iconR, y); ctx.lineTo(x + iconR, y);
      ctx.moveTo(x, y - iconR); ctx.lineTo(x, y + iconR);
    } else if (type === 'indicator') {
      ctx.rect(x - iconR, y - iconR, iconR * 2, iconR * 2);
    } else {
      const a = 2 * Math.PI / 6;
      for (let i = 0; i <= 6; i++) ctx.lineTo(x + iconR * Math.cos(a * i), y + iconR * Math.sin(a * i));
    }
    ctx.stroke();

    // Label
    if (globalScale > 0.8 || isHovered) {
      ctx.font = `bold ${10 / globalScale}px Inter, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(name, x, y + r + 10 / globalScale);
    }
  }, [hoverNode]);

  return (
    <div className="entrance-anim" style={{ flex: 1, animationDelay: '0.3s', display: 'flex' }}>
      <div
        ref={containerRef}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 12,
          border: '1px solid rgba(0, 209, 255, 0.2)', background: 'rgba(0,0,0,0.4)',
        }}
      >
        <ForceGraph2D
          width={dim.w}
          height={dim.h}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => 'replace'}
          onNodeClick={(node: any) => setSelectedObject(node.stix)}
          onNodeHover={setHoverNode}
          linkColor={() => 'rgba(0, 209, 255, 0.15)'}
          linkWidth={1}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleColor={() => '#00D1FF'}
          cooldownTicks={100}
        />
        <div style={{
          position: 'absolute', bottom: 20, right: 20,
          fontSize: 10, color: '#00D1FF', fontFamily: theme.fonts.mono,
          padding: '8px 16px', background: 'rgba(0,0,0,0.6)', borderRadius: 8,
          border: '1px solid rgba(0, 209, 255, 0.2)', pointerEvents: 'none'
        }}>
          SCROLL TO ZOOM · DRAG NODES TO ORGANIZE
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function KPICard({ label, value, icon, color, subtitle, delay }: {
  label: string; value: number | string; icon: string; color: string; subtitle?: string; delay: string;
}) {
  return (
    <div className="entrance-anim" style={{ animationDelay: delay }}>
      <GlassPanel className="cyber-panel-border" style={{
        padding: '24px 28px',
        background: `linear-gradient(135deg, ${color}10, rgba(0,0,0,0.4))`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 900, fontFamily: theme.fonts.display,
              textTransform: 'uppercase', letterSpacing: 2, color: theme.colors.textDim, marginBottom: 8
            }}>{label}</div>
            <div style={{
              fontSize: 42, fontWeight: 900, fontFamily: theme.fonts.display, color, lineHeight: 1,
            }}>{value}</div>
            {subtitle && (
              <div style={{
                fontSize: 9, color: theme.colors.textDim, marginTop: 10, fontFamily: theme.fonts.mono,
                letterSpacing: 0.5, fontWeight: 700
              }}>{subtitle}</div>
            )}
          </div>
          <span style={{ fontSize: 32, opacity: 0.3 }}>{icon}</span>
        </div>
      </GlassPanel>
    </div>
  );
}

function ReportCard({ report, onClick, attackCount, indicatorCount }: {
  report: StixObject; onClick: () => void; attackCount: number; indicatorCount: number;
}) {
  const accentColor = report.name?.includes('Ivanti') ? '#8B5CF6' : '#EF4444';
  const cves = report.description?.match(/CVE-\d{4}-\d{4,7}/g) || [];
  const uniqueCves = [...new Set(cves)];

  return (
    <div
      onClick={onClick}
      className="cyan-glow-border"
      style={{
        cursor: 'pointer', padding: 24, borderRadius: 12,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
        transition: 'all 0.3s', position: 'relative', overflow: 'hidden'
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: accentColor }} />
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: `${accentColor}15`, border: `1px solid ${accentColor}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
        }}>
          {report.name?.includes('Ivanti') ? '🐛' : '🛡️'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.4, marginBottom: 4 }}>{report.name}</div>
          <div style={{ fontSize: 10, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>
            PUBLISHED: {report.published ? new Date(report.published).toLocaleDateString() : 'N/A'}
          </div>
        </div>
      </div>

      {uniqueCves.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {uniqueCves.map(cve => (
            <span key={cve} style={{
              fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444', fontFamily: theme.fonts.mono
            }}>{cve}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: theme.colors.textDim, fontWeight: 800 }}>ATTACKS</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: theme.colors.exploit, fontFamily: theme.fonts.mono }}>{attackCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: theme.colors.textDim, fontWeight: 800 }}>IOCS</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: theme.colors.malware, fontFamily: theme.fonts.mono }}>{indicatorCount}</span>
        </div>
      </div>
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
