import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';

// Use the 110m dataset that is proven to work
const GEOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const GLOBE_RADIUS = 1.052;
const DEG2RAD = Math.PI / 180;

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

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

function extractPolygons(topology: any): number[][][] {
  const decodedArcs = decodeTopology(topology);
  const polygons: number[][][] = [];
  const geometries = topology.objects.countries?.geometries || [];
  for (const geo of geometries) {
    if (geo.type === 'Polygon') {
      for (const ring of geo.arcs) polygons.push(resolveArcs(ring, decodedArcs));
    } else if (geo.type === 'MultiPolygon') {
      for (const polygon of geo.arcs)
        for (const ring of polygon) polygons.push(resolveArcs(ring, decodedArcs));
    }
  }
  return polygons;
}

/**
 * Country outlines with permanent neon glow.
 *
 * The glow is achieved by stacking FIVE additive layers at increasing
 * scales — from a sharp core to a wide soft halo — all using bright
 * colors above the Bloom luminance threshold so the postprocessing
 * pipeline amplifies them into a real glow.
 */
export function CountryOutlines() {
  const groupRef = useRef<THREE.Group>(null);
  const projectionMode = useStreamStore(s => s.projectionMode);
  const [loadedData, setLoadedData] = useState<any>(null);

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(topology => setLoadedData(topology))
      .catch(err => console.warn('Failed to load country outlines:', err));
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || !loadedData) return;

    // Clear previous lines
    while (group.children.length > 0) {
      const child = group.children[0] as any;
      if (child.geometry) child.geometry.dispose();
      group.remove(child);
    }

    const polygons = extractPolygons(loadedData);
    const linePoints: THREE.Vector3[] = [];

    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length - 1; i++) {
        const [lon1, lat1] = polygon[i];
        const [lon2, lat2] = polygon[i + 1];
        
        if (projectionMode === '3d') {
          if (Math.abs(lon2 - lon1) > 90) continue;
          linePoints.push(latLonToVec3(lat1, lon1, GLOBE_RADIUS));
          linePoints.push(latLonToVec3(lat2, lon2, GLOBE_RADIUS));
        } else {
          // 2D Projection
          const x1 = (lon1 / 180) * 2.5;
          const y1 = (lat1 / 90) * 1.25;
          const x2 = (lon2 / 180) * 2.5;
          const y2 = (lat2 / 90) * 1.25;
          linePoints.push(new THREE.Vector3(x1, y1, 0.01));
          linePoints.push(new THREE.Vector3(x2, y2, 0.01));
        }
      }
    }

    if (linePoints.length > 0) {
      const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const layers = [
        { color: new THREE.Color(0x00E8FF).multiplyScalar(2.0), opacity: 0.8, scale: 1.0 },
        { color: new THREE.Color(0x00D0FF).multiplyScalar(1.5), opacity: 0.45, scale: 1.002 },
        { color: new THREE.Color(0x00BBFF).multiplyScalar(1.2), opacity: 0.25, scale: 1.004 },
      ];

      for (const layer of layers) {
        const mat = new THREE.LineBasicMaterial({
          color: layer.color,
          transparent: true,
          opacity: layer.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const lines = new THREE.LineSegments(geometry, mat);
        lines.userData = { baseOpacity: layer.opacity }; // For pulsing
        if (projectionMode === '3d') lines.scale.setScalar(layer.scale);
        group.add(lines);
      }
    }
  }, [loadedData, projectionMode]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = Math.sin(t * 2.0) * 0.15 + 0.85; // Breathes between 0.7 and 1.0
    
    groupRef.current.children.forEach((child: any) => {
      if (child.material) {
        child.material.opacity = (child.userData.baseOpacity || 0.5) * pulse;
      }
    });
  });

  return <group ref={groupRef} />;
}
