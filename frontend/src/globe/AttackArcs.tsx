// ─── ATTACK ARCS VISUALIZER COMPONENT ─────────────────────────────────────────
// Renders the 3D curves connecting the source attacker and target victim.
// Animates a tracer sphere along the curve using an exponential ease-out function.

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';
import { greatCirclePoints } from '../utils/geo';
import { easeOutExpo } from '../utils/easing';

const MAX_ARC_SEGMENTS = 64;

// ─── GEOMETRY & MATERIAL POOLS ───────────────────────────────────────────────
// Preallocates static geometry and material definitions to prevent GPU memory
// reallocation spikes during high-frequency attack streaming.
const _sharedTracerGeo = new THREE.SphereGeometry(0.015, 6, 6);
const _sharedGlowGeo = new THREE.SphereGeometry(0.04, 6, 6);

const _lineMaterials: Record<string, THREE.LineBasicMaterial> = {};
const _tracerMaterials: Record<string, THREE.MeshBasicMaterial> = {};
const _glowMaterials: Record<string, THREE.MeshBasicMaterial> = {};

function getLineMaterial(type: string): THREE.LineBasicMaterial {
  if (!_lineMaterials[type]) {
    _lineMaterials[type] = new THREE.LineBasicMaterial({
      color: getArcColorHex(type),
      transparent: true,
      opacity: 0.9,
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
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }
  return _glowMaterials[type];
}

const _largeBoundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 3);

export function AttackArcs() {
  const groupRef = useRef<THREE.Group>(null);
  const arcs = useStreamStore(s => s.arcs);
  const config = useStreamStore(s => s.config);

  const lineObjectsRef = useRef<Map<string, {
    line: THREE.Line;
    tracer: THREE.Mesh;
    tracerGlow: THREE.Mesh;
    points: THREE.Vector3[];
  }>>(new Map());

  const projectionMode = useStreamStore(s => s.projectionMode);

  // ─── LIFECYCLE SYNC ────────────────────────────────────────────────────────
  // Creates, updates, or disposes Three.js meshes based on changes in active
  // streamed arcs or projection mode toggles.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const existingIds = new Set(lineObjectsRef.current.keys());
    const currentIds = new Set(arcs.map(a => a.id));

    // Cleanup retired arcs to free GPU memory
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        const obj = lineObjectsRef.current.get(id);
        if (obj) {
          group.remove(obj.line);
          group.remove(obj.tracer);
          group.remove(obj.tracerGlow);
          obj.line.geometry.dispose();
        }
        lineObjectsRef.current.delete(id);
      }
    }

    // Instantiates new line segments and assigns shared materials
    for (const arc of arcs) {
      const existing = lineObjectsRef.current.get(arc.id);
      
      if (!existing) {
        let points: THREE.Vector3[] = [];
        if (projectionMode === '3d') {
          // 3D Spherical Coordinates using Great Circle path
          points = greatCirclePoints(
            arc.sourceLat, arc.sourceLon,
            arc.targetLat, arc.targetLon,
            MAX_ARC_SEGMENTS,
            1.052
          );
        } else {
          // 2D Cartesian Coordinates using Bezier curves
          const x1 = (arc.sourceLon / 180) * 2.5;
          const y1 = (arc.sourceLat / 90) * 1.25;
          const x2 = (arc.targetLon / 180) * 2.5;
          const y2 = (arc.targetLat / 90) * 1.25;
          
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(x1, y1, 0.02),
            new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, 0.4),
            new THREE.Vector3(x2, y2, 0.02)
          );
          points = curve.getPoints(MAX_ARC_SEGMENTS);
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array((MAX_ARC_SEGMENTS + 1) * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);
        geometry.boundingSphere = _largeBoundingSphere.clone();

        const line = new THREE.Line(geometry, getLineMaterial(arc.attackType));
        const tracer = new THREE.Mesh(_sharedTracerGeo, getTracerMaterial(arc.attackType));
        const tracerGlow = new THREE.Mesh(_sharedGlowGeo, getGlowMaterial(arc.attackType));

        if (projectionMode === '2d') {
          tracer.scale.setScalar(1.5);
          tracerGlow.scale.setScalar(1.5);
        }

        group.add(line);
        group.add(tracer);
        group.add(tracerGlow);

        lineObjectsRef.current.set(arc.id, { line, tracer, tracerGlow, points });
      }
    }
  }, [arcs, projectionMode]);

  // ─── FRAME RENDER LOOP ──────────────────────────────────────────────────────
  // Triggers each frame via R3F's animation scheduler. Updates the line draws and
  // positions the leading tracers according to the easeOutExpo interpolation.
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

      const positions = line.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < visibleCount; i++) {
        const pi = tailStart + i;
        const pt = points[Math.min(pi, points.length - 1)];
        positions.setXYZ(i, pt.x, pt.y, pt.z);
      }
      positions.needsUpdate = true;
      line.geometry.setDrawRange(0, visibleCount);

      const fadeOpacity = progress > 0.75 ? Math.max(0.1, (1 - progress) / 0.25) : 0.9;
      (line.material as THREE.LineBasicMaterial).opacity = fadeOpacity;

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
