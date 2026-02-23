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

  return (
    <group>
      {/* Rotating Planet Group */}
      <group ref={meshRef}>
        {/* Main Earth sphere surface — 48x48 segments (vs 64x64, still smooth) */}
        <mesh>
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
            opacity={0.04}
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
        opacity={0.12}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
