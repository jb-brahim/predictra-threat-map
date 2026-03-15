import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { CountryOutlines } from './CountryOutlines';

/**
 * Earth sphere with dark surface, wireframe country outlines,
 * and atmospheric Fresnel rim glow.
 * Optimized: reduced sphere segments, shared glow geometry.
 */
export function Earth({ children }: { children?: React.ReactNode }) {
  const meshRef = useRef<THREE.Group>(null);
  const config = useStreamStore(s => s.config);

  // Auto-rotation
  useFrame((_, delta) => {
    if (config.rotation && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
  });

  // Atmospheric glow shader (stays static relative to camera)
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
          // Only show on edges
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  const setSelectedCountry = useStreamStore(s => s.setSelectedCountry);
  const setView = useStreamStore(s => s.setView);

  const handlePointerDown = async (e: any) => {
    e.stopPropagation();
    const point = e.point;
    const vector = new THREE.Vector3().copy(point).normalize();
    
    // Map 3D point to Lat/Lon
    const lat = Math.asin(vector.y) * (180 / Math.PI);
    const lon = Math.atan2(vector.z, -vector.x) * (180 / Math.PI);

    let countryName = `Region at ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;

    try {
      // Try to identify country from GeoJSON
      const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      const topology = await res.json();
      
      // We need to decode the topology to get polygons
      // (This logic is usually in CountryOutlines, we'll use a simplified version here)
      const { arcs: topoArcs, transform } = topology;
      const { scale, translate } = transform || { scale: [1, 1], translate: [0, 0] };
      const decodedArcs = topoArcs.map((arc: any) => {
        let x = 0, y = 0;
        return arc.map((p: any) => {
          x += p[0]; y += p[1];
          return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
        });
      });

      const geometries = topology.objects.countries?.geometries || [];
      for (const geo of geometries) {
        const polygons = [];
        if (geo.type === 'Polygon') {
          polygons.push(resolveArcs(geo.arcs, decodedArcs));
        } else if (geo.type === 'MultiPolygon') {
          for (const poly of geo.arcs) polygons.push(resolveArcs(poly, decodedArcs));
        }

        // Check if point [lon, lat] is in any polygon of this country
        for (const poly of polygons) {
          if (isPointInPolygon([lon, lat], poly)) {
            countryName = geo.properties?.name || `Country #${geo.id}`;
            break;
          }
        }
        if (countryName !== `Region at ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`) break;
      }
    } catch (err) {
      console.warn('Geo-lookup failed:', err);
    }

    setSelectedCountry(countryName);
    setView('country');
  };

  // Helper for point-in-polygon
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

  return (
    <group>
      {/* Rotating Planet Group */}
      <group ref={meshRef}>
        {/* Main Earth sphere surface */}
        <mesh 
          onClick={handlePointerDown}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        >
          <sphereGeometry args={[1, 48, 48]} />
          <meshPhongMaterial
            color="#0A1628"
            emissive="#030810"
            emissiveIntensity={0.5}
            shininess={10}
            transparent
            opacity={0.98}
          />
        </mesh>

        {/* Real Country Boundaries */}
        <CountryOutlines />

        {/* Abstract Wireframe Grid */}
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

        {/* Latitude/Longitude grid lines */}
        <GridLines />

        {/* Sync'ed children (Arcs, Markers, etc) */}
        {children}
      </group>

      {/* Static Atmospheric Effects (don't rotate with planet) */}
      <group>
        {/* Rim glow — 32x32 segments (Fresnel doesn't need high tessellation) */}
        <mesh scale={[1.15, 1.15, 1.15]}>
          <sphereGeometry args={[1, 32, 32]} />
          <primitive object={glowMaterial} attach="material" />
        </mesh>

        {/* Inner glow / volume */}
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
    </group>
  );
}

function GridLines() {
  const linesGeo = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const radius = 1.002;

    // Latitude lines every 30 degrees
    for (let lat = -60; lat <= 60; lat += 30) {
      const phi = (90 - lat) * (Math.PI / 180);
      for (let lon = 0; lon <= 360; lon += 2) {
        const theta = lon * (Math.PI / 180);
        points.push(new THREE.Vector3(
          -(radius * Math.sin(phi) * Math.cos(theta)),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        ));
      }
    }

    // Longitude lines every 30 degrees
    for (let lon = 0; lon < 360; lon += 30) {
      const theta = lon * (Math.PI / 180);
      for (let lat = -90; lat <= 90; lat += 2) {
        const phi = (90 - lat) * (Math.PI / 180);
        points.push(new THREE.Vector3(
          -(radius * Math.sin(phi) * Math.cos(theta)),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        ));
      }
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, []);

  return (
    <points>
      <primitive object={linesGeo} attach="geometry" />
      <pointsMaterial
        color="#00B4FF"
        size={0.003}
        transparent
        opacity={0.15}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
