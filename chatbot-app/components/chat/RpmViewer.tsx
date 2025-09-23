'use client';
import React, { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import RpmModel from './RpmModel';

type Props = {
  src?: string | null;
  userUrl?: string | null;
  aiUrl?: string | null;
  assistantTalking?: boolean;
  singleYaw?: number;
  singleLookAt?: [number, number, number];
};

const DEFAULT_LOOK_TARGET = new THREE.Vector3(0, 1.2, 2);

export default function RpmViewer(props: Props) {
  const userUrl = props.userUrl ?? null;
  const aiUrl = props.aiUrl ?? null;
  const singleSrc = props.src ?? null;

  const hasUser = !!userUrl;
  const hasCompanion = !!aiUrl;
  const duo = hasUser && hasCompanion;
  const separationX = 2.6;
  const depthOffset = 0.7;

  const userPosition: [number, number, number] = hasUser
    ? duo
      ? [-separationX, 0, depthOffset]
      : [0, 0, 0]
    : [0, 0, 0];

  const companionPosition: [number, number, number] = hasCompanion
    ? duo
      ? [separationX, 0, -depthOffset]
      : [0, 0, 0]
    : [0, 0, 0];

  const userLookTarget = useMemo(() => {
    if (duo && hasCompanion) {
      return new THREE.Vector3(companionPosition[0], 1.4, companionPosition[2]);
    }
    return DEFAULT_LOOK_TARGET;
  }, [duo, hasCompanion, companionPosition[0], companionPosition[1], companionPosition[2]]);

  const companionLookTarget = useMemo(() => {
    if (duo && hasUser) {
      return new THREE.Vector3(userPosition[0], 1.4, userPosition[2]);
    }
    return DEFAULT_LOOK_TARGET;
  }, [duo, hasUser, userPosition[0], userPosition[1], userPosition[2]]);

  const singleYaw = props.singleYaw ?? 0;
  const singleLookTarget = useMemo(() => {
    if (props.singleLookAt) {
      const [x, y, z] = props.singleLookAt;
      return new THREE.Vector3(x, y, z);
    }
    return DEFAULT_LOOK_TARGET;
  }, [props.singleLookAt?.[0], props.singleLookAt?.[1], props.singleLookAt?.[2]]);

  const camera = useMemo(
    () =>
      duo
        ? { position: [0, 1.35, 4.2] as [number, number, number], fov: 30 }
        : { position: [0, 1.35, 2.6] as [number, number, number], fov: 30 },
    [duo]
  );

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
                position={userPosition}
                yaw={-Math.PI / 2 + 0.1}
                lookAt={userLookTarget}
                talk={false}
                scale={1}
              />
            )}

            {/* AI (right) */}
            {aiUrl && (
              <RpmModel
                key={`ai-${aiUrl}`}
                src={aiUrl}
                position={companionPosition}
                yaw={Math.PI / 2 - 0.1}
                lookAt={companionLookTarget}
                talk={!!(props as any).assistantTalking}
                scale={1}
              />
            )}
          </>
        ) : (
          // Single
          <RpmModel
            src={singleSrc ?? userUrl ?? aiUrl}
            position={[0, 0, 0]}
            yaw={singleYaw}
            talk={!!props.assistantTalking}
            lookAt={singleLookTarget}
          />
        )}


        <Environment preset="park" background />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, 1.1, 0]}
        minDistance={duo ? 2.8 : 2}
        maxDistance={duo ? 5.2 : 4.2}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}
