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
  const projectionMode = useStreamStore(s => s.projectionMode);

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

  return (
    <group>
      <group ref={meshRef}>
        <mesh 
          onClick={handlePointerDown}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        >
          {projectionMode === '3d' ? (
            <sphereGeometry args={[1, 48, 48]} />
          ) : (
            <planeGeometry args={[5, 2.5]} />
          )}
          <meshPhongMaterial
            color="#0A1628"
            emissive="#030810"
            emissiveIntensity={0.5}
            shininess={10}
            transparent
            opacity={0.98}
          />
        </mesh>

        <CountryOutlines />

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
          points.push(new THREE.Vector3(
            -(radius * Math.sin(phi) * Math.cos(theta)),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
          ));
        }
      }
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
    } else {
      // 2D grid lines
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
