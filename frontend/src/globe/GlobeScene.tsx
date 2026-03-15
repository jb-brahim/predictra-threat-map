import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Earth } from './Earth';
import { AttackArcs } from './AttackArcs';
import { ImpactMarkers } from './ImpactMarkers';
import { Starfield } from './Starfield';
import { useStreamStore } from '../stream/useStreamStore';
import { perfTelemetry } from '../utils/perf';

/**
 * Animation loop that ticks the store and updates perf telemetry.
 */
function AnimationLoop() {
  const tick = useStreamStore(s => s.tick);

  useFrame(() => {
    tick(Date.now());
    perfTelemetry.updateFPS();
  });

  return null;
}

/**
 * Main GlobeScene — the R3F Canvas with all 3D layers.
 */
export function GlobeScene() {
  const qualityPreset = useStreamStore(s => s.config.qualityPreset);

  const bloomIntensity = useMemo(() =>
    qualityPreset === 'cinematic' ? 1.2
    : qualityPreset === 'high' ? 0.8 : 0.4,
  [qualityPreset]);

  const setSelectedCountry = useStreamStore(s => s.setSelectedCountry);
  const setView = useStreamStore(s => s.setView);

  const handleGlobeClick = (e: any) => {
    // Only handle direct clicks on the globe
    const mesh = e.intersections?.[0]?.object;
    if (!mesh) return;

    const point = e.intersections[0].point;
    const vector = new THREE.Vector3().copy(point).normalize();
    
    // Convert 3D point to Lat/Lon
    const lat = Math.asin(vector.y) * (180 / Math.PI);
    const lon = Math.atan2(vector.z, -vector.x) * (180 / Math.PI);

    // We'll use a simple "selected" state for now. 
    // In a real app we'd use a geo-lookup library here.
    // For now, we'll set it to a generic "Selected Region" and show the dashboard.
    // We can enhance this later with a geo-lookup util.
    setSelectedCountry(`Region at ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`);
    setView('country');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      background: '#05080F',
    }}>
      <Canvas
        onClick={handleGlobeClick}
        camera={{ position: [0, 0, 2.8], fov: 45, near: 0.1, far: 1000 }}
        gl={{
          antialias: qualityPreset !== 'low',
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
        }}
        dpr={qualityPreset === 'low' ? 1 : Math.min(window.devicePixelRatio, 2)}
      >
        {/* Lighting */}
        <ambientLight intensity={0.15} color="#4488CC" />
        <directionalLight position={[5, 3, 5]} intensity={0.4} color="#88BBFF" />
        <directionalLight position={[-5, -2, -5]} intensity={0.1} color="#0044AA" />

        {/* Background */}
        <color attach="background" args={['#05080F']} />
        <fog attach="fog" args={['#05080F', 5, 30]} />
        <Starfield count={qualityPreset === 'low' ? 1000 : 3000} />

        {/* Globe and Attacks */}
        <Earth>
          <AttackArcs />
          <ImpactMarkers />
        </Earth>

        {/* Controls */}
        <OrbitControls
          enablePan={false}
          minDistance={1.5}
          maxDistance={6}
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
          autoRotate={false}
        />

        {/* Post-processing */}
        {qualityPreset !== 'low' && (
          <EffectComposer>
            <Bloom
              intensity={bloomIntensity}
              luminanceThreshold={0.2}
              luminanceSmoothing={0.9}
              radius={0.8}
            />
          </EffectComposer>
        )}

        {/* Animation loop */}
        <AnimationLoop />
      </Canvas>
    </div>
  );
}
