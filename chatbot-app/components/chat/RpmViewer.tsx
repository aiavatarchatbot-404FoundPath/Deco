'use client';
import React, { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import RpmModel from './RpmModel';

type Props =
  | { src?: string | null; userUrl?: never; aiUrl?: never; assistantTalking?: boolean }
  | { src?: never; userUrl?: string | null; aiUrl?: string | null; assistantTalking?: boolean };

export default function RpmViewer(props: Props) {
  const userUrl = (props as any).userUrl ?? null;
  const aiUrl = (props as any).aiUrl ?? null;
  const duo = userUrl != null || aiUrl != null;

  // Positions + yaw
  const leftPos: [number, number, number] = [-1.1, 0, 0];
  const rightPos: [number, number, number] = [1.1, 0, 0];
  const leftYaw = -Math.PI / 2 + 0.08;
  const rightYaw = Math.PI / 2 - 0.08;

  // Look targets
  const rightTarget = useMemo(() => new THREE.Vector3(...rightPos), []);
  const leftTarget = useMemo(() => new THREE.Vector3(...leftPos), []);

  const camera = duo
    ? { position: [0, 1.35, 3.2] as [number, number, number], fov: 30 }
    : { position: [0, 1.35, 2.6] as [number, number, number], fov: 30 };

  return (
    <Canvas camera={camera} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={0.85} castShadow />

      <Suspense fallback={null}>
        {duo ? (
          <>
            {/* USER (left) */}
            {userUrl && (
              <RpmModel
                key={`user-${userUrl}`}
                src={userUrl}
                position={leftPos}
                yaw={leftYaw}
                lookAt={rightTarget}
                talk={false}
                scale={1}
              />
            )}

            {/* AI (right) */}
            {aiUrl && (
              <RpmModel
                key={`ai-${aiUrl}`}
                src={aiUrl}
                position={rightPos}
                yaw={rightYaw}
                lookAt={leftTarget}
                talk={!!(props as any).assistantTalking}
                scale={1}
              />
            )}
          </>
        ) : (
          // Single
          <RpmModel
            src={(props as any).src}
            position={[0, 0, 0]}
            yaw={0}
            talk={false}
          />
        )}

        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]} receiveShadow>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#333" roughness={0.1} metalness={0.2} />
        </mesh>

        <Environment preset="sunset" background />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, 1.1, 0]}
        minDistance={1.8}
        maxDistance={3.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}
