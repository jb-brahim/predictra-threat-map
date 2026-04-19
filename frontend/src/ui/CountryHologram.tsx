import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStreamStore } from '../stream/useStreamStore';
import { getCountryInfo } from '../utils/countryNames';

const GEOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export function CountryHologram() {
  const groupRef = useRef<THREE.Group>(null);
  const scanRef = useRef<THREE.Mesh>(null);
  const floorRef = useRef<THREE.Mesh>(null);
  const selectedCountry = useStreamStore(s => s.selectedCountry);
  const [geometries, setGeometries] = useState<{ solid: THREE.ExtrudeGeometry; wire: THREE.EdgesGeometry }[]>([]);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!selectedCountry?.code || selectedCountry.code === '??') {
      setGeometries([]);
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
          setGeometries([]);
          return;
        }
        
        const polygonArcs: number[][][] = []; // [ring][point][x,y]
        if (targetGeo.type === 'Polygon') {
          for (const ring of targetGeo.arcs) polygonArcs.push(resolveArcs(ring, decodedArcs));
        } else if (targetGeo.type === 'MultiPolygon') {
          for (const polygon of targetGeo.arcs)
            for (const ring of polygon) polygonArcs.push(resolveArcs(ring, decodedArcs));
        }

        const extrusions: { solid: THREE.ExtrudeGeometry; wire: THREE.EdgesGeometry }[] = [];
        let combinedPoints: THREE.Vector3[] = [];

        for (const ringPoints of polygonArcs) {
          if (ringPoints.length < 3) continue;
          
          const shape = new THREE.Shape();
          shape.moveTo(ringPoints[0][0], ringPoints[0][1]);
          for (let i = 1; i < ringPoints.length; i++) {
            shape.lineTo(ringPoints[i][0], ringPoints[i][1]);
          }

          const extrudeSettings = {
            steps: 1,
            depth: 4,
            beveled: true,
            bevelThickness: 1,
            bevelSize: 1,
            bevelSegments: 2
          };

          const solidGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          solidGeo.center();
          
          const wireGeo = new THREE.EdgesGeometry(solidGeo);
          extrusions.push({ solid: solidGeo, wire: wireGeo });

          // Accumulate for scale calculation
          solidGeo.computeBoundingBox();
          combinedPoints.push(solidGeo.boundingBox!.min, solidGeo.boundingBox!.max);
        }

        if (extrusions.length > 0) {
          // Calculate overall bounding box to normalize scale
          const box = new THREE.Box3().setFromPoints(combinedPoints);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y);
          setScale(120 / maxDim);
          setGeometries(extrusions);
        } else {
          setGeometries([]);
        }
      });
  }, [selectedCountry]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (scanRef.current) {
        scanRef.current.position.z = Math.sin(t * 1.5) * 8;
        (scanRef.current.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.cos(t * 1.5)) * 0.3;
    }
    if (floorRef.current) {
        floorRef.current.rotation.z = t * 0.1;
    }
  });

  if (geometries.length === 0) return null;

  return (
    <group ref={groupRef} scale={scale}>
      {geometries.map((g, i) => (
        <group key={i}>
          {/* Solid Base */}
          <mesh geometry={g.solid}>
            <meshStandardMaterial 
              color="#00D0FF" 
              transparent 
              opacity={0.15} 
              emissive="#00D0FF"
              emissiveIntensity={0.5}
              roughness={0.1}
              metalness={0.8}
            />
          </mesh>
          {/* Neon Wireframe */}
          <lineSegments geometry={g.wire}>
            <lineBasicMaterial color="#00E8FF" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
          </lineSegments>
        </group>
      ))}

      {/* Holographic Floor / Grid */}
      <mesh ref={floorRef} position={[0, 0, -10]}>
        <circleGeometry args={[100, 64]} />
        <meshBasicMaterial 
          color="#002233" 
          transparent 
          opacity={0.3} 
          wireframe 
        />
      </mesh>
      
      {/* Scanning Beam */}
      <mesh ref={scanRef} position={[0, 0, 0]}>
        <planeGeometry args={[250, 4]} />
        <meshBasicMaterial 
          color="#00E8FF" 
          transparent 
          opacity={0.4} 
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
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
