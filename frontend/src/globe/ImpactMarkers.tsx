import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { easeOutExpo } from '../utils/easing';

// ── Shared geometry pool ──
const _sharedCoreGeo = new THREE.CircleGeometry(0.012, 12);
const _sharedPillarGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.2, 8, 1, true);
const _sharedGlowGeo = new THREE.SphereGeometry(0.03, 12, 12);

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

export function ImpactMarkers() {
  const groupRef = useRef<THREE.Group>(null);
  const markers = useStreamStore(s => s.markers);
  const projectionMode = useStreamStore(s => s.projectionMode);

  const markerObjectsRef = useRef<Map<string, {
    core: THREE.Mesh;
    pillar: THREE.Mesh;
    glow: THREE.Mesh;
    isSource: boolean;
  }>>(new Map());

  // Sync Three.js objects with marker state
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0] as any;
      if (child.geometry && child.geometry !== _sharedCoreGeo && child.geometry !== _sharedPillarGeo && child.geometry !== _sharedGlowGeo) {
         child.geometry.dispose();
      }
      if (child.material) child.material.dispose();
      group.remove(child);
    }
    markerObjectsRef.current.clear();

    for (const marker of markers) {
      const colorHex = getMarkerColorHex(marker.attackType);
      
      let pos: THREE.Vector3;
      let quaternion = new THREE.Quaternion();

      if (projectionMode === '3d') {
        pos = new THREE.Vector3(...marker.position);
        const normal = pos.clone().normalize();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal); // Pillars face normal
      } else {
        pos = new THREE.Vector3((marker.lon / 180) * 2.5, (marker.lat / 90) * 1.25, 0.02);
      }

      // Core glow dot
      const coreMat = new THREE.MeshBasicMaterial({ ..._materialProps, color: colorHex, opacity: 0.9 });
      const core = new THREE.Mesh(_sharedCoreGeo, coreMat);
      core.position.copy(pos);
      if (projectionMode === '3d') {
        const cQuat = new THREE.Quaternion();
        cQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize());
        core.quaternion.copy(cQuat);
      }

      // 3D Pillar (Histogram style)
      const pillarMat = new THREE.MeshBasicMaterial({ ..._materialProps, color: colorHex, opacity: 0.6 });
      const pillar = new THREE.Mesh(_sharedPillarGeo, pillarMat);
      pillar.position.copy(pos).add(pos.clone().normalize().multiplyScalar(0.1)); // Offset to stand on surface
      pillar.quaternion.copy(quaternion);

      // Sphere Glow
      const glowMat = new THREE.MeshBasicMaterial({ ..._materialProps, color: colorHex, opacity: 0.2 });
      const glow = new THREE.Mesh(_sharedGlowGeo, glowMat);
      glow.position.copy(pos);

      group.add(core);
      group.add(pillar);
      group.add(glow);
      markerObjectsRef.current.set(marker.id, { core, pillar, glow, isSource: marker.isSource });
    }
  }, [markers, projectionMode]);

  useFrame(() => {
    for (const marker of markers) {
      const obj = markerObjectsRef.current.get(marker.id);
      if (!obj) continue;

      const p = marker.progress;
      if (p <= 0) {
        obj.core.visible = obj.pillar.visible = obj.glow.visible = false;
        continue;
      }

      obj.core.visible = obj.pillar.visible = obj.glow.visible = true;

      const scale = easeOutExpo(Math.min(p * 4, 1));
      const fadeOut = Math.max(0, 1 - easeOutExpo(p));

      obj.pillar.scale.set(1, scale * 1.5, 1);
      (obj.pillar.material as THREE.MeshBasicMaterial).opacity = fadeOut * 0.7;
      
      obj.glow.scale.setScalar(scale * 1.2);
      (obj.glow.material as THREE.MeshBasicMaterial).opacity = fadeOut * (obj.isSource ? 0.4 : 0.6);

      (obj.core.material as THREE.MeshBasicMaterial).opacity = fadeOut * 0.9;
    }
  });

  return <group ref={groupRef} />;
}
