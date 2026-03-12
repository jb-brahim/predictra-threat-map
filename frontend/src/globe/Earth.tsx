import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useStreamStore } from '../stream/useStreamStore';
import { CountryOutlines } from './CountryOutlines';

/**
 * Earth sphere with high-quality textures, clouds, 
 * and enhanced atmospheric Fresnel rim glow.
 */
export function Earth({ children }: { children?: React.ReactNode }) {
  const meshRef = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const config = useStreamStore(s => s.config);

  // Load High-Quality Textures
  const [dayMap, normalMap, specularMap, cloudsMap] = useTexture([
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
  ]);

  // Auto-rotation
  useFrame((_, delta) => {
    if (config.rotation && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
    if (cloudRef.current) {
      cloudRef.current.rotation.y += delta * 0.07;
    }
  });

  // Atmospheric glow shader
  const glowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x00A8FF) },
        viewVector: { value: new THREE.Vector3(0, 0, 1) },
      },
      vertexShader: `
        varying float vIntensity;
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec3 vNormel = normalize(-mvPosition.xyz);
          vIntensity = pow(0.65 - dot(vNormal, vNormel), 4.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float vIntensity;
        void main() {
          gl_FragColor = vec4(glowColor, vIntensity);
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
        {/* Main Earth surface */}
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <meshPhongMaterial
            map={dayMap}
            normalMap={normalMap}
            normalScale={new THREE.Vector2(1.5, 1.5)}
            specularMap={specularMap}
            specular={new THREE.Color(0x333333)}
            shininess={15}
          />
        </mesh>

        {/* Clouds Layer */}
        <mesh ref={cloudRef} scale={[1.01, 1.01, 1.01]}>
          <sphereGeometry args={[1, 64, 64]} />
          <meshPhongMaterial
            alphaMap={cloudsMap}
            transparent
            opacity={0.4}
            depthWrite={false}
          />
        </mesh>

        {/* Real Country Boundaries (overlay) */}
        <group scale={[1.002, 1.002, 1.002]}>
          <CountryOutlines />
        </group>

        {/* Abstract Wireframe Grid */}
        <mesh>
          <icosahedronGeometry args={[1.003, 3]} />
          <meshBasicMaterial
            color="#00B4FF"
            wireframe
            transparent
            opacity={0.04}
            depthWrite={false}
          />
        </mesh>

        <GridLines />

        {/* Sync'ed children (Arcs, Markers, etc) */}
        {children}
      </group>

      {/* Atmospheric Effects */}
      <group>
        <mesh scale={[1.12, 1.12, 1.12]}>
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
    const radius = 1.004;

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

    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  return (
    <points>
      <primitive object={linesGeo} attach="geometry" />
      <pointsMaterial
        color="#00B4FF"
        size={0.003}
        transparent
        opacity={0.1}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
