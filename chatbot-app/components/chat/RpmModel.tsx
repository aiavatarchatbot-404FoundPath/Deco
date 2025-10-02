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
  const inner = useRef<THREE.Group>(null);
  // Collect facial morph targets (e.g., jawOpen) for simple talking effect
  const morphMeshesRef = useRef<Array<{ mesh: THREE.Mesh & { morphTargetDictionary?: any; morphTargetInfluences?: number[] }, jaw?: number }>>([]);

  const url = useMemo(
    () => (src ? (src.endsWith('.glb') ? src : `${src}.glb`) : null),
    [src]
  );

  const { scene, animations } = useGLTF(url || '', true);
  // Deep-clone the GLTF with SkeletonUtils to preserve skinned mesh bindings
  const cloned = useMemo(() => (cloneSkeleton(scene) as THREE.Object3D), [scene]);

  // Load GLB animation source (served from /public). Use requested talking variation for clear movement.
  const idleAnimation = useGLTF('/animations/masculine/expression/M_Talking_Variations_009.glb');

  // Enable shadows
  useEffect(() => {
    morphMeshesRef.current = [];
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        // Prevent popping of separate skinned parts due to stale bounds
        child.frustumCulled = false;
        child.matrixAutoUpdate = true;
        // Record morph targets we care about for procedural lip-sync
        const dict: Record<string, number> | undefined = (child as any).morphTargetDictionary;
        if (dict) {
          const jawIdx =
            dict['jawOpen'] ??
            dict['JawOpen'] ??
            dict['jaw_open'] ??
            dict['v_aa'] ??
            dict['AA'] ??
            undefined;
          morphMeshesRef.current.push({ mesh: child as any, jaw: jawIdx });
        }
      } else if (child instanceof THREE.Object3D) {
        child.matrixAutoUpdate = true;
      }
    });
    // Keep inner orientation neutral; yaw comes from parent group props
  }, [cloned]);

  // Keep baseline neutral; per-instance yaw (from viewer) controls facing
  useEffect(() => {
    if (inner.current) {
      inner.current.rotation.y = Math.PI;
    }
  }, [src]);

  const { actions } = useAnimations(animations, group);

  // Find head bone
  const headRef = useRef<THREE.Bone | null>(null);
  const hipsRef = useRef<THREE.Bone | null>(null);
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
      if (!hipsRef.current && isBone(o) && /(Hips|Pelvis|mixamorig:?Hips|Root)/i.test(o.name)) {
        hipsRef.current = o;
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
      hipsRef.current = null;
      chestRef.current = null;
      leftArmRef.current = null;
      rightArmRef.current = null;
    };
  }, [cloned]);

  // Debug: attach a small marker to the head bone to verify bone/world updates
  const headMarkerRef = useRef<THREE.Object3D | null>(null);
  useEffect(() => {
    const head = headRef.current;
    if (!head || headMarkerRef.current) return;
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x00ff88 })
    );
    marker.position.set(0, 0.12, 0);
    head.add(marker);
    headMarkerRef.current = marker;
    return () => {
      try {
        head.remove(marker);
      } catch {}
      headMarkerRef.current = null;
    };
  }, [headRef.current]);

  // Retarget FBX clips to the RPM avatar skeleton
  const idleClip = useMemo(() => {
    try {
      const srcClip = idleAnimation?.animations?.[0] as THREE.AnimationClip | undefined;
      if (!srcClip) return null;
      const targetSkinned = findFirstSkinned(cloned);
      const sourceSkinned = findFirstSkinned(idleAnimation.scene);
      if (!targetSkinned || !sourceSkinned) return null;
      const targetClone = cloneSkeleton(targetSkinned) as THREE.SkinnedMesh;
      const sourceClone = cloneSkeleton(sourceSkinned) as THREE.SkinnedMesh;
      return retargetClip(targetClone, sourceClone, srcClip, { hip: 'Hips', useFirstFramePosition: true });
    } catch (e) {
      console.warn('Idle retarget failed', e);
      return null;
    }
  }, [cloned, idleAnimation.animations, idleAnimation.scene]);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  

  // Prepare mixer + actions when clips are available
  useEffect(() => {
    // If we have retargeted clips, prefer those; otherwise, fall back to any GLB-embedded animation
    const hasRetarget = !!idleClip;
    if (!hasRetarget && Object.keys(actions).length > 0) {
      const name = Object.keys(actions)[0];
      actions[name]?.reset().fadeIn(0.25).play();
      return;
    }

    if (!idleClip) return;

    const mixer = new THREE.AnimationMixer(cloned);
    mixerRef.current = mixer;
    if (idleClip) {
      const a = mixer.clipAction(idleClip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.enabled = true;
      // Ensure full influence and normal speed for clear hand motion
      a.setEffectiveWeight(1.0);
      a.setEffectiveTimeScale(1.0);
      idleActionRef.current = a;
    }

    // Start with idle if available, else talk
    const start = idleActionRef.current;
    start?.reset().fadeIn(0.3).play();

    return () => {
      idleActionRef.current?.stop();
      mixer.stopAllAction();
      mixerRef.current = null;
      idleActionRef.current = null;
    };
  }, [actions, cloned, idleClip]);

  // No talk crossfade for now; only idle so avatars move.

  // Idle sway, look-at, talk micro-motion
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  const basePosition = useMemo(
    () => ({ x: position[0], y: position[1] ?? 0, z: position[2] ?? 0 }),
    [position]
  );
  // Use procedural fallback only when we don't have a retargeted mixer running
  const usingFallback = !mixerRef.current;
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;

    // Drive mixer time if active
    const mixer = mixerRef.current;
    if (mixer) mixer.update(dt);

    const t = state.clock.elapsedTime;
    // Natural idle: small yaw sway and gentle bob
    const bodyYaw = 0.05 * Math.sin(t * 0.55);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw + bodyYaw, 6, dt);
    const idleBob = 0.02 * Math.sin(t * 1.0);
    const idleSwayX = 0.04 * Math.sin(t * 0.65);
    const idleSwayZ = 0.03 * Math.sin(t * 0.5 + 1.2);
    g.position.set(
      basePosition.x + idleSwayX,
      basePosition.y + idleBob,
      basePosition.z + idleSwayZ
    );

    // Also drive inner group explicitly to rule out parenting issues
    if (inner.current) {
      inner.current.updateMatrixWorld();
    }

    // Keep scale constant

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

    // Gentle breathing via spine/chest and hips sway
    const chest = chestRef.current;
    const hips = hipsRef.current;
    if (chest) {
      const baseX = chestBaseX.current;
      const breath = 0.10 * Math.sin(t * 0.9) * (usingFallback ? 1.2 : 1);
      chest.rotation.x = THREE.MathUtils.damp(chest.rotation.x, baseX + breath, 6, dt);
    }
    if (hips) {
      const sway = 0.05 * Math.sin(t * 0.9);
      hips.rotation.y = THREE.MathUtils.damp(hips.rotation.y, sway, 8, dt);
    }

    if (usingFallback) {
      const left = leftArmRef.current;
      const right = rightArmRef.current;
      const armWave = 0.45 * Math.sin(t * 0.9);
      const armLift = 0.22 * Math.sin(t * 0.55 + 1.4);
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
    const talkIntensity = talk ? 1 : 0;
    if (head) {
      const targetTilt = talkIntensity ? 0.03 * Math.sin(t * 6) * talkIntensity : 0;
      head.rotation.z = THREE.MathUtils.damp(head.rotation.z, targetTilt, 10, dt);
    }
    // Procedural jaw-open morph for simple lip-sync when talking
    if (talkIntensity > 0 && morphMeshesRef.current.length) {
      const phase = (Math.sin(t * 5.5) + Math.sin(t * 7.3 + 0.7)) * 0.5; // pseudo-random mouth
      const jawValue = THREE.MathUtils.clamp(0.35 + 0.35 * phase, 0, 1);
      for (const entry of morphMeshesRef.current) {
        const idx = entry.jaw;
        if (idx !== undefined && entry.mesh.morphTargetInfluences) {
          entry.mesh.morphTargetInfluences[idx] = jawValue;
        }
      }
    }
  });

  return (
    <group ref={group} scale={scale}>
      {/* drop body slightly so feet sit in frame */}
      <group ref={inner} position={[0, 0.2, 0]}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}
