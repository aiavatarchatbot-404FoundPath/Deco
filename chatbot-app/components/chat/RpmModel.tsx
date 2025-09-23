'use client';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { retargetClip, clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const isBone = (object: THREE.Object3D | null): object is THREE.Bone => !!object && object.type === 'Bone';
const asSkinned = (object: THREE.Object3D | null): object is THREE.SkinnedMesh => !!object && (object as THREE.SkinnedMesh).isSkinnedMesh;
const findFirstSkinned = (root: THREE.Object3D | null): THREE.SkinnedMesh | null => {
  if (!root) return null;
  let result: THREE.SkinnedMesh | null = null;
  root.traverse((obj) => {
    if (!result && asSkinned(obj)) {
      result = obj;
    }
  });
  return result;
};

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
  /** idle animation configuration */
  animation?: {
    profile?: 'masculine' | 'feminine';
    /** filename living under /public/rpm-animations/<profile>/<category>/ */
    file?: string;
    /** full URL if the animation lives elsewhere */
    url?: string;
    /** specific clip name to play inside the GLB */
    actionName?: string;
  };
};

export type RpmAnimationConfig = NonNullable<Props['animation']>;

export default function RpmModel({
  src,
  position = [0, 0, 0],
  yaw = 0,
  lookAt = null,
  talk = false,
  scale = 1.0,
  animation,
}: Props) {
  const group = useRef<THREE.Group>(null);

  const url = useMemo(
    () => (src ? (src.endsWith('.glb') ? src : `${src}.glb`) : null),
    [src]
  );

  const { scene, animations } = useGLTF(url || '', true);
  const cloned = useMemo(() => scene.clone(), [scene]);

  const animationProfile = animation?.profile ?? 'feminine';
  const animationFile = animation?.file ??
    (animationProfile === 'masculine'
      ? 'M_Standing_Idle_Variations_001.glb'
      : 'F_Standing_Idle_Variations_001.glb');
  const animationUrl = animation?.url ?? `/rpm-animations/${animationProfile}/idle/${animationFile}`;

  const idleAnimation = useGLTF(animationUrl);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

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
  useEffect(() => {
    headRef.current = null;
    chestRef.current = null;

    let head: THREE.Bone | null = null;
    cloned.traverse((o: THREE.Object3D) => {
      if (!head && isBone(o) && /HeadTop_End|Head/i.test(o.name)) {
        head = o;
      }
      if (!chestRef.current && isBone(o) && /(Spine2|Spine1|Chest|UpperChest)/i.test(o.name)) {
        chestRef.current = o;
        chestBaseX.current = o.rotation.x;
      }
    });

    headRef.current = head;

    return () => {
      headRef.current = null;
      chestRef.current = null;
    };
  }, [cloned]);

  // Start any animation
  useEffect(() => {
    const name = Object.keys(actions)[0];
    if (name) actions[name]?.reset().fadeIn(0.25).play();
  }, [actions]);

  const retargetedClip = useMemo(() => {
    if (!idleAnimation.scene || !idleAnimation.animations || idleAnimation.animations.length === 0) {
      return null;
    }

    const desiredClip = animation?.actionName
      ? idleAnimation.animations.find((clip) => clip.name === animation.actionName)
      : idleAnimation.animations[0];

    if (!desiredClip) {
      return null;
    }

    const targetSkinned = findFirstSkinned(cloned);
    const sourceSkinned = findFirstSkinned(idleAnimation.scene);

    if (!targetSkinned || !sourceSkinned) {
      return null;
    }

    if (!targetSkinned.skeleton || !sourceSkinned.skeleton) {
      return null;
    }

    const targetClone = cloneSkeleton(targetSkinned) as THREE.SkinnedMesh;
    const sourceClone = cloneSkeleton(sourceSkinned) as THREE.SkinnedMesh;

    try {
      return retargetClip(targetClone, sourceClone, desiredClip, {
        hip: 'Hips',
        useFirstFramePosition: true,
      });
    } catch (err) {
      console.warn('Failed to retarget clip', err);
      return null;
    }
  }, [animation?.actionName, cloned, idleAnimation.animations, idleAnimation.scene]);

  useEffect(() => {
    if (!retargetedClip) {
      return;
    }

    const mixer = new THREE.AnimationMixer(cloned);
    mixerRef.current = mixer;

    const action = mixer.clipAction(retargetedClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.reset().fadeIn(0.3).play();
    return () => {
      action.stop();
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [cloned, retargetedClip]);

  // Idle sway, look-at, talk micro-motion
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  const basePosition = useMemo(
    () => ({ x: position[0], y: position[1] ?? 0, z: position[2] ?? 0 }),
    [position]
  );
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;

    const mixer = mixerRef.current;
    if (mixer) {
      mixer.update(dt);
    }

    const t = state.clock.elapsedTime;

    // Smooth yaw rotation
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 6, dt);

    // Idle sway + bob so characters feel alive
    const idleBob = 0.02 * Math.sin(t * 1.2);
    const idleSwayX = 0.06 * Math.sin(t * 0.65);
    const idleSwayZ = 0.04 * Math.sin(t * 0.5 + 1.2);
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
      const breath = 0.045 * Math.sin(t * 0.9);
      chest.rotation.x = THREE.MathUtils.damp(chest.rotation.x, baseX + breath, 6, dt);
    }

    // Talking micro-motion
    if (talk && head) {
      head.rotation.z = 0.03 * Math.sin(t * 6);
    } else if (head) {
      head.rotation.z = THREE.MathUtils.damp(head.rotation.z, 0, 10, dt);
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
useGLTF.preload('/rpm-animations/feminine/idle/F_Standing_Idle_Variations_001.glb');
useGLTF.preload('/rpm-animations/masculine/idle/M_Standing_Idle_Variations_001.glb');
