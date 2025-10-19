'use client';
import './reactInternalsPolyfill';
import React, { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows } from '@react-three/drei';
import RpmModel from './RpmModel';


type Props = {
  src?: string | null;
  userUrl?: string | null;
  aiUrl?: string | null;
  assistantTalking?: boolean;
  singleYaw?: number;
  singleLookAt?: [number, number, number] | null;
  talkOverride?: boolean;
  actor?: 'user' | 'ai';
};

const DEFAULT_LOOK_TARGET = new THREE.Vector3(0, 1.2, 2);

const RpmViewer = React.memo(function RpmViewer(props: Props) {
  console.log('[RpmViewer] Component rendering with props:', {
    assistantTalking: props.assistantTalking,
    talkOverride: props.talkOverride,
    actor: props.actor
  });
  
  const userUrl = props.userUrl ?? null;
  const aiUrl   = props.aiUrl ?? null;
  const singleSrc = props.src ?? null;

  const hasUser = !!userUrl;
  const hasCompanion = !!aiUrl;

  const duo = hasUser && hasCompanion;
  const isSeparate = (hasUser && !hasCompanion) || (!hasUser && hasCompanion);
  const separationX = 4;
  const duoScale = 0.6;
  const singleScale = 0.68;
  const GROUND_Y = -0.12; // nudge up so shoes are clearly visible

  const userPosition: [number, number, number] = duo ? [-separationX, GROUND_Y, 0] : [0, GROUND_Y, 0];
  const companionPosition: [number, number, number] = duo ? [separationX, GROUND_Y, 0] : [0, GROUND_Y, 0];

  // Yaw so both face each other (tweak signs if needed for your GLBs)
  const duoUserYaw = -Math.PI / 2;      // left avatar faces toward center
  const duoCompanionYaw = Math.PI / 2;  // right avatar faces toward center

  const frontBias = 0.25; // slight camera bias
  const leftFaceRightYaw = Math.PI / 2;
  const rightFaceLeftYaw = -Math.PI / 2;

  const singleYaw = props.singleYaw ?? 0;
  const singleLookTarget = useMemo(() => {
    if (props.singleLookAt === null) return null;
    if (props.singleLookAt) {
      const [x, y, z] = props.singleLookAt;
      return new THREE.Vector3(x, y, z);
    }
    return DEFAULT_LOOK_TARGET;
  }, [props.singleLookAt]);

  // talking states per avatar
  const userTalking = Boolean(props.talkOverride ?? false);
  const aiTalking = Boolean(props.talkOverride ?? false);  // Both use talkOverride now

  // camera presets
  const camera = useMemo(
    () =>
      duo
        ? ({ position: [0, 1.55, 8.2] as [number, number, number], fov: 36 })
        : ({ position: [0, 1.2, 4.5] as [number, number, number], fov: 28 }),
    [duo]
  );

  // Paths to FBX clips (ensure these files exist under public/)
  const idleFbx = '/mixamo/breathing_idle.fbx';
  const userTalkFbx = '/mixamo/Talking_user.fbx';
  const aiTalkFbx = '/mixamo/Talking_ai.fbx';

  // Memoize animation URLs to prevent unnecessary re-renders
  const userAnimUrl = useMemo(() => {
    const url = userTalking ? userTalkFbx : idleFbx;
    console.log('[RpmViewer] User animation URL changed:', { userTalking, url });
    return url;
  }, [userTalking]);
  
  const aiAnimUrl = useMemo(() => {
    const url = aiTalking ? aiTalkFbx : idleFbx;
    console.log('[RpmViewer] AI animation URL changed:', { aiTalking, url });
    return url;
  }, [aiTalking]);

  return (
    <Canvas
      frameloop="always"
      camera={camera}
      shadows
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={0.85} castShadow />

      <Suspense fallback={null}>
        {duo ? (
          <>
            {/* USER (left) */}
            {userUrl && (
              <group position={userPosition} rotation={[ -0.08, duoUserYaw + frontBias, 0 ]} scale={duoScale}>
                <RpmModel
                  avatarUrl={userUrl}
                  animUrls={userAnimUrl}
                  playing={true}
                  timeScale={1}
                  fadeSec={0.3}
                  loop={THREE.LoopRepeat}
                  repetitions={Infinity}
                />
              </group>
            )}

            {/* AI (right) */}
            {aiUrl && (
              <group position={companionPosition} rotation={[ -0.08, duoCompanionYaw - frontBias, 0 ]} scale={duoScale}>
                <RpmModel
                  avatarUrl={aiUrl}
                  animUrls={aiAnimUrl}
                  playing={true}
                  timeScale={1}
                  fadeSec={0.3}
                  loop={THREE.LoopRepeat}
                  repetitions={Infinity}
                />
              </group>
            )}
          </>
        ) : isSeparate ? (
          <>
            {hasUser && (
              <group position={[0, GROUND_Y, 0]} rotation={[ -0.08, leftFaceRightYaw + frontBias, 0 ]} scale={singleScale}>
                <RpmModel
                  avatarUrl={userUrl!}
                  animUrls={userAnimUrl}
                  playing={true}
                  timeScale={1}
                  fadeSec={0.3}
                  loop={THREE.LoopRepeat}
                  repetitions={Infinity}
                />
              </group>
            )}
            {hasCompanion && (
              <group position={[0, GROUND_Y, 0]} rotation={[ -0.08, rightFaceLeftYaw - frontBias, 0 ]} scale={singleScale}>
                <RpmModel
                  avatarUrl={aiUrl!}
                  animUrls={aiAnimUrl}
                  playing={true}
                  timeScale={1}
                  fadeSec={0.3}
                  loop={THREE.LoopRepeat}
                  repetitions={Infinity}
                />
              </group>
            )}
          </>
        ) : (
          // Single-preview fallback (src or either url)
          <group position={[0, GROUND_Y, 0]} rotation={[ -0.08, singleYaw, 0 ]} scale={singleScale}>
            <RpmModel
              avatarUrl={(singleSrc ?? userUrl ?? aiUrl) as string}
              animUrls={
                (props.actor ?? (userUrl ? 'user' : 'ai')) === 'user'
                  ? userAnimUrl
                  : aiAnimUrl
              }
              playing={true}
              timeScale={1}
              fadeSec={0.3}
              loop={THREE.LoopRepeat}
              repetitions={Infinity}
            />
          </group>
        )}

        {/* Ground contact shadow to anchor feet visually */}
        <ContactShadows
          position={[0, GROUND_Y + 0.001, 0]}
          scale={12}
          opacity={0.45}
          blur={2.2}
          far={4}
          frames={1}
        />

        {/* Room-like HDRI for image-based lighting only (no per-canvas background) */}
        <Environment preset="lobby" />
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
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  return (
    prevProps.src === nextProps.src &&
    prevProps.userUrl === nextProps.userUrl &&
    prevProps.aiUrl === nextProps.aiUrl &&
    prevProps.talkOverride === nextProps.talkOverride &&
    prevProps.singleYaw === nextProps.singleYaw &&
    prevProps.actor === nextProps.actor &&
    JSON.stringify(prevProps.singleLookAt) === JSON.stringify(nextProps.singleLookAt)
  );
});

export default RpmViewer;
  
