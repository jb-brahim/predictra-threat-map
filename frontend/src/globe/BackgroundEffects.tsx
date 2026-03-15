import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';

export function BackgroundEffects() {
  const quality = useStreamStore(s => s.config.qualityPreset);

  const groupRef = useRef<THREE.Group>(null);
  
  // Distant parallax grid
  const gridPoints = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 200; i++) {
      points.push(new THREE.Vector3(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
        -10 - Math.random() * 20
      ));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  // Moving particle streams
  const particles = useMemo(() => {
    const count = quality === 'low' ? 500 : 2000;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = -5 - Math.random() * 15;
      vel[i] = 0.5 + Math.random() * 2;
    }
    return { pos, vel };
  }, [quality]);

  const particleRef = useRef<THREE.Points>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Parallax based on mouse position
    const mouseX = state.mouse.x * 0.2;
    const mouseY = state.mouse.y * 0.2;
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, mouseX, 0.05);
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, mouseY, 0.05);

    // Animate particles
    if (particleRef.current) {
      const positions = particleRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particles.vel.length; i++) {
        positions[i * 3 + 1] -= particles.vel[i] * delta;
        if (positions[i * 3 + 1] < -20) positions[i * 3 + 1] = 20;
      }
      particleRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Distant Static Stars/Points */}
      <points geometry={gridPoints}>
        <pointsMaterial color="#00D1FF" size={0.02} transparent opacity={0.1} />
      </points>

      {/* Moving Data Particles */}
      <points ref={particleRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particles.pos, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#00A8FF"
          size={0.03}
          transparent
          opacity={0.15}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Subtle Fog Plane for Depth */}
      <mesh position={[0, 0, -8]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial color="#05080F" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
