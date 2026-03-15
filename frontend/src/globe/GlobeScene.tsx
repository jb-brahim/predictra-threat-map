import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Scanline } from '@react-three/postprocessing';
import { Earth } from './Earth';
import { AttackArcs } from './AttackArcs';
import { ImpactMarkers } from './ImpactMarkers';
import { Starfield } from './Starfield';
import { BackgroundEffects } from './BackgroundEffects';
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
  const { qualityPreset } = useStreamStore(s => s.config); // Modified this line
  const projectionMode = useStreamStore(s => s.projectionMode);

  // Removed bloomIntensity as it was unused.
  // const bloomIntensity = useMemo(() =>
  //   qualityPreset === 'cinematic' ? 1.2
  //   : qualityPreset === 'high' ? 0.8 : 0.4,
  // [qualityPreset]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      background: '#05080F',
    }}>
      <Canvas
        camera={{ 
          position: projectionMode === '3d' ? [0, 0, 2.8] : [0, -0.8, 3.2], 
          fov: 45, 
          near: 0.1, 
          far: 1000 
        }}
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
        <BackgroundEffects />

        {/* Global Tech Grid (Static Background) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, -5]}>
          <planeGeometry args={[100, 100, 50, 50]} />
          <meshBasicMaterial 
            color="#00A8FF" 
            transparent 
            opacity={0.03} 
            wireframe 
          />
        </mesh>

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
          rotateSpeed={projectionMode === '3d' ? 0.5 : 0.1} // Allow slight tilt in 2D
          zoomSpeed={0.8}
          autoRotate={false}
          maxPolarAngle={projectionMode === '3d' ? Math.PI : Math.PI / 1.8} // Prevent flipping in 2D
          minPolarAngle={projectionMode === '3d' ? 0 : Math.PI / 4} // Allow looking "ahead"
        />

        {/* Post-processing */}
        <EffectComposer multisampling={qualityPreset === 'low' ? 0 : 8}>
          <Bloom
            luminanceThreshold={0.25}
            mipmapBlur
            intensity={0.4}
            radius={0.4}
          />
          {qualityPreset !== 'low' ? (
            <>
              <ChromaticAberration
                offset={new THREE.Vector2(0.001, 0.001)}
                radialModulation={false}
                modulationOffset={0}
              />
              <Vignette eskil={false} offset={0.1} darkness={0.5} />
              <Scanline density={1} opacity={0.05} />
            </>
          ) : <></>}
        </EffectComposer>

        {/* Animation loop */}
        <AnimationLoop />
      </Canvas>
    </div>
  );
}
