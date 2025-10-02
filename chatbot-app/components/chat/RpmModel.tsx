'use client';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';

const isBone = (object: THREE.Object3D | null): object is THREE.Bone => !!object && object.type === 'Bone';

type Props = {
  src?: string | null;
  /** place in world */
  position?: [number, number, number];
  /** face roughly this yaw (radians) */
  yaw?: number;
  /** world-space target to look at (head only) */
  lookAt?: THREE.Vector3 | null;
  /** adds subtle “talking” micro-motions */
  talk?: boolean;
  /** overall scale */
  scale?: number;
};

export default function RpmModel({
  src,
  position = [0, 0, 0],
  yaw = 0,
  lookAt = null,
  talk = false,
  scale = 1.0,
}: Props) {
  const group = useRef<THREE.Group>(null);

  const url = useMemo(
    () => (src ? (src.endsWith('.glb') ? src : `${src}.glb`) : null),
    [src]
  );

  const { scene, animations } = useGLTF(url || '', true);
  const cloned = useMemo(() => scene.clone(), [scene]);

  // Enable shadows
  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
  }, [cloned]);

  const { actions } = useAnimations(animations, group);

  // Find head bone
  const headRef = useRef<THREE.Bone | null>(null);
  const chestRef = useRef<THREE.Bone | null>(null);
  const chestBaseX = useRef<number>(0);
  const leftArmRef = useRef<THREE.Bone | null>(null);
  const rightArmRef = useRef<THREE.Bone | null>(null);
  const leftArmBase = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const rightArmBase = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  useEffect(() => {
    headRef.current = null;
    chestRef.current = null;
    leftArmRef.current = null;
    rightArmRef.current = null;

    let head: THREE.Bone | null = null;
    cloned.traverse((o: THREE.Object3D) => {
      if (!head && isBone(o) && /HeadTop_End|Head/i.test(o.name)) {
        head = o;
      }
      if (!chestRef.current && isBone(o) && /(Spine2|Spine1|Chest|UpperChest)/i.test(o.name)) {
        chestRef.current = o;
        chestBaseX.current = o.rotation.x;
      }
      if (!leftArmRef.current && isBone(o) && /(LeftShoulder|LeftArm|UpperArm_L|Shoulder_L)/i.test(o.name)) {
        leftArmRef.current = o;
        leftArmBase.current = { x: o.rotation.x, y: o.rotation.y, z: o.rotation.z };
      }
      if (!rightArmRef.current && isBone(o) && /(RightShoulder|RightArm|UpperArm_R|Shoulder_R)/i.test(o.name)) {
        rightArmRef.current = o;
        rightArmBase.current = { x: o.rotation.x, y: o.rotation.y, z: o.rotation.z };
      }
    });

    headRef.current = head;

    return () => {
      headRef.current = null;
      chestRef.current = null;
      leftArmRef.current = null;
      rightArmRef.current = null;
    };
  }, [cloned]);

  // Start any animation
  useEffect(() => {
    const name = Object.keys(actions)[0];
    if (name) actions[name]?.reset().fadeIn(0.25).play();
  }, [actions]);

  // Idle sway, look-at, talk micro-motion
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  const basePosition = useMemo(
    () => ({ x: position[0], y: position[1] ?? 0, z: position[2] ?? 0 }),
    [position]
  );
  const usingFallback = animations.length === 0;
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;

    const t = state.clock.elapsedTime;

    // Smooth yaw rotation
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 6, dt);

    // Idle sway + bob so characters feel alive
    const swayMultiplier = usingFallback ? 1.6 : 1;
    const idleBob = 0.02 * Math.sin(t * 1.2) * swayMultiplier;
    const idleSwayX = 0.06 * Math.sin(t * 0.65) * swayMultiplier;
    const idleSwayZ = 0.04 * Math.sin(t * 0.5 + 1.2) * swayMultiplier;
    g.position.set(
      basePosition.x + idleSwayX,
      basePosition.y + idleBob,
      basePosition.z + idleSwayZ
    );

    // Head look-at
    const head = headRef.current;
    if (head && lookAt) {
      tmpTarget.copy(lookAt);
      head.parent?.worldToLocal(tmpTarget);
      const dir = tmpTarget.sub(head.position).normalize();
      const yawWanted = Math.atan2(dir.x, dir.z);
      const pitchWanted = Math.asin(
        THREE.MathUtils.clamp(dir.y, -0.6, 0.6)
      );

      head.rotation.y = THREE.MathUtils.damp(
        head.rotation.y,
        THREE.MathUtils.clamp(yawWanted, -0.6, 0.6),
        10,
        dt
      );
      head.rotation.x = THREE.MathUtils.damp(
        head.rotation.x,
        THREE.MathUtils.clamp(-pitchWanted, -0.35, 0.35),
        10,
        dt
      );
    }

    // Gentle breathing via spine/chest
    const chest = chestRef.current;
    if (chest) {
      const baseX = chestBaseX.current;
      const breath = 0.045 * Math.sin(t * 0.9) * (usingFallback ? 1.5 : 1);
      chest.rotation.x = THREE.MathUtils.damp(chest.rotation.x, baseX + breath, 6, dt);
    }

    if (usingFallback) {
      const left = leftArmRef.current;
      const right = rightArmRef.current;
      const armWave = 0.35 * Math.sin(t * 0.9);
      const armLift = 0.18 * Math.sin(t * 0.55 + 1.4);
      if (left) {
        const base = leftArmBase.current;
        left.rotation.z = THREE.MathUtils.damp(left.rotation.z, base.z + armWave, 6, dt);
        left.rotation.x = THREE.MathUtils.damp(left.rotation.x, base.x + armLift, 6, dt);
      }
      if (right) {
        const base = rightArmBase.current;
        right.rotation.z = THREE.MathUtils.damp(right.rotation.z, base.z - armWave, 6, dt);
        right.rotation.x = THREE.MathUtils.damp(right.rotation.x, base.x + armLift, 6, dt);
      }
    }

    // Talking micro-motion
    if (head) {
      const talkIntensity = talk ? 1 : usingFallback ? 0.45 : 0;
      const targetTilt = talkIntensity ? 0.03 * Math.sin(t * 6) * talkIntensity : 0;
      head.rotation.z = THREE.MathUtils.damp(head.rotation.z, targetTilt, 10, dt);
    }
  });

  return (
    <group ref={group} scale={scale}>
      {/* drop body slightly so feet sit in frame */}
      <group position={[0, -0.9, 0]}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}
