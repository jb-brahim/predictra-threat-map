import { useMemo } from 'react';
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
  const projectionMode = useStreamStore(s => s.projectionMode);

  const bloomIntensity = useMemo(() =>
    qualityPreset === 'cinematic' ? 1.2
    : qualityPreset === 'high' ? 0.8 : 0.4,
  [qualityPreset]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      background: '#020408', // Darker background
    }}>
      <Canvas
        camera={{ position: [0, 0, projectionMode === '3d' ? 2.8 : 3.5], fov: 45, near: 0.1, far: 1000 }}
        gl={{
          antialias: qualityPreset !== 'low',
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
        }}
        dpr={qualityPreset === 'low' ? 1 : Math.min(window.devicePixelRatio, 2)}
      >
        {/* Lighting - Restored intensity */}
        <ambientLight intensity={0.4} color="#4488CC" />
        <directionalLight position={[5, 3, 5]} intensity={0.8} color="#88BBFF" />
        <directionalLight position={[-5, -2, -5]} intensity={0.2} color="#0044AA" />
        <pointLight position={[0, 8, 0]} intensity={1.5} color="#00ffaa" /> {/* Top aurora light */}

        {/* Background */}
        <color attach="background" args={['#020408']} />
        <fog attach="fog" args={['#020408', 5, 20]} />
        <Starfield count={qualityPreset === 'low' ? 1000 : 4000} />

        {/* Globe and Attacks */}
        <Earth>
          <AttackArcs />
          <ImpactMarkers />
        </Earth>

        {/* Controls */}
        <OrbitControls
          enablePan={projectionMode === '2d'}
          minDistance={1.4}
          maxDistance={6}
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={projectionMode === '3d' ? 0.3 : 0}
          zoomSpeed={0.8}
          autoRotate={false}
          maxPolarAngle={projectionMode === '3d' ? Math.PI : Math.PI / 2}
          minPolarAngle={projectionMode === '3d' ? 0 : Math.PI / 2}
        />

        {/* Post-processing - Higher intensity Bloom for Kaspersky look */}
        {qualityPreset !== 'low' && (
          <EffectComposer multisampling={4}>
            <Bloom
              intensity={bloomIntensity * 1.5}
              luminanceThreshold={0.15}
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
