import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { CountryOutlines } from './CountryOutlines';

/**
 * Cyberpunk/Holographic Earth.
 * Clean, dark core, glowing data grids, and intense neon atmosphere.
 */
export function Earth({ children }: { children?: React.ReactNode }) {
  const meshRef = useRef<THREE.Group>(null);
  const dataGridRef = useRef<THREE.Mesh>(null);
  const config = useStreamStore(s => s.config);

  // Auto-rotation
  useFrame((_, delta) => {
    if (config.rotation && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
    // Make the outer data grid rotate slightly faster for a holographic scanning effect
    if (dataGridRef.current) {
      dataGridRef.current.rotation.y += delta * 0.08;
      dataGridRef.current.rotation.x += delta * 0.02;
    }
  });

  // Cyberpunk aggressive glow shader (sharp neon edge)
  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x00E8FF) },
      },
      vertexShader: `
        varying float vIntensity;
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec3 vNormel = normalize(-mvPosition.xyz);
          // Sharp falloff for a hard "laser" rim
          vIntensity = pow(0.55 - dot(vNormal, vNormel), 5.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float vIntensity;
        void main() {
          gl_FragColor = vec4(glowColor, vIntensity * 1.5);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  return (
    <group>
      {/* Rotating Planet Group */}
      <group ref={meshRef}>
        
        {/* Main Dark Core (Obscures the back of the globe) */}
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <meshPhongMaterial
            color="#010308"
            emissive="#010205"
            specular={new THREE.Color(0x003366)}
            shininess={30}
            transparent
            opacity={0.99}
          />
        </mesh>

        {/* Real Country Boundaries */}
        <group scale={[1.002, 1.002, 1.002]}>
          <CountryOutlines />
        </group>

        {/* Outer Holographic Data Grid */}
        <mesh ref={dataGridRef} scale={[1.004, 1.004, 1.004]}>
          <icosahedronGeometry args={[1, 4]} />
          <meshBasicMaterial
            color="#00E8FF"
            wireframe
            transparent
            opacity={0.03}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        <GridLines />

        {/* Sync'ed children (Arcs, Markers, etc) */}
        {children}
      </group>

      {/* Atmospheric Neon Rim Glow */}
      <group>
        <mesh scale={[1.15, 1.15, 1.15]}>
          <sphereGeometry args={[1, 64, 64]} />
          <primitive object={glowMaterial} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

function GridLines() {
  const linesGeo = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const radius = 1.003;

    for (let lat = -60; lat <= 60; lat += 30) {
      const phi = (90 - lat) * (Math.PI / 180);
      for (let lon = 0; lon <= 360; lon += 4) {
        const theta = lon * (Math.PI / 180);
        points.push(new THREE.Vector3(
          -(radius * Math.sin(phi) * Math.cos(theta)),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        ));
      }
    }

    for (let lon = 0; lon < 360; lon += 30) {
      const theta = lon * (Math.PI / 180);
      for (let lat = -90; lat <= 90; lat += 4) {
        const phi = (90 - lat) * (Math.PI / 180);
        points.push(new THREE.Vector3(
          -(radius * Math.sin(phi) * Math.cos(theta)),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        ));
      }
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  return (
    <points>
      <primitive object={linesGeo} attach="geometry" />
      <pointsMaterial
        color="#00E8FF"
        size={0.003}
        transparent
        opacity={0.15}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
