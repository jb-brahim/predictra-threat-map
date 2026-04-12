import { Canvas, useFrame } from '@react-three/fiber';

import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Earth } from './Earth';
import { AttackArcs } from './AttackArcs';
import { ImpactMarkers } from './ImpactMarkers';
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
      width: '100%',
      height: '100%',
      position: 'relative',
      background: '#050B14',
      overflow: 'hidden',
    }}>
      <Canvas
        camera={{ 
          position: projectionMode === '3d' ? [0, 0, 2.8] : [0, 0, 3.2], 
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
        {/* Lighting (Deep Space in 3D, Even in 2D) */}
        <ambientLight intensity={projectionMode === '3d' ? 0.05 : 0.15} color="#ffffff" />
        <directionalLight 
          position={projectionMode === '3d' ? [10, 5, 5] : [5, 3, 5]} 
          intensity={projectionMode === '3d' ? 1.5 : 0.4} 
          color="#ffffee" 
        />
        {projectionMode !== '3d' && (
          <directionalLight position={[-5, -2, -5]} intensity={0.1} color="#0044AA" />
        )}

        {/* Background */}
        <color attach="background" args={[projectionMode === '3d' ? '#000000' : '#050B14']} />
        <fog attach="fog" args={[projectionMode === '3d' ? '#000000' : '#050B14', 5, 30]} />
        <Stars radius={100} depth={50} count={qualityPreset === 'low' ? 2000 : 5000} factor={4} saturation={0} fade speed={1} />
        {projectionMode !== '3d' && <BackgroundEffects />}

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
            luminanceThreshold={0.5}
            mipmapBlur
            intensity={0.2}
            radius={0.4}
          />
        </EffectComposer>

        {/* Animation loop */}
        <AnimationLoop />
      </Canvas>
    </div>
  );
}
