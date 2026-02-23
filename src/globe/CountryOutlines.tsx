import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

const GEOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const GLOBE_RADIUS = 1.002; // Slightly above Earth surface
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

// Decode TopoJSON arc references into coordinate arrays
function decodeTopology(topology: any): number[][][] {
  const { arcs: topoArcs, transform } = topology;
  const { scale, translate } = transform || { scale: [1, 1], translate: [0, 0] };

  // Decode delta-encoded arcs
  const decodedArcs: number[][][] = topoArcs.map((arc: number[][]) => {
    let x = 0, y = 0;
    return arc.map((point: number[]) => {
      x += point[0];
      y += point[1];
      return [
        x * scale[0] + translate[0],
        y * scale[1] + translate[1],
      ];
    });
  });

  return decodedArcs;
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
      for (const ring of geo.arcs) {
        polygons.push(resolveArcs(ring, decodedArcs));
      }
    } else if (geo.type === 'MultiPolygon') {
      for (const polygon of geo.arcs) {
        for (const ring of polygon) {
          polygons.push(resolveArcs(ring, decodedArcs));
        }
      }
    }
  }

  return polygons;
}

/**
 * Renders country outlines on the globe using TopoJSON world data.
 * Optimized: shares a single BufferGeometry between both line passes.
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

        // Build line segments from all country polygons
        const linePoints: THREE.Vector3[] = [];

        for (const polygon of polygons) {
          for (let i = 0; i < polygon.length - 1; i++) {
            const [lon1, lat1] = polygon[i];
            const [lon2, lat2] = polygon[i + 1];

            // Skip very long segments (anti-meridian wrapping artifacts)
            if (Math.abs(lon2 - lon1) > 90) continue;

            linePoints.push(latLonToVec3(lat1, lon1, GLOBE_RADIUS));
            linePoints.push(latLonToVec3(lat2, lon2, GLOBE_RADIUS));
          }
        }

        if (linePoints.length === 0) return;

        // Single shared geometry for both passes
        const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);

        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(0x00B4FF),
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
        });

        const lines = new THREE.LineSegments(geometry, material);
        group.add(lines);

        // Second brighter pass — SHARES the same geometry (no clone!)
        const material2 = new THREE.LineBasicMaterial({
          color: new THREE.Color(0x00E0FF),
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const lines2 = new THREE.LineSegments(geometry, material2);
        lines2.scale.setScalar(1.001);
        group.add(lines2);

        setLoaded(true);
      })
      .catch(err => {
        console.warn('Failed to load country outlines:', err);
      });
  }, [loaded]);

  return <group ref={groupRef} />;
}
