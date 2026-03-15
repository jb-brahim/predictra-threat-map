import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { CountryOutlines } from './CountryOutlines';

// --- Helpers ---

function decodeTopology(topology: any): number[][][] {
  const { arcs: topoArcs, transform } = topology;
  const { scale, translate } = transform || { scale: [1, 1], translate: [0, 0] };
  return topoArcs.map((arc: number[][]) => {
    let x = 0, y = 0;
    return arc.map((point: number[]) => {
      x += point[0]; y += point[1];
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function resolveArcs(arcIndices: any, decodedArcs: any) {
  const coords: any[] = [];
  const flatIndices = Array.isArray(arcIndices[0]) ? arcIndices[0] : arcIndices;
  for (const idx of flatIndices) {
    const arcIdx = idx < 0 ? ~idx : idx;
    const arc = decodedArcs[arcIdx];
    if (!arc) continue;
    const points = idx < 0 ? [...arc].reverse() : arc;
    for (let i = coords.length > 0 ? 1 : 0; i < points.length; i++) coords.push(points[i]);
  }
  return coords;
}

function isPointInPolygon(point: number[], vs: number[][]) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// --- Sub-components ---

function GridLines() {
  const projectionMode = useStreamStore(s => s.projectionMode);
  const linesGeo = useMemo(() => {
    const points: THREE.Vector3[] = [];
    if (projectionMode === '3d') {
      const radius = 1.002;
      for (let lat = -60; lat <= 60; lat += 30) {
        const phi = (90 - lat) * (Math.PI / 180);
        for (let lon = 0; lon <= 360; lon += 2) {
          const theta = lon * (Math.PI / 180);
          points.push(new THREE.Vector3(-(radius * Math.sin(phi) * Math.cos(theta)), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)));
        }
      }
      for (let lon = 0; lon < 360; lon += 30) {
        const theta = lon * (Math.PI / 180);
        for (let lat = -90; lat <= 90; lat += 2) {
          const phi = (90 - lat) * (Math.PI / 180);
          points.push(new THREE.Vector3(-(radius * Math.sin(phi) * Math.cos(theta)), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)));
        }
      }
    } else {
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = (lat / 90) * 1.25;
        points.push(new THREE.Vector3(-2.5, y, 0.01), new THREE.Vector3(2.5, y, 0.01));
      }
      for (let lon = -150; lon <= 150; lon += 30) {
        const x = (lon / 180) * 2.5;
        points.push(new THREE.Vector3(x, -1.25, 0.01), new THREE.Vector3(x, 1.25, 0.01));
      }
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [projectionMode]);

  if (projectionMode === '3d') {
    return (
      <points>
        <primitive object={linesGeo} attach="geometry" />
        <pointsMaterial color="#00B4FF" size={0.003} transparent opacity={0.15} depthWrite={false} sizeAttenuation />
      </points>
    );
  }
  return (
    <lineSegments geometry={linesGeo}>
      <lineBasicMaterial color="#00B4FF" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
    </lineSegments>
  );
}

function HUDBrackets() {
  const color = "#00D1FF";
  const size = 0.3;
  const thickness = 0.02;
  const gap = 2.5;
  const vGap = 1.25;

  return (
    <group position={[0, 0, 0.02]}>
      {/* Corner Brackets */}
      <group position={[-gap, vGap, 0]}>
        <mesh position={[size/2, 0, 0]}><boxGeometry args={[size, thickness, thickness]} /><meshBasicMaterial color={color} /></mesh>
        <mesh position={[0, -size/2, 0]}><boxGeometry args={[thickness, size, thickness]} /><meshBasicMaterial color={color} /></mesh>
      </group>
      <group position={[gap, vGap, 0]}>
        <mesh position={[-size/2, 0, 0]}><boxGeometry args={[size, thickness, thickness]} /><meshBasicMaterial color={color} /></mesh>
        <mesh position={[0, -size/2, 0]}><boxGeometry args={[thickness, size, thickness]} /><meshBasicMaterial color={color} /></mesh>
      </group>
      <group position={[-gap, -vGap, 0]}>
        <mesh position={[size/2, 0, 0]}><boxGeometry args={[size, thickness, thickness]} /><meshBasicMaterial color={color} /></mesh>
        <mesh position={[0, size/2, 0]}><boxGeometry args={[thickness, size, thickness]} /><meshBasicMaterial color={color} /></mesh>
      </group>
      <group position={[gap, -vGap, 0]}>
        <mesh position={[-size/2, 0, 0]}><boxGeometry args={[size, thickness, thickness]} /><meshBasicMaterial color={color} /></mesh>
        <mesh position={[0, size/2, 0]}><boxGeometry args={[thickness, size, thickness]} /><meshBasicMaterial color={color} /></mesh>
      </group>
    </group>
  );
}

function CountryDotGrid() {
  const projectionMode = useStreamStore(s => s.projectionMode);
  const [pointsGeo, setPointsGeo] = useState<THREE.BufferGeometry | null>(null);

  const dotMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x00D1FF) },
        accentColor: { value: new THREE.Color(0x00FF82) },
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (10.0 / -mvPosition.z) * 1.5;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform vec3 accentColor;
        varying vec3 vPosition;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float sweep = fract(vPosition.x * 0.2 - time * 0.15);
          float sweepIntensity = smoothstep(0.95, 1.0, sweep);
          vec3 finalColor = mix(color, accentColor, sweepIntensity * 0.8);
          gl_FragColor = vec4(finalColor, 0.2 + sweepIntensity * 0.4);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.25, // Lowered base opacity
    });
  }, []);

  useFrame(({ clock }) => {
    dotMaterial.uniforms.time.value = clock.getElapsedTime();
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const topology = await res.json();
        const decodedArcs = decodeTopology(topology);
        const geometries = topology.objects.countries?.geometries || [];
        const landPolygons: number[][][] = [];
        for (const geo of geometries) {
          if (geo.type === 'Polygon') landPolygons.push(resolveArcs(geo.arcs, decodedArcs));
          else if (geo.type === 'MultiPolygon') {
            for (const poly of geo.arcs) landPolygons.push(resolveArcs(poly, decodedArcs));
          }
        }
        const points: THREE.Vector3[] = [];
        const resX = 180;
        const resY = 90;
        for (let ix = 0; ix < resX; ix++) {
          const lon = (ix / resX) * 360 - 180;
          for (let iy = 0; iy < resY; iy++) {
            const lat = (iy / resY) * 180 - 90;
            let isLand = false;
            for (const poly of landPolygons) {
              if (isPointInPolygon([lon, lat], poly)) {
                isLand = true;
                break;
              }
            }
            if (isLand) {
              if (projectionMode === '3d') {
                const phi = (90 - lat) * (Math.PI / 180);
                const theta = (lon + 180) * (Math.PI / 180);
                points.push(new THREE.Vector3(-(1.001 * Math.sin(phi) * Math.cos(theta)), 1.001 * Math.cos(phi), 1.001 * Math.sin(phi) * Math.sin(theta)));
              } else {
                points.push(new THREE.Vector3((lon / 180) * 2.5, (lat / 90) * 1.25, 0.006));
              }
            }
          }
        }
        if (active) setPointsGeo(new THREE.BufferGeometry().setFromPoints(points));
      } catch (err) { console.warn('Dots failed:', err); }
    };
    load();
    return () => { active = false; };
  }, [projectionMode]);

  return pointsGeo ? <points geometry={pointsGeo} material={dotMaterial} /> : null;
}

function CountryFills2D() {
  const [meshes, setMeshes] = useState<THREE.Group | null>(null);
  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(res => res.json())
      .then(topology => {
        const decodedArcs = decodeTopology(topology);
        const geometries = topology.objects.countries?.geometries || [];
        const group = new THREE.Group();
        for (const geo of geometries) {
          const polygons = [];
          if (geo.type === 'Polygon') polygons.push(resolveArcs(geo.arcs, decodedArcs));
          else if (geo.type === 'MultiPolygon') {
            for (const poly of geo.arcs) polygons.push(resolveArcs(poly, decodedArcs));
          }
          for (const poly of polygons) {
            const shape = new THREE.Shape();
            for (let i = 0; i < poly.length; i++) {
              const x = (poly[i][0] / 180) * 2.5;
              const y = (poly[i][1] / 90) * 1.25;
              if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
            }
            const geometry = new THREE.ShapeGeometry(shape);
            const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x00A8FF, transparent: true, opacity: 0.03, side: THREE.FrontSide, depthWrite: false }));
            mesh.position.z = 0.002;
            group.add(mesh);
          }
        }
        setMeshes(group);
      });
  }, []);
  return meshes ? <primitive object={meshes} /> : null;
}
export function Earth({ children }: { children?: React.ReactNode }) {
  const meshRef = useRef<THREE.Group>(null);
  const config = useStreamStore(s => s.config);
  const projectionMode = useStreamStore(s => s.projectionMode);
  const [landmask, setLandmask] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    // Generate landmask locally from GeoJSON to avoid CORS/Network issues
    const generateMask = async () => {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const topology = await res.json();
        const decodedArcs = decodeTopology(topology);
        const geometries = topology.objects.countries?.geometries || [];
        
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';

        for (const geo of geometries) {
          const polygons = [];
          if (geo.type === 'Polygon') polygons.push(resolveArcs(geo.arcs, decodedArcs));
          else if (geo.type === 'MultiPolygon') {
            for (const poly of geo.arcs) polygons.push(resolveArcs(poly, decodedArcs));
          }
          for (const poly of polygons) {
            ctx.beginPath();
            for (let i = 0; i < poly.length; i++) {
              const x = ((poly[i][0] + 180) / 360) * canvas.width;
              const y = ((90 - poly[i][1]) / 180) * canvas.height;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.fill();
          }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        setLandmask(tex);
      } catch (err) {
        console.warn('Landmask generation failed:', err);
      }
    };
    generateMask();
  }, []);

  const setSelectedCountry = useStreamStore(s => s.setSelectedCountry);
  const setView = useStreamStore(s => s.setView);

  // Atmospheric glow shader
  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x00A8FF) },
        viewVector: { value: new THREE.Vector3(0, 0, 1) },
      },
      vertexShader: `
        varying float vIntensity;
        void main() {
          vec3 vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec3 vNormel = normalize(-mvPosition.xyz);
          vIntensity = pow(0.7 - dot(vNormal, vNormel), 3.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float vIntensity;
        void main() {
          gl_FragColor = vec4(glowColor, vIntensity * 0.6);
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  // Auto-rotation (only in 3D)
  useFrame((_, delta) => {
    if (config.rotation && meshRef.current && projectionMode === '3d') {
      meshRef.current.rotation.y += delta * 0.05;
    }
  });

  const handlePointerDown = async (e: any) => {
    e.stopPropagation();
    const point = e.point;
    let lat: number, lon: number;

    if (projectionMode === '3d') {
      const vector = new THREE.Vector3().copy(point).normalize();
      lat = Math.asin(vector.y) * (180 / Math.PI);
      lon = Math.atan2(vector.z, -vector.x) * (180 / Math.PI);
    } else {
      lon = (point.x / 2.5) * 180;
      lat = (point.y / 1.25) * 90;
    }

    let countryName = `Region at ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      const topology = await res.json();
      const decodedArcs = decodeTopology(topology);
      const geometries = topology.objects.countries?.geometries || [];
      for (const geo of geometries) {
        const polygons = [];
        if (geo.type === 'Polygon') polygons.push(resolveArcs(geo.arcs, decodedArcs));
        else if (geo.type === 'MultiPolygon') {
          for (const poly of geo.arcs) polygons.push(resolveArcs(poly, decodedArcs));
        }
        for (const poly of polygons) {
          if (isPointInPolygon([lon, lat], poly)) {
            countryName = geo.properties?.name || `Country #${geo.id}`;
            break;
          }
        }
        if (countryName !== `Region at ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`) break;
      }
    } catch (err) { console.warn('Geo-lookup failed:', err); }

    setSelectedCountry(countryName);
    setView('country');
  };

  // 2D Map Shader Material (Tactical Overhaul)
  const map2DMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x02050A) }, // Even darker
        gridColor: { value: new THREE.Color(0x00A8FF) },
        accentColor: { value: new THREE.Color(0x00FF82) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform vec3 gridColor;
        uniform vec3 accentColor;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.71, 311.7))) * 43758.5453123);
        }

        void main() {
          // Dynamic Grid
          vec2 gUv = vUv * vec2(60.0, 30.0);
          vec2 gridLine = abs(fract(gUv - 0.5) - 0.5) / fwidth(gUv);
          float grid = 1.0 - min(min(gridLine.x, gridLine.y), 1.0);
          
          // Scanning Sweep Pulse
          float sweep = fract(vUv.x - time * 0.1);
          float sweepLine = smoothstep(0.98, 1.0, sweep) * 0.2; // Halved
          
          // Data Noise
          float noise = hash(floor(vUv * 200.0) + floor(time * 10.0)) * 0.02; // Reduced
          
          // Perspective highlight
          float dist = distance(vUv, vec2(0.5, 0.5));
          float highlight = pow(1.0 - dist, 3.0) * 0.1; // Halved
          
          // Composition
          vec3 finalColor = color;
          finalColor += gridColor * grid * 0.08; // Subtle grid
          finalColor += accentColor * sweepLine; // Tactical sweep
          finalColor += gridColor * highlight; // Central highlight
          finalColor += noise; // "Digital stream" noise
          
          // Edge borders
          float border = smoothstep(0.01, 0.0, vUv.x) + smoothstep(0.99, 1.0, vUv.x) +
                         smoothstep(0.01, 0.0, vUv.y) + smoothstep(0.99, 1.0, vUv.y);
          finalColor += gridColor * border * 0.5;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: true,
    });
  }, []);

  useFrame(({ clock }) => {
    if (map2DMaterial.uniforms.time) {
      map2DMaterial.uniforms.time.value = clock.getElapsedTime();
    }
  });

  return (
    <group>
      <group ref={meshRef}>
        {projectionMode === '3d' ? (
          <mesh>
            <sphereGeometry args={[1, 128, 128]} />
            <meshPhongMaterial
              color="#040812"
              emissive="#020408"
              emissiveIntensity={0.3}
              shininess={15}
              displacementMap={landmask || undefined}
              displacementScale={0.012}
            />
          </mesh>
        ) : (
          <group>
            {/* Main Map Plane */}
            <mesh 
              onClick={handlePointerDown}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'default'; }}
            >
              <planeGeometry args={[5, 2.5]} />
              <primitive object={map2DMaterial} attach="material" />
            </mesh>
            
            {/* Map Frame/Border */}
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[5.1, 2.6]} />
              <meshBasicMaterial color="#00A8FF" transparent opacity={0.1} />
            </mesh>
            
            {/* Atmospheric Underglow */}
            <mesh position={[0, 0, -0.05]} scale={[1.1, 1.1, 1]}>
              <planeGeometry args={[5, 2.5]} />
              <meshBasicMaterial color="#00A8FF" transparent opacity={0.05} />
            </mesh>
            {/* HUD Elements */}
            <HUDBrackets />
          </group>
        )}

        <CountryOutlines />
        <CountryDotGrid />
        {projectionMode === '2d' && <CountryFills2D />}

        {projectionMode === '3d' && (
          <mesh>
            <icosahedronGeometry args={[1.001, 3]} />
            <meshBasicMaterial
              color="#00B4FF"
              wireframe
              transparent
              opacity={0.06}
              depthWrite={false}
            />
          </mesh>
        )}

        <GridLines />
        {children}
      </group>

      {projectionMode === '3d' && (
        <group>
          <mesh scale={[1.15, 1.15, 1.15]}>
            <sphereGeometry args={[1, 32, 32]} />
            <primitive object={glowMaterial} attach="material" />
          </mesh>
          <mesh scale={[1.05, 1.05, 1.05]}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial
              color="#00A8FF"
              transparent
              opacity={0.03}
              side={THREE.BackSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

// Helpers retained below
