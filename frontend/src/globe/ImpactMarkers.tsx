import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { easeOutExpo } from '../utils/easing';

// ── Shared geometry pool (created once, reused for all markers) ──

// ── Cinematic Radar Markers
const _sharedCoreGeo = new THREE.CircleGeometry(0.015, 32);
const _sharedRing1Geo = new THREE.RingGeometry(0.016, 0.020, 64);
const _sharedRing2Geo = new THREE.RingGeometry(0.020, 0.024, 64);

const _materialProps = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
} as const;

function getMarkerColorHex(type: string): number {
  switch (type) {
    case 'malware': return 0xFF3737;
    case 'phishing': return 0xFF8A00;
    default: return 0x00D1FF;
  }
}

/**
 * Renders animated impact markers at source/destination positions.
 * Uses imperative Three.js objects with shared geometries for performance.
 * Source: expanding halo pulse
 * Destination: shockwave ripple
 */
export function ImpactMarkers() {
  const groupRef = useRef<THREE.Group>(null);
  const markers = useStreamStore(s => s.markers);
  const projectionMode = useStreamStore(s => s.projectionMode);

  const markerObjectsRef = useRef<Map<string, {
    core: THREE.Mesh;
    ring1: THREE.Mesh;
    ring2: THREE.Mesh | null;
    isSource: boolean;
  }>>(new Map());

  // Sync Three.js objects with marker state
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Clear everything if mode changes or if we want a fresh sync
    while (group.children.length > 0) {
      const child = group.children[0] as any;
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      group.remove(child);
    }
    markerObjectsRef.current.clear();

    // Re-add all markers
    for (const marker of markers) {
      const colorHex = getMarkerColorHex(marker.attackType);
      
      let pos: THREE.Vector3;
      let quaternion = new THREE.Quaternion();

      if (projectionMode === '3d') {
        pos = new THREE.Vector3(...marker.position);
        const normal = pos.clone().normalize();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      } else {
        const x = (marker.lon / 180) * 2.5;
        const y = (marker.lat / 90) * 1.25;
        pos = new THREE.Vector3(x, y, 0.02);
      }

      const glowColor = new THREE.Color(colorHex).multiplyScalar(4.0);

      const coreMat = new THREE.MeshBasicMaterial({ ..._materialProps, color: glowColor, opacity: 1.0 });
      const core = new THREE.Mesh(_sharedCoreGeo, coreMat);
      core.position.copy(pos);
      core.quaternion.copy(quaternion);

      const ring1Mat = new THREE.MeshBasicMaterial({ ..._materialProps, color: glowColor, opacity: 0.8 });
      const ring1 = new THREE.Mesh(_sharedRing1Geo, ring1Mat);
      ring1.position.copy(pos);
      ring1.quaternion.copy(quaternion);

      let ring2: THREE.Mesh | null = null;
      if (!marker.isSource) {
        const ring2Mat = new THREE.MeshBasicMaterial({ ..._materialProps, color: glowColor, opacity: 0.5 });
        ring2 = new THREE.Mesh(_sharedRing2Geo, ring2Mat);
        ring2.position.copy(pos);
        ring2.quaternion.copy(quaternion);
        group.add(ring2);
      }

      group.add(core);
      group.add(ring1);
      markerObjectsRef.current.set(marker.id, { core, ring1, ring2, isSource: marker.isSource });
    }
  }, [markers, projectionMode]);

  // Animate markers each frame
  useFrame(() => {
    for (const marker of markers) {
      const obj = markerObjectsRef.current.get(marker.id);
      if (!obj) continue;

      const p = marker.progress;
      if (p <= 0) {
        obj.core.visible = false;
        obj.ring1.visible = false;
        if (obj.ring2) obj.ring2.visible = false;
        continue;
      }

      obj.core.visible = true;
      obj.ring1.visible = true;

      if (obj.isSource) {
        // Source: single massive expanding radar pulse
        const pulseScale = 1 + p * 12.0; 
        const pulseOpacity = (1 - p) * 0.6;

        obj.ring1.scale.setScalar(pulseScale);
        (obj.ring1.material as THREE.MeshBasicMaterial).opacity = pulseOpacity;

        const fadeOut = Math.max(0, 1 - easeOutExpo(p));
        (obj.core.material as THREE.MeshBasicMaterial).opacity = fadeOut * 0.9;
      } else {
        // Destination: intense shockwave ripple
        const ripple1 = p * 15.0;
        const fadeOut = Math.max(0, 1 - p);

        obj.ring1.scale.setScalar(1 + ripple1);
        (obj.ring1.material as THREE.MeshBasicMaterial).opacity = fadeOut * 0.8;

        if (obj.ring2) {
          obj.ring2.visible = true;
          const ripple2 = Math.max(0, p - 0.2) * 12.0;
          obj.ring2.scale.setScalar(1 + ripple2);
          (obj.ring2.material as THREE.MeshBasicMaterial).opacity = fadeOut * 0.5;
        }

        (obj.core.material as THREE.MeshBasicMaterial).opacity = fadeOut * 1.0;
      }
    }
  });

  return <group ref={groupRef} />;
}
