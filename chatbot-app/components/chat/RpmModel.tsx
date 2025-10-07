'use client';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GroupProps, useFrame } from '@react-three/fiber';
import { useGLTF, useFBX } from '@react-three/drei';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

type RpmModelProps = GroupProps & {
  avatarUrl: string;                // Ready Player Me (GLB) or any GLB
  animUrls: string[] | string;      // FBX or GLB animation files
  clip?: string;                    // AnimationClip.name to play
  playing?: boolean;
  timeScale?: number;
  fadeSec?: number;
  loop?: THREE.AnimationActionLoopStyles;
  repetitions?: number;
};

const asSkinned = (o: THREE.Object3D | null): o is THREE.SkinnedMesh =>
  !!o && (o as THREE.SkinnedMesh).isSkinnedMesh === true;

function findFirstSkinned(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && asSkinned(o)) found = o as THREE.SkinnedMesh;
  });
  return found;
}

// Load GLB (useGLTF) or FBX (useFBX) uniformly
function useAnyAnim(url: string) {
  const isFbx = url.toLowerCase().endsWith('.fbx');
  if (isFbx) {
    const grp = useFBX(url); // THREE.Group
    const clips = (grp as any).animations as THREE.AnimationClip[] | undefined;
    return { scene: grp as THREE.Group, animations: clips ?? [] };
  } else {
    const gltf = useGLTF(url) as unknown as {
      scene: THREE.Group;
      animations: THREE.AnimationClip[];
    };
    return { scene: gltf.scene, animations: gltf.animations ?? [] };
  }
}

export default function RpmModel({
  avatarUrl,
  animUrls,
  clip,
  playing = true,
  timeScale = 1,
  fadeSec = 0.25,
  loop = THREE.LoopRepeat,
  repetitions = Infinity,
  ...groupProps
}: RpmModelProps) {
  const groupRef = useRef<THREE.Group>(null!);

  // 1) Avatar (GLB expected here)
  const avatarGltf = useGLTF(avatarUrl) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  // Clone so we don’t mutate the GLTF cache
  const avatarScene = useMemo(
    () => SkeletonUtils.clone(avatarGltf.scene) as THREE.Group,
    [avatarGltf.scene]
  );

  // 2) Anim files (FBX or GLB)
  const animUrlsArr = Array.isArray(animUrls) ? animUrls : [animUrls];
  const animSources = animUrlsArr.map((u) => useAnyAnim(u));

  const sourceClips = useMemo(
    () => animSources.flatMap((g) => g.animations || []),
    [animSources]
  );

  // 3) Find skeletons + mixer
  const targetSkinned = useMemo(() => findFirstSkinned(avatarScene), [avatarScene]);
  const mixer = useMemo(
    () => new THREE.AnimationMixer(targetSkinned ?? avatarScene),
    [targetSkinned, avatarScene]
  );

  // 4) Retarget FBX/GLB clips → avatar skeleton
  const retargetedClips = useMemo(() => {
    if (!targetSkinned) return [] as THREE.AnimationClip[];

    // find a source skinned mesh from any loaded animation scene
    let sourceSkinned: THREE.SkinnedMesh | null = null;
    for (const src of animSources) {
      const s = findFirstSkinned(src.scene);
      if (s) { sourceSkinned = s; break; }
    }
    if (!sourceSkinned) return [] as THREE.AnimationClip[];

    return sourceClips.map((c) => {
      try {
        const r = (SkeletonUtils as any).retargetClip(
          targetSkinned,        // target root/skeleton (RPM avatar)
          sourceSkinned,        // source root/skeleton (Mixamo)
          c,                    // AnimationClip from FBX/GLB
          {
            preserveBoneMatrix: false,
            // Optional: compensate Mixamo (cm) → RPM (m):
            // scale: 0.01,
            // Optional: start from first-frame hip position
            // useFirstFramePosition: true,
          }
        ) as THREE.AnimationClip;
        r.name = r.name || c.name || 'RetargetedClip';
        return r;
      } catch (e) {
        console.warn('[RpmModel] retarget failed for clip', c?.name, e);
        return null;
      }
    }).filter(Boolean) as THREE.AnimationClip[];
  }, [animSources, sourceClips, targetSkinned]);

  // 5) Crossfade + play
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!retargetedClips.length) return; // nothing to play yet

    const desired = (clip && retargetedClips.find((c) => c.name === clip)) || retargetedClips[0];
    if (!desired) return;

    const action = mixer.clipAction(desired, targetSkinned ?? avatarScene);
    action.setLoop(loop, Number.isFinite(repetitions) ? repetitions : Infinity);
    action.timeScale = timeScale;

    const prev = currentActionRef.current;
    if (prev && prev !== action) {
      prev.crossFadeTo(action, Math.max(0, fadeSec), false);
      action.play();
      // stop the previous after crossfade completes
      const stopAfter = Math.max(0, fadeSec) * 1000 + 30;
      const prevRef = prev;
      setTimeout(() => prevRef.stop(), stopAfter);
    } else if (!prev) {
      action.reset().play();
    }
    currentActionRef.current = action;

    return () => { action.stop(); };
  }, [mixer, retargetedClips, clip, loop, repetitions, timeScale, fadeSec, targetSkinned, avatarScene]);

  // 6) Play/pause
  useEffect(() => {
    const a = currentActionRef.current;
    if (!a) return;
    if (playing) { mixer.timeScale = timeScale; a.paused = false; }
    else { a.paused = true; }
  }, [playing, timeScale, mixer]);

  // 7) Advance mixer
  useFrame((_, delta) => mixer.update(delta));

  // 8) Mount avatar
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.add(avatarScene);
    return () => { groupRef.current.remove(avatarScene); };
  }, [avatarScene]);

  // 9) Cleanup
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  // Debug: see available clip names after retarget
  // useEffect(() => { console.log('retargeted:', retargetedClips.map(c => c.name)); }, [retargetedClips]);

  return <group ref={groupRef} {...groupProps} />;
}

// Avoid TS complaints about drei preloads
(useGLTF as any).preload;
(useFBX as any).preload;
