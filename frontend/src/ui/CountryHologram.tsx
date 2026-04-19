import { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStreamStore } from '../stream/useStreamStore';
import { getCountryInfo } from '../utils/countryNames';

const GEOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export function CountryHologram() {
  const groupRef = useRef<THREE.Group>(null);
  const meshGroupRef = useRef<THREE.Group>(null);
  const selectedCountry = useStreamStore(s => s.selectedCountry);
  const [geometries, setGeometries] = useState<{ mesh: THREE.ExtrudeGeometry; wire: THREE.EdgesGeometry }[]>([]);
  const [scale, setScale] = useState(1);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#00E8FF') },
    uGlowColor: { value: new THREE.Color('#005577') }
  }), []);

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

        const polygonArcs: number[][][] = []; 
        if (targetGeo.type === 'Polygon') {
          for (const ring of targetGeo.arcs) polygonArcs.push(resolveArcs(ring, decodedArcs));
        } else if (targetGeo.type === 'MultiPolygon') {
          for (const polygon of targetGeo.arcs)
            for (const ring of polygon) polygonArcs.push(resolveArcs(ring, decodedArcs));
        }

        // Calculate Bounding Box and Center
        const allPointsArray: THREE.Vector2[] = [];
        polygonArcs.forEach(ring => ring.forEach(p => allPointsArray.push(new THREE.Vector2(p[0], p[1]))));
        const box = new THREE.Box2().setFromPoints(allPointsArray);
        const center = new THREE.Vector2();
        box.getCenter(center);
        const extrusions: { mesh: THREE.ExtrudeGeometry; wire: THREE.EdgesGeometry }[] = [];

        for (const ringPoints of polygonArcs) {
          if (ringPoints.length < 3) continue;
          
          const shape = new THREE.Shape();
          shape.moveTo(ringPoints[0][0] - center.x, ringPoints[0][1] - center.y);
          for (let i = 1; i < ringPoints.length; i++) {
            shape.lineTo(ringPoints[i][0] - center.x, ringPoints[i][1] - center.y);
          }

          const extrudeSettings = {
            steps: 1,
            depth: 8,
            bevelEnabled: true,
            bevelThickness: 1,
            bevelSize: 1,
            bevelSegments: 2
          };

          const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          const wire = new THREE.EdgesGeometry(geo);
          extrusions.push({ mesh: geo, wire });
        }

        if (extrusions.length > 0) {
          const size = new THREE.Vector2();
          box.getSize(size);
          setScale(140 / Math.max(size.x, size.y));
          setGeometries(extrusions);
        } else {
          setGeometries([]);
        }
      });
  }, [selectedCountry]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    uniforms.uTime.value = t;
    if (meshGroupRef.current) {
        meshGroupRef.current.position.y = Math.sin(t * 0.5) * 2; // subtle float
        meshGroupRef.current.rotation.y = Math.sin(t * 0.2) * 0.05;
    }
  });

  if (geometries.length === 0) return null;

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPos;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    varying vec3 vNormal;
    varying vec3 vPos;
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uGlowColor;

    void main() {
      vec3 vDir = normalize(cameraPosition - vPos);
      float fresnel = 1.0 - max(dot(vDir, vNormal), 0.0);
      fresnel = pow(fresnel, 2.5);

      float scanlines = pow(sin(vPos.y * 10.0 - uTime * 4.0) * 0.5 + 0.5, 8.0) * 0.4;
      float scanlinesX = pow(sin(vPos.x * 10.0 + uTime * 2.0) * 0.5 + 0.5, 12.0) * 0.2;
      
      float pulse = (sin(uTime * 1.5) * 0.5 + 0.5) * 0.1;
      float alpha = (fresnel * 0.7 + scanlines + scanlinesX + pulse) * 0.9;
      
      vec3 finalColor = mix(uGlowColor, uColor, fresnel + scanlines * 0.5);
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  return (
    <group ref={groupRef} scale={scale}>
      <group ref={meshGroupRef}>
        {geometries.map((g, i) => (
            <group key={i}>
                {/* Main Holographic Mesh */}
                <mesh geometry={g.mesh}>
                    <shaderMaterial
                        vertexShader={vertexShader}
                        fragmentShader={fragmentShader}
                        uniforms={uniforms}
                        transparent
                        depthWrite={false}
                        side={THREE.DoubleSide}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
                {/* High Density Wireframe */}
                <lineSegments geometry={g.wire}>
                    <lineBasicMaterial color="#00FFFF" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
                </lineSegments>
            </group>
        ))}
      </group>

      {/* Tactical Floor Radials */}
      <group position={[0, 0, -15]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[140, 142, 64]} />
          <meshBasicMaterial color="#00FFFF" transparent opacity={0.05} />
        </mesh>
        <mesh rotation={[0, 0, uniforms.uTime.value * 0.1]}>
          <ringGeometry args={[150, 155, 4, 1, 0, Math.PI * 0.1]} />
          <meshBasicMaterial color="#00FFFF" transparent opacity={0.2} />
        </mesh>
      </group>
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
