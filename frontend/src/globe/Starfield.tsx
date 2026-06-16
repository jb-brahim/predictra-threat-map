// ─── STARS BACKGROUND FIELD COMPONENT ────────────────────────────────────────
// Generates static point-cloud particles randomly distributed over a shell sphere
// to simulate stars in deep space.

import { useMemo } from 'react';
import * as THREE from 'three';

export function Starfield({ count = 3000 }: { count?: number }) {
  // ─── PARTICLE COORDINATE GENERATOR ──────────────────────────────────────────
  // Distributes particles in 3D spherical coordinates using random angles
  // (theta and phi) multiplied by a large radius.
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Random coordinates distributed on a large outer sphere shell
      const radius = 50 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      sizes[i] = Math.random() * 1.5 + 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return geo;
  }, [count]);

  return (
    <points>
      <primitive object={geometry} attach="geometry" />
      <pointsMaterial
        color="#FFFFFF"
        size={0.2}
        transparent
        opacity={0.8}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
