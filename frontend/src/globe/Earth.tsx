import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { getCountryInfo } from '../utils/countryNames';

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

// --- Cinematic Components ---


function OrbitalRings() {
  const rings = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 2; i++) {
        const radius = 1.1 + Math.random() * 0.15;
        const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI, false, 0);
        const points = curve.getPoints(64);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        arr.push({ geometry, rotX: Math.random() * Math.PI, rotY: Math.random() * Math.PI });
    }
    return arr;
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.rotation.y = clock.getElapsedTime() * 0.02;
  });

  return (
    <group ref={groupRef}>
      {rings.map((r, i) => (
        <lineLoop key={i} geometry={r.geometry} rotation={[r.rotX, r.rotY, 0]}>
          <lineBasicMaterial color="#00D1FF" transparent opacity={0.4} blending={THREE.AdditiveBlending} />
        </lineLoop>
      ))}
    </group>
  );
}

function CinematicGlobe3D({ onPointerMove, onClick, onPointerOut }: any) {
  const [textures, setTextures] = useState<any>({});

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    
    let loaded = 0;
    const maps: any = {};
    const checkReady = () => { if (loaded === 4) setTextures(maps); };

    loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; maps.map = t; loaded++; checkReady();
    }, undefined, () => { loaded++; checkReady(); }); // Catch errors softly
    loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_lights_2048.png', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; maps.emissiveMap = t; loaded++; checkReady();
    }, undefined, () => { loaded++; checkReady(); });
    loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg', (t) => {
      maps.normalMap = t; loaded++; checkReady();
    }, undefined, () => { loaded++; checkReady(); });
    loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg', (t) => {
      maps.specularMap = t; loaded++; checkReady();
    }, undefined, () => { loaded++; checkReady(); });
  }, []);

  return (
    <mesh 
      onPointerMove={onPointerMove} 
      onClick={onClick} 
      onPointerOut={onPointerOut}
    >
      <sphereGeometry args={[1, 64, 64]} />
      {textures.map ? (
        <meshPhongMaterial
          map={textures.map}
          emissiveMap={textures.emissiveMap}
          emissive={new THREE.Color(0xFFEAA0)}
          emissiveIntensity={1.5}
          normalMap={textures.normalMap}
          normalScale={new THREE.Vector2(1.5, 1.5)}
          specularMap={textures.specularMap}
          specular={new THREE.Color(0x222222)}
          shininess={25}
        />
      ) : (
        <meshPhongMaterial color="#050B14" />
      )}
    </mesh>
  );
}

export function Earth({ children }: { children?: React.ReactNode }) {
  const meshRef = useRef<THREE.Group>(null);
  const config = useStreamStore(s => s.config);
  const projectionMode = useStreamStore(s => s.projectionMode);

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



  // 2D Map Shader Material (Enterprise Overhaul)
  const map2DMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x0F172A) }, // Slate background
        gridColor: { value: new THREE.Color(0xFFFFFF) }, // Subtle white grid
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 gridColor;
        varying vec2 vUv;

        void main() {
          // Subtle Static Grid
          vec2 gUv = vUv * vec2(60.0, 30.0);
          vec2 gridLine = abs(fract(gUv - 0.5) - 0.5) / fwidth(gUv);
          float grid = 1.0 - min(min(gridLine.x, gridLine.y), 1.0);
          
          vec3 finalColor = color + gridColor * grid * 0.02; 
          
          float border = smoothstep(0.01, 0.0, vUv.x) + smoothstep(0.99, 1.0, vUv.x) +
                         smoothstep(0.01, 0.0, vUv.y) + smoothstep(0.99, 1.0, vUv.y);
          finalColor += gridColor * border * 0.1;

          float alpha = max(grid * 0.15, border * 0.4);
          gl_FragColor = vec4(finalColor, alpha);
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

  // Topology cache for click mapping
  const [topologyCache, setTopologyCache] = useState<any[] | null>(null);
  const setSelectedCountry = useStreamStore(s => s.setSelectedCountry);
  const setView = useStreamStore(s => s.setView);

  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topo => {
        const decoded = decodeTopology(topo);
        const polys = topo.objects.countries.geometries.map((geo: any) => {
          const coords: any[] = [];
          if (geo.type === 'Polygon') coords.push(resolveArcs(geo.arcs, decoded));
          else if (geo.type === 'MultiPolygon') {
            for (const arc of geo.arcs) coords.push(resolveArcs(arc, decoded));
          }
          return { id: geo.id, name: geo.properties?.name, coords };
        });
        setTopologyCache(polys);
      });
  }, []);

  const handleGlobeClick = (e: any) => {
    e.stopPropagation();
    if (!topologyCache || !e.uv) return;
    const lon = (e.uv.x * 360) - 180;
    const lat = (e.uv.y * 180) - 90;
    let found = null;
    for (const c of topologyCache) {
      for (const poly of c.coords) {
        if (isPointInPolygon([lon, lat], poly)) {
          found = c;
          break;
        }
      }
      if (found) break;
    }
    if (found) {
      const info = getCountryInfo(String(found.id));
      setSelectedCountry({ name: found.name || info.name, code: info.alpha2 });
      setView('country');
    }
  };

  const handlePointerOver = () => {
     document.body.style.cursor = 'crosshair';
  };
  const handlePointerOut = () => {
     document.body.style.cursor = 'default';
  };

  return (
    <group>
      <group ref={meshRef}>
        {projectionMode === '3d' ? (
          <>
            <CinematicGlobe3D 
              onPointerMove={handlePointerOver}
              onClick={handleGlobeClick}
              onPointerOut={handlePointerOut}
            />
            <OrbitalRings />
          </>
        ) : (
          <group>
            {/* Main Map Plane */}
            <mesh onClick={handleGlobeClick} onPointerMove={handlePointerOver} onPointerOut={handlePointerOut}>
              <planeGeometry args={[5.2, 2.6]} />
              <primitive object={map2DMaterial} attach="material" />
            </mesh>
          </group>
        )}

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
