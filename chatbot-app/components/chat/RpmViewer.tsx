'use client';
import './reactInternalsPolyfill';
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
  singleLookAt?: [number, number, number] | null;
  talkOverride?: boolean;
};

const DEFAULT_LOOK_TARGET = new THREE.Vector3(0, 1.2, 2);

export default function RpmViewer(props: Props) {
  const userUrl = props.userUrl ?? null;
  const aiUrl = props.aiUrl ?? null;
  const singleSrc = props.src ?? null;

  const hasUser = !!userUrl;
  const hasCompanion = !!aiUrl;

  const duo = hasUser && hasCompanion;
  const isSeparate = (hasUser && !hasCompanion) || (!hasUser && hasCompanion); // NEW: separate-container mode
  const separationX = 4;
  const duoScale = 0.6;
  const singleScale = 0.68; // larger avatars while fitting frame

  const userPosition: [number, number, number] = duo ? [-separationX, 0, 0] : [0, 0, 0];
  const companionPosition: [number, number, number] = duo ? [separationX, 0, 0] : [0, 0, 0];

  // In one-canvas duo mode, keep these as you had them
  const duoUserYaw = -Math.PI / 2;
  const duoCompanionYaw = Math.PI / 2;

  const userLookTarget = useMemo(() => {
    if (!duo || !hasUser) return null;
    return new THREE.Vector3(0, 1.35, 0);
  }, [duo, hasUser]);

  const companionLookTarget = useMemo(() => {
    if (!duo || !hasCompanion) return null;
    return new THREE.Vector3(0, 1.35, 0);
  }, [duo, hasCompanion]);

  // NEW: local “center” targets for separate canvases
  const centerLookTargetLeft  = useMemo(() => new THREE.Vector3( 2.0, 1.35, 0), []);
  const centerLookTargetRight = useMemo(() => new THREE.Vector3(-2.0, 1.35, 0), []);

  // NEW: fixed yaws (RPM forward ≈ -Z)
  // Face inward but bias toward the camera so they aren't perfectly profile
  const leftFaceRightYaw = Math.PI / 2;
  const rightFaceLeftYaw = -Math.PI / 2;
  const frontBias = 0.6; // stronger front bias in radians (~34°)

  const singleYaw = props.singleYaw ?? 0;
  const singleLookTarget = useMemo(() => {
    if (props.singleLookAt === null) return null;
    if (props.singleLookAt) {
      const [x, y, z] = props.singleLookAt;
      return new THREE.Vector3(x, y, z);
    }
    return DEFAULT_LOOK_TARGET;
  }, [props.singleLookAt]);

  // Force visible talking motion for now
  const talkState = true;

  // Camera presets
  const camera = useMemo(
    () =>
      duo
        ? ({ position: [0, 1.55, 8.2] as [number, number, number], fov: 36 })
        : ({ position: [0, 1.2, 4.5] as [number, number, number], fov: 28 }),
    [duo]
  );

  return (
    <Canvas
      frameloop="always"
      camera={camera}
      shadows
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
    >
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
                yaw={duoUserYaw + frontBias}
                lookAt={userLookTarget}
                talk={talkState}
                scale={duoScale}
              />
            )}

            {/* AI (right) */}
            {aiUrl && (
              <RpmModel
                key={`ai-${aiUrl}`}
                src={aiUrl}
                position={companionPosition}
                yaw={duoCompanionYaw - frontBias}
                lookAt={companionLookTarget}
                talk={talkState}
                scale={duoScale}
              />
            )}
          </>
        ) : isSeparate ? (
          // NEW: Separate-container mode (exactly one avatar in this canvas)
          <>
            {hasUser && (
              <RpmModel
                key={`user-separate-${userUrl}`}
                src={userUrl}
                position={[0, 0, 0]}
                yaw={(leftFaceRightYaw + Math.PI) + frontBias}
                lookAt={centerLookTargetLeft}  // bias head toward center
                talk={talkState}
                scale={singleScale}
              />
            )}
            {hasCompanion && (
              <RpmModel
                key={`ai-separate-${aiUrl}`}
                src={aiUrl}
                position={[0, 0, 0]}
                yaw={(rightFaceLeftYaw + Math.PI) - frontBias}
                lookAt={centerLookTargetRight}
                talk={talkState}
                scale={singleScale}
              />
            )}
          </>
        ) : (
          // Single-preview fallback (uses src or one of the urls)
          <RpmModel
            src={singleSrc ?? userUrl ?? aiUrl}
            position={[0, -0.2, 0]}
            yaw={singleYaw}
            talk={talkState}
            lookAt={singleLookTarget}
            scale={singleScale}
          />
        )}

        <Environment preset="park" />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={false}
        enableZoom={false}
        target={duo ? [0, 1.2, 0] : [0, 1.0, 0]}
        minDistance={duo ? 4 : 2.5}
        maxDistance={duo ? 7 : 5.5}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}
