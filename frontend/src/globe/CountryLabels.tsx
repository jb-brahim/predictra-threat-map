import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStreamStore } from '../stream/useStreamStore';

const COUNTRIES = [
  { name: 'USA', lat: 37.09, lon: -95.71 },
  { name: 'CANADA', lat: 56.13, lon: -106.34 },
  { name: 'RUSSIA', lat: 61.52, lon: 105.31 },
  { name: 'CHINA', lat: 35.86, lon: 104.19 },
  { name: 'BRAZIL', lat: -14.23, lon: -51.92 },
  { name: 'AUSTRALIA', lat: -25.27, lon: 133.77 },
  { name: 'INDIA', lat: 20.59, lon: 78.96 },
  { name: 'GERMANY', lat: 51.16, lon: 10.45 },
  { name: 'FRANCE', lat: 46.22, lon: 2.21 },
  { name: 'UK', lat: 55.37, lon: -3.43 },
  { name: 'ALGERIA', lat: 28.03, lon: 1.65 },
  { name: 'ITALY', lat: 41.87, lon: 12.56 },
  { name: 'JAPAN', lat: 36.20, lon: 138.25 },
  { name: 'MEXICO', lat: 23.63, lon: -102.55 },
  { name: 'SOUTH AFRICA', lat: -30.55, lon: 22.93 },
  { name: 'ARGENTINA', lat: -38.41, lon: -63.61 },
];

const DEG2RAD = Math.PI / 180;

function latLonToVec3(lat: number, lon: number, r: number) {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

export function CountryLabels() {
  const projectionMode = useStreamStore(s => s.projectionMode);

  const labels = useMemo(() => {
    return COUNTRIES.map(c => {
      let pos: THREE.Vector3;
      if (projectionMode === '3d') {
        pos = latLonToVec3(c.lat, c.lon, 1.05);
      } else {
        pos = new THREE.Vector3((c.lon / 180) * 2.5, (c.lat / 90) * 1.25, 0.05);
      }
      return { ...c, pos };
    });
  }, [projectionMode]);

  return (
    <group>
      {labels.map(l => (
        <Text
          key={l.name}
          position={l.pos}
          fontSize={0.04}
          color="#8899aa"
          font="https://fonts.gstatic.com/s/orbitron/v25/yYqxRnd6CQ8G_p7704r567P_8f62.woff" // Sci-fi font
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.002}
          outlineColor="#000000"
          onBeforeRender={() => {
             // Basic billboarding - keep facing camera
             // Controlled by Text component internally mostly, but we can nudge it
          }}
        >
          {l.name}
        </Text>
      ))}
    </group>
  );
}
