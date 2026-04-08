import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { sampleStixData } from '../data/sampleStixData';
import { theme } from '../theme/theme';
import { GlassPanel } from './GlassPanel';

// STIX Type Color Mappings
const STIX_COLORS: Record<string, string> = {
  'threat-actor': '#ef4444', // Red
  'malware': '#f97316', // Orange
  'tool': '#eab308', // Yellow
  'vulnerability': '#a855f7', // Purple
  'attack-pattern': '#10b981', // Green
  'identity': '#3b82f6', // Blue
  'indicator': '#ec4899', // Pink
  'campaign': '#06b6d4', // Cyan
};

export function StixVisualizerPage() {
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight - 64 });
  const [hoverNode, setHoverNode] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [, setHoverLink] = useState<any>(null);

  // Resize listener
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight - 64 });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Adjust physics forces after mount
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('link')?.distance(80);
      fgRef.current.d3Force('charge')?.strength(-300);
    }
  }, []);

  // Process STIX 2.1 data into Nodes/Links
  const graphData = useMemo(() => {
    // 1. Map STIX objects (excluding relationships) to nodes
    const nodes = sampleStixData.objects
      .filter((obj: any) => obj.type !== 'relationship')
      .map((obj: any) => {
        // Node size emphasis logic previously here was converted to geometric classes

        return {
          id: obj.id,
          name: obj.name || obj.type,
          type: obj.type,
          color: STIX_COLORS[obj.type] || '#888888',
          stix: obj
        };
      });

    // 2. Map STIX relationships to links
    const links = sampleStixData.objects
      .filter((obj: any) => obj.type === 'relationship')
      .map((obj: any) => ({
        source: obj.source_ref,
        target: obj.target_ref,
        label: obj.relationship_type.replace(/-/g, '_'),
        stix: obj
      }));

    return { nodes, links };
  }, []);

  const stats = useMemo(() => {
    const s: Record<string, number> = {};
    graphData.nodes.forEach(n => {
      s[n.type] = (s[n.type] || 0) + 1;
    });
    return s;
  }, [graphData]);

  // Robust link ID resolver
  const getLinkId = (linkEndpoint: any) => typeof linkEndpoint === 'object' ? linkEndpoint.id : linkEndpoint;

  // Paint nodes
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { x, y, color, name, type } = node;
    const isHovered = hoverNode === node;
    const isSelected = selectedNode === node;
    const activeFocusNode = selectedNode || hoverNode;
    
    const isLinked = activeFocusNode && (
        graphData.links.some((l: any) => 
            (getLinkId(l.source) === activeFocusNode.id && getLinkId(l.target) === node.id) || 
            (getLinkId(l.target) === activeFocusNode.id && getLinkId(l.source) === node.id))
    );

    const opacity = activeFocusNode ? (isSelected || isHovered || isLinked ? 1 : 0.1) : 1;
    const r = 10; // Uniform sizes matching OpenCTI

    // Pulsing Animation (Continuous for critical threats or selected node)
    ctx.globalAlpha = 1;
    const isCritical = type === 'threat-actor' || type === 'campaign' || isSelected;
    if (isCritical) {
       const now = Date.now();
       const pulseT = (now % 2500) / 2500; // 0 to 1 over 2.5s
       const pulseR = r + (pulseT * 25); // Expands up to 25px out
       const pulseOpacity = (1 - pulseT) * opacity * 0.8;
       
       ctx.beginPath();
       ctx.arc(x, y, pulseR, 0, 2 * Math.PI, false);
       ctx.strokeStyle = color;
       ctx.lineWidth = 3 * (1 - pulseT) / globalScale;
       ctx.globalAlpha = pulseOpacity;
       ctx.stroke();
    }

    // Draw Node Selection Ring
    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, 2 * Math.PI, false);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Draw Main Circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.fill();
    
    // Draw Inner Dark Icon (OpenCTI geometric shapes)
    ctx.strokeStyle = '#0B1425';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const iconR = r * 0.45;
    
    if (type === 'campaign' || type === 'threat-actor') {
      // Crosshair
      ctx.arc(x, y, iconR, 0, 2 * Math.PI);
      ctx.moveTo(x, y - iconR * 1.5); ctx.lineTo(x, y - iconR * 0.5);
      ctx.moveTo(x, y + iconR * 1.5); ctx.lineTo(x, y + iconR * 0.5);
      ctx.moveTo(x - iconR * 1.5, y); ctx.lineTo(x - iconR * 0.5, y);
      ctx.moveTo(x + iconR * 1.5, y); ctx.lineTo(x + iconR * 0.5, y);
    } else if (type === 'identity' || type === 'vulnerability') {
       // Shield
       ctx.moveTo(x - iconR, y - iconR);
       ctx.lineTo(x + iconR, y - iconR);
       ctx.lineTo(x + iconR, y + iconR*0.2);
       ctx.lineTo(x, y + iconR*1.2);
       ctx.lineTo(x - iconR, y + iconR*0.2);
       ctx.closePath();
    } else {
       // Hexagon (Default Observable)
       const a = 2 * Math.PI / 6;
       for (let i = 0; i <= 6; i++) {
         ctx.lineTo(x + iconR * Math.cos(a * i), y + iconR * Math.sin(a * i));
       }
    }
    ctx.stroke();

    // Draw Label (bottom aligned)
    if (globalScale > 0.8 || isHovered || isSelected || isLinked) {
      const fontSize = 11 / globalScale;
      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = (isSelected || isHovered) ? '#ffffff' : 'rgba(255,255,255,0.7)';
      ctx.fillText(name, x, y + r + 3 / globalScale);
    }
    
    ctx.globalAlpha = 1;
  }, [hoverNode, selectedNode, graphData.links]);

  return (
    <div style={{ 
      position: 'relative', width: '100%', height: '100%', 
      background: 'radial-gradient(circle at center, #0B1425 0%, #03060C 100%)', 
      overflow: 'hidden' 
    }}>
      
      {/* Background Grid Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
        pointerEvents: 'none'
      }} />

      {/* 2D Canvas Force Graph */}
      <div 
        style={{ position: 'absolute', inset: 0, cursor: hoverNode ? 'pointer' : 'grab' }}
        onClick={() => {
          // Native DOM click handler perfectly bypasses internal ForceGraph physics swallows!
          if (hoverNode) {
            setSelectedNode(hoverNode);
          } else {
            // Only clear selection if clicking explicitly on the raw background
            setSelectedNode(null);
          }
        }}
      >
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel={() => ''}
          nodeColor={(node: any) => node.color}
          nodeRelSize={10}
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => 'replace'}
          onNodeHover={setHoverNode}
          onNodeDrag={(node: any) => setSelectedNode(node)}
          onNodeDragEnd={(node: any) => setSelectedNode(node)}
          onLinkHover={setHoverLink}
          linkCurvature={0}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale) => {
            const start = link.source;
            const end = link.target;
            if (typeof start !== 'object' || typeof end !== 'object') return;
            const textPos = {
              x: start.x + (end.x - start.x) / 2,
              y: start.y + (end.y - start.y) / 2
            };
            const relLink = { x: end.x - start.x, y: end.y - start.y };
            let textAngle = Math.atan2(relLink.y, relLink.x);
            if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
            if (textAngle < -Math.PI / 2) textAngle = -(Math.PI + textAngle);

            const label = link.label.toLowerCase();
            const fontSize = Math.max(3, 10 / globalScale);
            // Hide text if zoomed out unless focused
            if (globalScale < 0.8 && hoverNode?.id !== start.id && hoverNode?.id !== end.id) return;

            ctx.font = `500 ${fontSize}px Inter, sans-serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

            ctx.save();
            ctx.translate(textPos.x, textPos.y);
            ctx.rotate(textAngle);
            // Exactly match canvas background to cut out the line
            ctx.fillStyle = '#080E18'; 
            ctx.fillRect(-bckgDimensions[0] / 2, -bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const activeFocus = selectedNode || hoverNode;
            const isHovered = activeFocus && (start.id === activeFocus.id || end.id === activeFocus.id);
            ctx.fillStyle = isHovered ? '#60a5fa' : '#3b82f6';
            ctx.fillText(label, 0, 0);
            ctx.restore();
          }}
          linkColor={(link: any) => {
             const activeFocus = selectedNode || hoverNode;
             const isHovered = activeFocus && (getLinkId(link.source) === activeFocus.id || getLinkId(link.target) === activeFocus.id);
             return isHovered ? '#60a5fa' : '#1e3a8a';
          }}
          linkWidth={(link: any) => {
            const activeFocus = selectedNode || hoverNode;
            const isHovered = activeFocus && (getLinkId(link.source) === activeFocus.id || getLinkId(link.target) === activeFocus.id);
            return isHovered ? 2 : 1;
          }}
          linkDirectionalParticles={(link: any) => {
            const activeFocus = selectedNode || hoverNode;
            const isHovered = activeFocus && (getLinkId(link.source) === activeFocus.id || getLinkId(link.target) === activeFocus.id);
            return isHovered ? 6 : 3;
          }}
          linkDirectionalParticleWidth={(link: any) => {
            const activeFocus = selectedNode || hoverNode;
            const isHovered = activeFocus && (getLinkId(link.source) === activeFocus.id || getLinkId(link.target) === activeFocus.id);
            return isHovered ? 4 : 2;
          }}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={(link: any) => {
            const activeFocus = selectedNode || hoverNode;
            const isHovered = activeFocus && (getLinkId(link.source) === activeFocus.id || getLinkId(link.target) === activeFocus.id);
            // Particles glow brightly on focused links
            return isHovered ? '#00e0ff' : 'rgba(0, 224, 255, 0.5)';
          }}
          cooldownTicks={100}
          onEngineStop={() => {
            if (fgRef.current) {
               fgRef.current.zoomToFit(400, 100);
            }
          }}
        />
      </div>

      {/* Floating UI Elements */}
      
      {/* Top Left Title */}
      <div style={{ position: 'absolute', top: 32, left: 32, zIndex: 10, pointerEvents: 'none' }}>
        <h2 style={{ fontSize: 24, margin: 0, fontFamily: theme.fonts.display, color: '#fff', letterSpacing: 2 }}>
          STIX THREAT GRAPH
        </h2>
        <p style={{ color: theme.colors.textDim, fontSize: 12, marginTop: 4, fontFamily: theme.fonts.mono }}>
          CISA AA26-097A • IRGC CyberAv3ngers Campaign
        </p>
      </div>

      {/* Interactive Sidebar (Node Details) */}
      <div style={{
        position: 'absolute',
        top: 100,
        left: 32,
        width: 340,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        {/* Statistics Panel */}
        <GlassPanel style={{ padding: '20px', background: 'rgba(5, 11, 20, 0.6)', pointerEvents: 'auto', backdropFilter: 'blur(10px)' }}>
          <div style={{ fontSize: 10, fontFamily: theme.fonts.display, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            Network Composition
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Object.entries(stats).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STIX_COLORS[type] || '#fff', boxShadow: `0 0 6px ${STIX_COLORS[type] || '#fff'}` }} />
                <span style={{ fontSize: 11, color: theme.colors.textSecondary, textTransform: 'capitalize' }}>{type.replace('-', ' ')}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: theme.fonts.mono, color: '#fff', fontWeight: 700 }}>{count}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Selection Hint */}
        {!selectedNode && (
          <GlassPanel style={{ padding: '24px', background: 'rgba(5, 11, 20, 0.4)', textAlign: 'center', pointerEvents: 'auto', backdropFilter: 'blur(10px)' }}>
            <span style={{ fontSize: 12, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>
               Click on any node to analyze intelligence data.
            </span>
          </GlassPanel>
        )}

        {/* Selected Element Intelligence Card */}
        <div style={{
          transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          opacity: selectedNode ? 1 : 0,
          transform: `translateY(${selectedNode ? 0 : 30}px) scale(${selectedNode ? 1 : 0.95})`,
          pointerEvents: selectedNode ? 'auto' : 'none'
        }}>
          {selectedNode && (
            <GlassPanel style={{ 
              padding: '24px', 
              borderTop: `3px solid ${STIX_COLORS[selectedNode.type] || '#fff'}`,
              background: `linear-gradient(180deg, ${STIX_COLORS[selectedNode.type] || '#fff'}15 0%, rgba(5, 11, 20, 0.8) 100%)`,
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{
                  fontSize: 10,
                  fontFamily: theme.fonts.display,
                  color: STIX_COLORS[selectedNode.type] || '#fff',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  background: `${STIX_COLORS[selectedNode.type] || '#fff'}22`,
                  padding: '4px 8px',
                  borderRadius: '100px',
                  border: `1px solid ${STIX_COLORS[selectedNode.type] || '#fff'}40`
                }}>
                  {selectedNode.type.replace('-', ' ')}
                </div>
              </div>
              
              <h3 style={{ fontSize: 18, color: '#fff', margin: '0 0 8px 0', lineHeight: 1.3 }}>
                {selectedNode.name}
              </h3>
              
              <p style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 1.5, marginBottom: 16 }}>
                {String(selectedNode.stix.description || "No description provided for this intelligence artifact.")}
              </p>

              {/* STIX Specific Metadata */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                {selectedNode.stix.aliases && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 9, color: theme.colors.textDim, textTransform: 'uppercase' }}>Aliases</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {selectedNode.stix.aliases.map((alias: string) => (
                        <span key={alias} style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4, color: '#eee' }}>{alias}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: theme.colors.textDim, textTransform: 'uppercase' }}>UUID</span>
                    <span style={{ fontSize: 9, fontFamily: theme.fonts.mono, color: theme.colors.textSecondary }}>{selectedNode.id.split('--')[1]}</span>
                </div>
              </div>
              {/* Action Simulation */}
              <div style={{ marginTop: 16 }}>
                <button style={{ 
                  width: '100%', 
                  background: 'transparent',
                  border: `1px solid ${STIX_COLORS[selectedNode.type] || '#fff'}40`,
                  padding: '8px', 
                  borderRadius: '4px',
                  color: STIX_COLORS[selectedNode.type] || '#eee',
                  fontFamily: theme.fonts.display,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e: any) => e.target.style.background = `${STIX_COLORS[selectedNode.type] || '#fff'}20`}
                onMouseOut={(e: any) => e.target.style.background = 'transparent'}
                >
                  Analyze Node Data
                </button>
              </div>
            </GlassPanel>
          )}
        </div>
      </div>
    
      {/* Floating Legend / Background Effects */}
      <div style={{
        position: 'absolute',
        bottom: 32,
        right: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 12
      }}>
         <button 
           onClick={() => fgRef.current?.zoomToFit(800, 100)}
           style={{
             background: 'rgba(0, 224, 255, 0.1)',
             border: `1px solid rgba(0, 224, 255, 0.3)`,
             padding: '8px 16px',
             borderRadius: '100px',
             color: '#fff',
             fontFamily: theme.fonts.display,
             fontSize: 10,
             fontWeight: 700,
             letterSpacing: 1.5,
             cursor: 'pointer',
             pointerEvents: 'auto',
             transition: theme.transitions.fast,
             textTransform: 'uppercase'
           }}
           onMouseOver={e => e.currentTarget.style.background = 'rgba(0, 224, 255, 0.2)'}
           onMouseOut={e => e.currentTarget.style.background = 'rgba(0, 224, 255, 0.1)'}
         >
           Center View
         </button>
         <span style={{ fontSize: 10, color: theme.colors.textDim, textTransform: 'uppercase', letterSpacing: 2, pointerEvents: 'none' }}>
            Scroll to zoom • Drag to pan
         </span>
      </div>

    </div>
  );
}
