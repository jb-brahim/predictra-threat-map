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
      background: '#05080F',
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
          enablePan={projectionMode === '2d'}
          minDistance={1.5}
          maxDistance={6}
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={projectionMode === '3d' ? 0.5 : 0}
          zoomSpeed={0.8}
          autoRotate={false}
          maxPolarAngle={projectionMode === '3d' ? Math.PI : Math.PI / 2}
          minPolarAngle={projectionMode === '3d' ? 0 : Math.PI / 2}
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
