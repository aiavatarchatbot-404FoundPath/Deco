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

  // 1) Avatar (GLB)
  const avatarGltf = useGLTF(avatarUrl) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  // Clone so we don’t mutate the GLTF cache
  const avatarScene = useMemo(
    () => SkeletonUtils.clone(avatarGltf.scene) as THREE.Group,
    [avatarGltf.scene]
  );

  // 2) Anim files (FBX or GLB) - memoize to prevent constant re-loading
  const animUrlsArr = useMemo(() => 
    Array.isArray(animUrls) ? animUrls : [animUrls], 
    [animUrls]
  );
  const animSources = animUrlsArr.map((u) => useAnyAnim(u));

  const sourceClips = useMemo(() => {
    console.log('[RpmModel] Processing animation sources:', animSources.length);
    
    const clips: THREE.AnimationClip[] = [];
    animSources.forEach((src, index) => {
      console.log(`[RpmModel] Animation source ${index}:`, {
        hasAnimations: !!src.animations,
        animationCount: src.animations?.length || 0,
        sceneChildren: src.scene?.children?.length || 0
      });
      
      if (src.animations?.length) {
        src.animations.forEach((clip, clipIndex) => {
          console.log(`[RpmModel] Clip ${clipIndex}:`, {
            name: clip.name,
            duration: clip.duration,
            tracks: clip.tracks.length,
            trackTypes: clip.tracks.map(t => t.constructor.name)
          });
        });
        clips.push(...src.animations);
      }
    });
    
    // Filter out invalid clips (zero duration or no tracks)
    const validClips = clips.filter(clip => {
      const isValid = clip.duration > 0 && clip.tracks.length > 0;
      if (!isValid) {
        console.log('[RpmModel] Filtering out invalid clip:', {
          name: clip.name,
          duration: clip.duration,
          tracks: clip.tracks.length
        });
      }
      return isValid;
    });
    
    console.log('[RpmModel] Total clips found:', clips.length, 'Valid clips:', validClips.length);
    return validClips;
  }, [animSources]);

  // Helper function to create a manually mapped clip when auto-retargeting fails
  const createManuallyMappedClip = (sourceClip: THREE.AnimationClip, targetMesh: THREE.SkinnedMesh): THREE.AnimationClip => {
    console.log('[RpmModel] Creating manually mapped clip for:', sourceClip.name);
    
    // Get all bone names from the target skeleton
    const targetBoneNames = new Set(targetMesh.skeleton.bones.map(bone => bone.name));
    console.log('[RpmModel] Target bone names:', Array.from(targetBoneNames).slice(0, 10)); // Log first 10
    
    // Bone name mappings between Mixamo and RPM
    const boneMapping: Record<string, string> = {
      'mixamorigHips': 'Hips',
      'mixamorigSpine': 'Spine',
      'mixamorigSpine1': 'Spine1',
      'mixamorigSpine2': 'Spine2',
      'mixamorigNeck': 'Neck',
      'mixamorigHead': 'Head',
      'mixamorigLeftShoulder': 'LeftShoulder',
      'mixamorigLeftArm': 'LeftArm',
      'mixamorigLeftForeArm': 'LeftForeArm',
      'mixamorigLeftHand': 'LeftHand',
      'mixamorigRightShoulder': 'RightShoulder',
      'mixamorigRightArm': 'RightArm',
      'mixamorigRightForeArm': 'RightForeArm',
      'mixamorigRightHand': 'RightHand',
      'mixamorigLeftUpLeg': 'LeftUpLeg',
      'mixamorigLeftLeg': 'LeftLeg',
      'mixamorigLeftFoot': 'LeftFoot',
      'mixamorigRightUpLeg': 'RightUpLeg',
      'mixamorigRightLeg': 'RightLeg',
      'mixamorigRightFoot': 'RightFoot'
    };
    
    // Create new tracks with mapped bone names
    const newTracks: THREE.KeyframeTrack[] = [];
    let mappedCount = 0;
    
    for (const track of sourceClip.tracks) {
      const [boneName, property] = track.name.split('.');
      const mappedBoneName = boneMapping[boneName];
      
      if (mappedBoneName && targetBoneNames.has(mappedBoneName)) {
        // Skip hip position tracks to prevent avatar from moving away from origin
        if (mappedBoneName === 'Hips' && property === 'position') {
          console.log('[RpmModel] Skipping Hips.position track to keep avatar centered');
          continue;
        }
        
        // Skip foot movement during idle animations to keep feet planted
        if ((mappedBoneName === 'LeftFoot' || mappedBoneName === 'RightFoot') && 
            (sourceClip.name.toLowerCase().includes('idle') || sourceClip.name.toLowerCase().includes('breathing'))) {
          console.log(`[RpmModel] Skipping ${mappedBoneName} movement during idle animation to keep feet planted`);
          continue;
        }
        
        // Skip lower leg movement during idle to prevent knee bending
        if ((mappedBoneName === 'LeftLeg' || mappedBoneName === 'RightLeg') && 
            (sourceClip.name.toLowerCase().includes('idle') || sourceClip.name.toLowerCase().includes('breathing'))) {
          console.log(`[RpmModel] Skipping ${mappedBoneName} movement during idle animation to prevent knee bending`);
          continue;
        }
        
        // Hip rotation adjustment: damp yaw during idle to avoid side-to-side sway
        if (mappedBoneName === 'Hips' && property === 'quaternion') {
          const isIdle = sourceClip.name.toLowerCase().includes('idle') || sourceClip.name.toLowerCase().includes('breathing');
          const adjustedValues: number[] = [];
          for (let i = 0; i < track.values.length; i += 4) {
            const q = new THREE.Quaternion(
              track.values[i],
              track.values[i + 1],
              track.values[i + 2],
              track.values[i + 3]
            ).normalize();
            const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
           
            const yawScale = isIdle ? 0.15 : 1.0;   
            const pitchScale = 0.7;                  
            const rollScale = 1.0;
            e.y *= yawScale;
            e.x *= pitchScale;
            e.z *= rollScale;
            const out = new THREE.Quaternion().setFromEuler(e);
            adjustedValues.push(out.x, out.y, out.z, out.w);
          }
          const newTrackName = `${mappedBoneName}.${property}`;
          const NewTrackClass = (track.constructor as any);
          const newTrack = new NewTrackClass(newTrackName, track.times, adjustedValues);
          newTracks.push(newTrack);
          mappedCount++;
          continue;
        }
        
        const newTrackName = `${mappedBoneName}.${property}`;
        const NewTrackClass = (track.constructor as any);
        
        // Scale down position values for better compatibility (Mixamo uses cm, RPM uses different scale)
        let values = track.values;
        if (property === 'position' && mappedBoneName !== 'Hips') {
          values = track.values.map((v: number) => v * 0.01); 
        }
        
        const newTrack = new NewTrackClass(newTrackName, track.times, values);
        newTracks.push(newTrack);
        mappedCount++;
      }
    }
    
    console.log('[RpmModel] Mapped', mappedCount, 'tracks out of', sourceClip.tracks.length);
    
    if (newTracks.length === 0) {
      console.warn('[RpmModel] No tracks could be mapped, returning original clip');
      return sourceClip;
    }
    
    const mappedClip = new THREE.AnimationClip(sourceClip.name + '_mapped', sourceClip.duration, newTracks);
    console.log('[RpmModel] Created mapped clip with', newTracks.length, 'tracks');
    return mappedClip;
  };

  // 3) Find skeletons + mixer
  const targetSkinned = useMemo(() => findFirstSkinned(avatarScene), [avatarScene]);
  const mixer = useMemo(
    () => new THREE.AnimationMixer(targetSkinned ?? avatarScene),
    [targetSkinned, avatarScene]
  );

  // 4) Retarget FBX/GLB clips → avatar skeleton
  const retargetedClips = useMemo(() => {
    console.log('[RpmModel] Starting retarget process:', {
      hasTargetSkinned: !!targetSkinned,
      animSourcesCount: animSources.length,
      sourceClipsCount: sourceClips.length
    });

    if (!targetSkinned) {
      console.log('[RpmModel] No target skinned mesh found');
      return [] as THREE.AnimationClip[];
    }

    console.log('[RpmModel] Target skinned mesh:', {
      name: targetSkinned.name,
      visible: targetSkinned.visible,
      boneCount: targetSkinned.skeleton.bones.length,
      geometry: targetSkinned.geometry?.type
    });

    // find a source skinned mesh from any loaded animation scene
    let sourceSkinned: THREE.SkinnedMesh | null = null;
    for (const src of animSources) {
      const s = findFirstSkinned(src.scene);
      if (s) { 
        sourceSkinned = s; 
        console.log('[RpmModel] Found source skinned mesh:', {
          name: s.name,
          boneCount: s.skeleton.bones.length
        });
        break; 
      }
    }
    if (!sourceSkinned) {
      console.log('[RpmModel] No source skinned mesh found in animation sources');
      return [] as THREE.AnimationClip[];
    }

    console.log('[RpmModel] Processing', sourceClips.length, 'source clips for retargeting');

    const retargeted = sourceClips.map((c) => {
      try {
        console.log('[RpmModel] Retargeting clip:', c.name, 'duration:', c.duration, 'tracks:', c.tracks.length);
        
        // Use the Three.js retargeting with proper bone mapping
        let r = (SkeletonUtils as any).retargetClip(
          targetSkinned,        // target skeleton (RPM avatar)
          sourceSkinned,        // source skeleton (Mixamo)
          c,                    // AnimationClip from FBX
          {}                    // Empty options - let Three.js auto-map
        ) as THREE.AnimationClip;
        
        r.name = r.name || c.name || 'RetargetedClip';
        
        console.log('[RpmModel] Retargeted clip result:', {
          originalName: c.name,
          newName: r.name,
          originalDuration: c.duration,
          newDuration: r.duration,
          originalTrackCount: c.tracks.length,
          newTrackCount: r.tracks.length
        });
        
        // Stabilize idle/breathing clips: remove hip translation and damp hip/spine yaw
        const isIdle = (c.name || r.name || '').toLowerCase().includes('idle') || (c.name || r.name || '').toLowerCase().includes('breathing');
        if (isIdle) {
          const stabilizedTracks: THREE.KeyframeTrack[] = [];
          for (const t of r.tracks) {
            const [node, prop] = t.name.split('.');
            // Drop root translation to keep body centered
            if (node === 'Hips' && prop === 'position') {
              console.log('[RpmModel] Removing Hips.position from idle clip to prevent lateral shift');
              continue;
            }
            if (node === 'Hips' && prop === 'quaternion') {
              const values = (t as any).values as Float32Array | number[];
              const out: number[] = [];
              for (let i = 0; i < values.length; i += 4) {
                const q = new THREE.Quaternion(values[i], values[i+1], values[i+2], values[i+3]).normalize();
                const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
                e.y *= 0.15; // strongly damp yaw (side sway)
                const qOut = new THREE.Quaternion().setFromEuler(e);
                out.push(qOut.x, qOut.y, qOut.z, qOut.w);
              }
              const NewTrackClass = (t.constructor as any);
              stabilizedTracks.push(new NewTrackClass(t.name, (t as any).times, out));
              continue;
            }
            if ((node === 'Spine' || node === 'Spine1' || node === 'Spine2' || node === 'Chest' || node === 'UpperChest') && prop === 'quaternion') {
              const values = (t as any).values as Float32Array | number[];
              const out: number[] = [];
              for (let i = 0; i < values.length; i += 4) {
                const q = new THREE.Quaternion(values[i], values[i+1], values[i+2], values[i+3]).normalize();
                const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
                e.y *= 0.5; // mild damping so upper body can breathe
                const qOut = new THREE.Quaternion().setFromEuler(e);
                out.push(qOut.x, qOut.y, qOut.z, qOut.w);
              }
              const NewTrackClass = (t.constructor as any);
              stabilizedTracks.push(new NewTrackClass(t.name, (t as any).times, out));
              continue;
            }
            stabilizedTracks.push(t);
          }
          r = new THREE.AnimationClip((r.name || 'Clip') + '_stabilized', r.duration, stabilizedTracks);
          console.log('[RpmModel] Stabilized idle clip:', { name: r.name, tracks: r.tracks.length });
        }
        
        // If retargeting failed, try manual bone mapping as fallback
        if (r.duration <= 0 || !r.tracks.length) {
          console.warn('[RpmModel] Retargeting produced invalid clip, trying manual approach');
          return createManuallyMappedClip(c, targetSkinned);
        }
        
        return r;
      } catch (e) {
        console.warn('[RpmModel] Retargeting failed for clip', c?.name, e);
        console.log('[RpmModel] Trying manual bone mapping as fallback');
        return createManuallyMappedClip(c, targetSkinned);
      }
    }).filter(Boolean) as THREE.AnimationClip[];

    // Filter out any invalid retargeted clips
    const validRetargeted = retargeted.filter(clip => {
      const isValid = clip.duration > 0 && clip.tracks.length > 0;
      if (!isValid) {
        console.warn('[RpmModel] Filtering out invalid retargeted clip:', {
          name: clip.name,
          duration: clip.duration,
          tracks: clip.tracks.length
        });
      }
      return isValid;
    });

    // If retargeting completely failed, use original valid clips
    if (validRetargeted.length === 0 && sourceClips.length > 0) {
      console.warn('[RpmModel] All retargeting failed, falling back to original valid clips');
      const validOriginals = sourceClips.filter(clip => clip.duration > 0 && clip.tracks.length > 0);
      return validOriginals;
    }

    return validRetargeted;
  }, [animSources, sourceClips, targetSkinned]);

  // 5) Crossfade + play
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    if (!retargetedClips.length) {
      console.log('[RpmModel] No retargeted clips available yet');
      return;
    }

    const desired = (clip && retargetedClips.find((c) => c.name === clip)) || retargetedClips[0];
    if (!desired) {
      console.log('[RpmModel] No desired clip found');
      return;
    }

    console.log('[RpmModel] Setting up animation action for clip:', desired.name);
    
    const action = mixer.clipAction(desired, targetSkinned ?? avatarScene);
    action.setLoop(loop, Number.isFinite(repetitions) ? repetitions : Infinity);
    action.timeScale = timeScale;
    action.setEffectiveWeight(1);
    action.enabled = true;

    console.log('[RpmModel] Action configured:', {
      clipName: desired.name,
      loop,
      repetitions,
      timeScale,
      weight: action.weight,
      enabled: action.enabled,
      paused: action.paused
    });

    const prev = currentActionRef.current;
    if (prev && prev !== action) {
      console.log('[RpmModel] Crossfading from previous action');
      prev.crossFadeTo(action, Math.max(0, fadeSec), false);
      action.play();
      // stop the previous after crossfade completes
      const stopAfter = Math.max(0, fadeSec) * 1000 + 30;
      const prevRef = prev;
      setTimeout(() => prevRef.stop(), stopAfter);
    } else if (!prev) {
      console.log('[RpmModel] Starting fresh action');
      action.reset().play();
    }
    
    console.log('[RpmModel] Action should now be playing:', {
      time: action.time,
      isRunning: action.isRunning(),
      paused: action.paused
    });
    
    currentActionRef.current = action;

    return () => { 
      console.log('[RpmModel] Stopping action on cleanup');
      action.stop(); 
    };
  }, [mixer, retargetedClips, clip, loop, repetitions, timeScale, fadeSec, targetSkinned, avatarScene]);

  // 6) Play/pause
  useEffect(() => {
    const a = currentActionRef.current;
    if (!a) {
      console.log('[RpmModel] No current action available for play/pause');
      return;
    }
    
    console.log('[RpmModel] Updating play/pause state:', {
      playing,
      timeScale,
      actionTime: a.time,
      actionPaused: a.paused,
      actionIsRunning: a.isRunning()
    });
    
    if (playing) { 
      mixer.timeScale = timeScale; 
      a.paused = false;
      console.log('[RpmModel] Action unpaused and should be playing');
    } else { 
      a.paused = true;
      console.log('[RpmModel] Action paused');
    }
  }, [playing, timeScale, mixer]);

  // 7) Advance mixer
  const frameCountRef = useRef(0);
  
  useFrame((_, delta) => {
    mixer.update(delta);
    
    // Debug animation state every 60 frames (roughly once per second at 60fps)
    frameCountRef.current = (frameCountRef.current || 0) + 1;
    if (frameCountRef.current % 60 === 0) {
      const action = currentActionRef.current;
      if (action && targetSkinned) {
        // Check if bones are actually moving
        const firstBone = targetSkinned.skeleton.bones[0];
        console.log('[RpmModel] Animation status update:', {
          time: action.time.toFixed(2),
          duration: action.getClip().duration.toFixed(2),
          weight: action.weight,
          enabled: action.enabled,
          paused: action.paused,
          isRunning: action.isRunning(),
          mixerTime: mixer.time.toFixed(2),
          targetVisible: targetSkinned.visible,
          bonePosition: firstBone ? firstBone.position.toArray() : 'no bones',
          boneRotation: firstBone ? firstBone.quaternion.toArray() : 'no bones'
        });
      }
    }
  });

  // 8) Mount avatar
  useEffect(() => {
    if (!groupRef.current) return;
    
    console.log('[RpmModel] Mounting avatar scene:', {
      sceneName: avatarScene.name,
      sceneChildren: avatarScene.children.length,
      sceneVisible: avatarScene.visible,
      sceneScale: avatarScene.scale.toArray(),
      scenePosition: avatarScene.position.toArray()
    });
    
    // Make sure the avatar is visible
    avatarScene.visible = true;
    avatarScene.traverse((child) => {
      if (child.type === 'SkinnedMesh') {
        child.frustumCulled = false;
        child.visible = true;
        console.log('[RpmModel] Found SkinnedMesh child:', {
          name: child.name,
          visible: child.visible,
          castShadow: child.castShadow,
          receiveShadow: child.receiveShadow
        });
      }
    });
    
    groupRef.current.add(avatarScene);
    return () => { groupRef.current?.remove(avatarScene); };
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
