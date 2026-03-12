import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { greatCirclePoints } from '../utils/geo';
import { easeOutExpo } from '../utils/easing';

const MAX_ARC_SEGMENTS = 64;

// ── Shared geometry & material pools (created once, reused for all arcs) ──

const _sharedTracerGeo = new THREE.SphereGeometry(0.02, 8, 8);
const _sharedGlowGeo = new THREE.SphereGeometry(0.06, 8, 8);

// Only 3 attack-type colors; pool materials per type
const _lineMaterials: Record<string, THREE.LineBasicMaterial> = {};
const _tracerMaterials: Record<string, THREE.MeshBasicMaterial> = {};
const _glowMaterials: Record<string, THREE.MeshBasicMaterial> = {};

function getLineMaterial(type: string): THREE.LineBasicMaterial {
  if (!_lineMaterials[type]) {
    _lineMaterials[type] = new THREE.LineBasicMaterial({
      color: getArcColorHex(type),
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }
  return _lineMaterials[type];
}

function getTracerMaterial(type: string): THREE.MeshBasicMaterial {
  if (!_tracerMaterials[type]) {
    _tracerMaterials[type] = new THREE.MeshBasicMaterial({
      color: getArcColorHex(type),
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }
  return _tracerMaterials[type];
}

function getGlowMaterial(type: string): THREE.MeshBasicMaterial {
  if (!_glowMaterials[type]) {
    _glowMaterials[type] = new THREE.MeshBasicMaterial({
      color: getArcColorHex(type),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }
  return _glowMaterials[type];
}

// Pre-allocate a large bounding sphere so we never need to recompute it
const _largeBoundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 3);

/**
 * Renders animated great-circle arcs for active attacks.
 * Uses imperative Three.js Line objects with pooled geometries/materials.
 */
export function AttackArcs() {
  const groupRef = useRef<THREE.Group>(null);
  const arcs = useStreamStore(s => s.arcs);
  const config = useStreamStore(s => s.config);

  // Store refs to line objects keyed by arc id
  const lineObjectsRef = useRef<Map<string, {
    line: THREE.Line;
    tracer: THREE.Mesh;
    tracerGlow: THREE.Mesh;
    points: THREE.Vector3[];
  }>>(new Map());

  // Sync Three.js objects with arc state
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const existingIds = new Set(lineObjectsRef.current.keys());
    const currentIds = new Set(arcs.map(a => a.id));

    // Remove old arcs
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        const obj = lineObjectsRef.current.get(id);
        if (obj) {
          group.remove(obj.line);
          group.remove(obj.tracer);
          group.remove(obj.tracerGlow);
          // Only dispose per-arc geometry (line); shared geos/mats are pooled
          obj.line.geometry.dispose();
        }
        lineObjectsRef.current.delete(id);
      }
    }

    // Add new arcs
    for (const arc of arcs) {
      if (!lineObjectsRef.current.has(arc.id)) {
        const points = greatCirclePoints(
          arc.sourceLat, arc.sourceLon,
          arc.targetLat, arc.targetLon,
          MAX_ARC_SEGMENTS
        );

        // Create line geometry (unique per arc since positions differ)
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array((MAX_ARC_SEGMENTS + 1) * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);
        // Set a fixed large bounding sphere to avoid per-frame recomputation
        geometry.boundingSphere = _largeBoundingSphere.clone();

        // Use pooled material by attack type
        const line = new THREE.Line(geometry, getLineMaterial(arc.attackType));

        // Tracer dot — shared geometry, pooled material
        const tracer = new THREE.Mesh(_sharedTracerGeo, getTracerMaterial(arc.attackType));
        tracer.visible = false;

        // Tracer glow — shared geometry, pooled material
        const tracerGlow = new THREE.Mesh(_sharedGlowGeo, getGlowMaterial(arc.attackType));
        tracerGlow.visible = false;

        group.add(line);
        group.add(tracer);
        group.add(tracerGlow);

        lineObjectsRef.current.set(arc.id, { line, tracer, tracerGlow, points });
      }
    }
  }, [arcs]);

  // Animate arcs each frame
  useFrame(() => {
    for (const arc of arcs) {
      const obj = lineObjectsRef.current.get(arc.id);
      if (!obj) continue;

      const { line, tracer, tracerGlow, points } = obj;
      const progress = arc.progress;

      if (progress <= 0) {
        line.visible = false;
        tracer.visible = false;
        tracerGlow.visible = false;
        continue;
      }

      line.visible = true;

      const easedProgress = easeOutExpo(Math.min(progress, 1));
      const headIndex = Math.floor(easedProgress * (points.length - 1));
      const tailStart = config.trails ? 0 : Math.max(0, headIndex - 30);
      const visibleCount = headIndex - tailStart + 1;

      if (visibleCount <= 1) {
        line.visible = false;
        tracer.visible = false;
        tracerGlow.visible = false;
        continue;
      }

      // Update line positions
      const positions = line.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < visibleCount; i++) {
        const pi = tailStart + i;
        const pt = points[Math.min(pi, points.length - 1)];
        positions.setXYZ(i, pt.x, pt.y, pt.z);
      }
      positions.needsUpdate = true;
      line.geometry.setDrawRange(0, visibleCount);
      // NO computeBoundingSphere() — we've pre-set a fixed large one

      // Fade opacity (shared material — set per-type, affects all arcs of same type collectively)
      // This is acceptable since arcs of same type fade similarly
      const fadeOpacity = progress > 0.75 ? Math.max(0.1, (1 - progress) / 0.25) : 0.9;
      (line.material as THREE.LineBasicMaterial).opacity = fadeOpacity;

      // Tracer position
      if (headIndex < points.length && progress < 0.95) {
        tracer.visible = true;
        tracerGlow.visible = true;
        const tracerPoint = points[headIndex];
        tracer.position.copy(tracerPoint);
        tracerGlow.position.copy(tracerPoint);
      } else {
        tracer.visible = false;
        tracerGlow.visible = false;
      }
    }
  });

  return <group ref={groupRef} />;
}

function getArcColorHex(type: string): number {
  switch (type) {
    case 'malware': return 0xFF3737;
    case 'phishing': return 0xFF8A00;
    default: return 0x00D1FF;
  }
}
