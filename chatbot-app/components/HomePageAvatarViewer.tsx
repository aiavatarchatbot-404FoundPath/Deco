'use client';
import React, { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import RpmModel from './chat/RpmModel';

type Props = {
  avatarUrl: string;
  animationUrl?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  cameraPosition?: [number, number, number];
  cameraFov?: number;
};

export default function HomePageAvatarViewer({
  avatarUrl,
  animationUrl = '/mixamo/standing_greeting.fbx',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 0.8,
  cameraPosition = [0, 1.2, 4],
  cameraFov = 35
}: Props) {
  return (
    <Canvas
      frameloop="always"
      camera={{ position: cameraPosition, fov: cameraFov }}
      shadows
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 2]} intensity={0.8} castShadow />

      <Suspense fallback={null}>
        <group position={position} rotation={rotation} scale={scale}>
          <RpmModel
            avatarUrl={avatarUrl}
            animUrls={animationUrl}
            playing={true}
            timeScale={1}
            fadeSec={0.3}
            loop={THREE.LoopRepeat}
            repetitions={Infinity}
          />
        </group>

        <Environment preset="sunset" />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={false}
        enableZoom={false}
        target={[0, 1.0, 0]}
        minDistance={3}
        maxDistance={6}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.8}
      />
    </Canvas>
  );
}