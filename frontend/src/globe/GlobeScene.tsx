// ─── 3D GLOBE / 2D MAP CANVA CONTAINER ────────────────────────────────────────
// Sets up the React Three Fiber viewport canvas, loads lights, camera limits,
// controls, environment particle fields, and postprocessing bloom layers.

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Earth } from './Earth';
import { AttackArcs } from './AttackArcs';
import { ImpactMarkers } from './ImpactMarkers';
import { BackgroundEffects } from './BackgroundEffects';
import { useStreamStore } from '../stream/useStreamStore';
import { perfTelemetry } from '../utils/perf';

// ─── FRAME TICK TRIGGER ──────────────────────────────────────────────────────
// An animation helper rendering frames inside the loop to tick state managers
// and update browser rendering stats.
function AnimationLoop() {
  const tick = useStreamStore(s => s.tick);

  useFrame(() => {
    tick(Date.now());
    perfTelemetry.updateFPS();
  });

  return null;
}

export function GlobeScene() {
  const { qualityPreset } = useStreamStore(s => s.config);
  const projectionMode = useStreamStore(s => s.projectionMode);

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
        {/* ─── LIGHTING LAYERS ────────────────────────────────────────────────── */}
        <ambientLight intensity={projectionMode === '3d' ? 0.05 : 0.15} color="#ffffff" />
        <directionalLight 
          position={projectionMode === '3d' ? [10, 5, 5] : [5, 3, 5]} 
          intensity={projectionMode === '3d' ? 1.5 : 0.4} 
          color="#ffffee" 
        />
        {projectionMode !== '3d' && (
          <directionalLight position={[-5, -2, -5]} intensity={0.1} color="#0044AA" />
        )}

        {/* ─── ENVIRONMENT BACKGROUNDS ────────────────────────────────────────── */}
        <color attach="background" args={[projectionMode === '3d' ? '#000000' : '#050B14']} />
        <fog attach="fog" args={[projectionMode === '3d' ? '#000000' : '#050B14', 5, 30]} />
        <Stars radius={100} depth={50} count={qualityPreset === 'low' ? 2000 : 5000} factor={4} saturation={0} fade speed={1} />
        {projectionMode !== '3d' && <BackgroundEffects />}

        {/* ─── BACKGROUND STATIC DECORATIVE TECH GRID ─────────────────────────── */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, -5]}>
          <planeGeometry args={[100, 100, 50, 50]} />
          <meshBasicMaterial 
            color="#00A8FF" 
            transparent 
            opacity={0.03} 
            wireframe 
          />
        </mesh>

        {/* ─── PHYSICAL GLOBE & CYBER ARC COMPOSITES ──────────────────────────── */}
        <Earth>
          <AttackArcs />
          <ImpactMarkers />
        </Earth>

        {/* ─── INTERACTION CONTROLLERS ────────────────────────────────────────── */}
        <OrbitControls
          enablePan={projectionMode === '2d'}
          minDistance={1.5}
          maxDistance={6}
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={projectionMode === '3d' ? 0.5 : 0.1}
          zoomSpeed={0.8}
          autoRotate={false}
          maxPolarAngle={projectionMode === '3d' ? Math.PI : Math.PI / 1.8}
          minPolarAngle={projectionMode === '3d' ? 0 : Math.PI / 4}
        />

        {/* ─── POSTPROCESSING COMBINED GLOW COMPOSERS ─────────────────────────── */}
        <EffectComposer multisampling={qualityPreset === 'low' ? 0 : 8}>
          <Bloom
            luminanceThreshold={0.5}
            mipmapBlur
            intensity={0.2}
            radius={0.4}
          />
        </EffectComposer>

        <AnimationLoop />
      </Canvas>
    </div>
  );
}
