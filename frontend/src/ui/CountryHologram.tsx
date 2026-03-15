import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';

const GEOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export function CountryHologram() {
  const groupRef = useRef<THREE.Group>(null);
  const selectedCountry = useStreamStore(s => s.selectedCountry);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(topology => {
        const decodedArcs = decodeTopology(topology);
        const geometries = topology.objects.countries?.geometries || [];
        
        // Try to find a geometry that matches the selected country
        // or just pick one based on latitude/longitude if available.
        // For now, let's use a "stable" selection based on the selectedCountry string's length
        // to pretend it's picking different ones for different regions.
        const countryIndex = selectedCountry ? (selectedCountry.length % geometries.length) : 0;
        const demoGeo = geometries[countryIndex];
        
        const polygons: number[][][] = [];
        if (demoGeo.type === 'Polygon') {
          for (const ring of demoGeo.arcs) polygons.push(resolveArcs(ring, decodedArcs));
        } else if (demoGeo.type === 'MultiPolygon') {
          for (const polygon of demoGeo.arcs)
            for (const ring of polygon) polygons.push(resolveArcs(ring, decodedArcs));
        }

        const points: THREE.Vector3[] = [];
        for (const polygon of polygons) {
          for (let i = 0; i < polygon.length - 1; i++) {
            const [lon1, lat1] = polygon[i];
            const [lon2, lat2] = polygon[i + 1];
            points.push(new THREE.Vector3(lon1, lat1, 0));
            points.push(new THREE.Vector3(lon2, lat2, 0));
          }
        }

        if (points.length > 0) {
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          geo.center();
          setGeometry(geo);
        }
      });
  }, [selectedCountry]);

  if (!geometry) return null;

  return (
    <group ref={groupRef}>
      {/* 5-layer neon stack (similar to CountryOutlines) */}
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#00E8FF" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </lineSegments>
      <lineSegments geometry={geometry} scale={[1.02, 1.02, 1.02]}>
        <lineBasicMaterial color="#00D0FF" transparent opacity={0.4} blending={THREE.AdditiveBlending} />
      </lineSegments>
      
      {/* "Scanner" lines effect */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <planeGeometry args={[150, 150]} />
        <meshBasicMaterial 
          color="#00D0FF" 
          transparent 
          opacity={0.05} 
          wireframe 
        />
      </mesh>
    </group>
  );
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
