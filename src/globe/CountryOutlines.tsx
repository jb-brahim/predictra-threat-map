import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

// Use the 110m dataset that is proven to work
const GEOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const GLOBE_RADIUS = 1.002;
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || loaded) return;

    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(topology => {
        const polygons = extractPolygons(topology);
        const linePoints: THREE.Vector3[] = [];

        for (const polygon of polygons) {
          for (let i = 0; i < polygon.length - 1; i++) {
            const [lon1, lat1] = polygon[i];
            const [lon2, lat2] = polygon[i + 1];
            if (Math.abs(lon2 - lon1) > 90) continue;
            linePoints.push(latLonToVec3(lat1, lon1, GLOBE_RADIUS));
            linePoints.push(latLonToVec3(lat2, lon2, GLOBE_RADIUS));
          }
        }

        if (linePoints.length === 0) return;

        const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);

        // ─── 5-layer glow stack ───────────────────────────────────
        // All layers use AdditiveBlending so they stack into pure white-hot glow.
        // Colors are intentionally overbright (> 1.0 via Color.multiplyScalar)
        // to guarantee they exceed the Bloom luminanceThreshold.

        const layers: { color: THREE.Color; opacity: number; scale: number }[] = [
          // L1: Sharp white-cyan core (the actual border line)
          { color: new THREE.Color(0x00E8FF).multiplyScalar(2.0), opacity: 0.8,  scale: 1.0 },
          // L2: Bright cyan inner
          { color: new THREE.Color(0x00D0FF).multiplyScalar(1.5), opacity: 0.45, scale: 1.002 },
          // L3: Medium spread
          { color: new THREE.Color(0x00BBFF).multiplyScalar(1.2), opacity: 0.25, scale: 1.004 },
          // L4: Wide soft glow
          { color: new THREE.Color(0x0099FF),                     opacity: 0.15, scale: 1.007 },
          // L5: Widest halo
          { color: new THREE.Color(0x0077DD),                     opacity: 0.08, scale: 1.011 },
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
          lines.scale.setScalar(layer.scale);
          group.add(lines);
        }

        setLoaded(true);
      })
      .catch(err => console.warn('Failed to load country outlines:', err));
  }, [loaded]);

  return <group ref={groupRef} />;
}
