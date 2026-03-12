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
          vIntensity = pow(0.65 - dot(vNormal, vNormel), 12.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float vIntensity;
        void main() {
          gl_FragColor = vec4(glowColor, vIntensity * 0.4);
          // Only show on edges
          if (gl_FragColor.a < 0.005) discard;
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
            color="#050A15"
            emissive="#020408"
            emissiveIntensity={0.5}
            transparent
            opacity={0.95}
            shininess={10}
          />
        </mesh>

        {/* Real Country Boundaries */}
        <CountryOutlines />

        {/* Subtle base grid for space reference */}
        <mesh>
          <icosahedronGeometry args={[1, 2]} />
          <meshBasicMaterial
            color="#00D1FF"
            wireframe
            transparent
            opacity={0.02}
            depthWrite={false}
          />
        </mesh>

        {/* Sync'ed children (Arcs, Markers, etc) */}
        {children}
      </group>

      {/* Static Atmospheric Effects (don't rotate with planet) */}
      <group>
        {/* Rim glow — 32x32 segments (Fresnel doesn't need high tessellation) */}
        <mesh scale={[1.12, 1.12, 1.12]}>
          <sphereGeometry args={[1, 32, 32]} />
          <primitive object={glowMaterial} attach="material" />
        </mesh>

        {/* Inner glow / volume */}
        <mesh scale={[1.05, 1.05, 1.05]}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial
            color="#00D1FF"
            transparent
            opacity={0.02}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}


