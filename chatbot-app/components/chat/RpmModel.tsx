'use client';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';

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
  useEffect(() => {
    let found: THREE.Bone | null = null;
    cloned.traverse((o: any) => {
      if (!found && o.type === 'Bone' && /HeadTop_End|Head/i.test(o.name)) {
        found = o as THREE.Bone;
      }
    });
    headRef.current = found;
  }, [cloned]);

  // Start any animation
  useEffect(() => {
    const name = Object.keys(actions)[0];
    if (name) actions[name]?.reset().fadeIn(0.25).play();
  }, [actions]);

  // Idle sway, look-at, talk micro-motion
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;

    const t = state.clock.elapsedTime;

    // Smooth yaw rotation
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 6, dt);

    // Position with idle bob (use incoming Y too)
    g.position.set(
      position[0],
      (position[1] ?? 0) + 0.02 * Math.sin(t * 1.2),
      position[2]
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

    // Talking micro-motion
    if (talk && head) {
      head.rotation.z = 0.03 * Math.sin(t * 6);
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

useGLTF.preload('/noop.glb');
