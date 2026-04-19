import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStreamStore } from '../stream/useStreamStore';
import { getCountryInfo } from '../utils/countryNames';

const GEOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export function CountryHologram() {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const scanLineRef = useRef<THREE.Group>(null);
  
  const selectedCountry = useStreamStore(s => s.selectedCountry);
  const [pointGeometry, setPointGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [edgeGeometry, setEdgeGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!selectedCountry?.code || selectedCountry.code === '??') {
      setPointGeometry(null);
      setEdgeGeometry(null);
      return;
    }

    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(topology => {
        const decodedArcs = decodeTopology(topology);
        const geoData = topology.objects.countries?.geometries || [];
        
        const targetGeo = geoData.find((g: any) => {
          const info = getCountryInfo(String(g.id));
          return info.alpha2 === selectedCountry.code;
        });

        if (!targetGeo) {
          setPointGeometry(null);
          setEdgeGeometry(null);
          return;
        }
        
        const polygonArcs: number[][][] = []; 
        if (targetGeo.type === 'Polygon') {
          for (const ring of targetGeo.arcs) polygonArcs.push(resolveArcs(ring, decodedArcs));
        } else if (targetGeo.type === 'MultiPolygon') {
          for (const polygon of targetGeo.arcs)
            for (const ring of polygon) polygonArcs.push(resolveArcs(ring, decodedArcs));
        }

        // 1. Calculate Bounding Box
        const allPoints: THREE.Vector2[] = [];
        polygonArcs.forEach(ring => ring.forEach(p => allPoints.push(new THREE.Vector2(p[0], p[1]))));
        const box = new THREE.Box2().setFromPoints(allPoints);
        const center = new THREE.Vector2();
        box.getCenter(center);

        // 2. Point Matrix Generation (Volume Filling)
        const density = 1.5; // points per unit
        const matrixPoints: number[] = [];
        const matrixColors: number[] = [];
        
        for (let x = box.min.x; x <= box.max.x; x += density) {
          for (let y = box.min.y; y <= box.max.y; y += density) {
            // Point-in-polygon check
            if (isPointInPolygons([x, y], polygonArcs)) {
              // Add points at multiple depths for 3D volume
              for (let z = -3; z <= 3; z += 1.5) {
                matrixPoints.push(x - center.x, y - center.y, z);
                const intensity = 0.5 + Math.random() * 0.5;
                matrixColors.push(0, 0.8, 1, intensity);
              }
            }
          }
        }

        // 3. Edge Outline (Glow Edges)
        const edgePoints: THREE.Vector3[] = [];
        polygonArcs.forEach(ring => {
          for (let i = 0; i < ring.length - 1; i++) {
            edgePoints.push(new THREE.Vector3(ring[i][0] - center.x, ring[i][1] - center.y, 4));
            edgePoints.push(new THREE.Vector3(ring[i + 1][0] - center.x, ring[i + 1][1] - center.y, 4));
            edgePoints.push(new THREE.Vector3(ring[i][0] - center.x, ring[i][1] - center.y, -4));
            edgePoints.push(new THREE.Vector3(ring[i + 1][0] - center.x, ring[i + 1][1] - center.y, -4));
          }
        });

        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.Float32BufferAttribute(matrixPoints, 3));
        pGeo.setAttribute('color', new THREE.Float32BufferAttribute(matrixColors, 4));
        setPointGeometry(pGeo);

        const eGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
        setEdgeGeometry(eGeo);

        const size = new THREE.Vector2();
        box.getSize(size);
        setScale(130 / Math.max(size.x, size.y));
      });
  }, [selectedCountry]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (pointsRef.current) {
      pointsRef.current.rotation.y = Math.sin(t * 0.2) * 0.1;
      // Procedural Glitch
      if (Math.random() > 0.98) pointsRef.current.position.x = (Math.random() - 0.5) * 0.5;
      else pointsRef.current.position.x = 0;
    }
    if (scanLineRef.current) {
      scanLineRef.current.position.z = Math.sin(t * 2) * 10;
    }
  });

  if (!pointGeometry) return null;

  return (
    <group ref={groupRef} scale={scale}>
      {/* 1. Point Matrix volume */}
      <points ref={pointsRef} geometry={pointGeometry}>
        <pointsMaterial 
          size={1.2} 
          vertexColors 
          transparent 
          opacity={0.6} 
          blending={THREE.AdditiveBlending}
          sizeAttenuation={true}
        />
      </points>

      {/* 2. Tactical Edge Outlines */}
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial color="#00E8FF" transparent opacity={0.3} blending={THREE.AdditiveBlending} />
        </lineSegments>
      )}

      {/* 3. High-Frequency Lasers */}
      <group ref={scanLineRef}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[300, 0.5]} />
          <meshBasicMaterial color="#00FFFF" transparent opacity={0.8} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0, 0, 0.4]}>
          <planeGeometry args={[300, 2]} />
          <meshBasicMaterial color="#00FFFF" transparent opacity={0.1} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>

      {/* 4. Tactical Floor HUD */}
      <group position={[0, 0, -10]}>
        {/* Outer Ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[115, 120, 64]} />
          <meshBasicMaterial color="#00FFFF" transparent opacity={0.1} side={THREE.DoubleSide} />
        </mesh>
        {/* Tick Marks */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
           <mesh key={deg} rotation={[0, 0, (deg * Math.PI) / 180]} position={[0, 125, 0]}>
             <planeGeometry args={[1, 10]} />
             <meshBasicMaterial color="#00FFFF" transparent opacity={0.4} />
           </mesh>
        ))}
      </group>
    </group>
  );
}

// ── Point-In-Polygon Utility ───────────────────────────────────────────────

function isPointInPolygons(point: [number, number], polygons: number[][][]): boolean {
  let inside = false;
  for (const ring of polygons) {
    let j = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
      if (((ring[i][1] > point[1]) !== (ring[j][1] > point[1])) &&
          (point[0] < (ring[j][0] - ring[i][0]) * (point[1] - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0])) {
        inside = !inside;
      }
      j = i;
    }
  }
  return inside;
}

// Helper utilities (copied from CountryOutlines for isolation)
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
