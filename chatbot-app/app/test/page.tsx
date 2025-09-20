"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
//import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { clone as skeletonClone, retargetClip } from "three/examples/jsm/utils/SkeletonUtils.js";

type ReactionType =
  | "greet" | "agree" | "deny" | "question" | "laugh"
  | "happy" | "sad"   | "point" | "none";

type Reaction = { type: ReactionType; strength: number };

function analyzeText(msg: string): Reaction {
  const m = msg.toLowerCase();
  // Strongest explicit cues
  if (/(^|\b)(hi|hello|hey)\b/.test(m)) return { type: "greet", strength: 0.8 };
  if (/[?]/.test(m) || /\b(why|how|what|when|where)\b/.test(m)) return { type: "question", strength: 0.7 };
  if (/\b(yes|yep|sure|agree|ok|okay|sounds good)\b/.test(m)) return { type: "agree", strength: 0.7 };
  if (/\b(no|nope|nah|don'?t|cannot|can't|won't)\b/.test(m)) return { type: "deny", strength: 0.8 };
  if (/\b(lol|haha|hehe|lmao|rofl)\b|😂|🤣/.test(m)) return { type: "laugh", strength: 1.0 };
  if (/\b(look at|see this|check this|point)\b/.test(m)) return { type: "point", strength: 0.6 };

  // Soft sentiment-ish cues
  if (/\b(thanks|great|awesome|nice|love|cool|amazing|good)\b/.test(m)) return { type: "happy", strength: 0.5 };
  if (/\b(sad|sorry|unfortunately|bad|worse|upset)\b/.test(m)) return { type: "sad", strength: 0.5 };

  // Emphatic punctuation nudges (you already nod on !/?)
  if (/[!]{2,}/.test(m)) return { type: "point", strength: 0.4 };

  return { type: "none", strength: 0.0 };
}



type Side = "left" | "right";
type TalkMode = "text" | "procedural";

/** Utility: traverse once */
function traverse(object: THREE.Object3D, fn: (o: THREE.Object3D) => void) {
  object.traverse(fn);
}

/** Find commonly named bones on RPM rigs. */
function findBones(root: THREE.Object3D) {
  const out: {
    head?: THREE.Bone;
    spine?: THREE.Bone;
    hips?: THREE.Bone;
    eyeL?: THREE.Bone;
    eyeR?: THREE.Bone;
  } = {};
  traverse(root, (o) => {
    
    if ((o as any).isBone) {
      const name = o.name.toLowerCase();
      if (!out.head && (name.includes("head") || name === "head")) out.head = o as THREE.Bone;
      if (!out.spine && name.includes("spine")) out.spine = o as THREE.Bone;
      if (!out.hips && (name.includes("hips") || name.includes("pelvis"))) out.hips = o as THREE.Bone;
      if (!out.eyeL && (name.includes("lefteye") || name.includes("eye.l") || name === "eye_l")) out.eyeL = o as THREE.Bone;
      if (!out.eyeR && (name.includes("righteye") || name.includes("eye.r") || name === "eye_r")) out.eyeR = o as THREE.Bone;
    }
  });
  return out;
}

/** Pick morph target indices by fuzzy name match */
function pickMorphIndices(mesh: THREE.Mesh, patterns: string[]): number[] {
  // @ts-ignore - present on SkinnedMesh/BufferGeometry with morphs
  const dict: Record<string, number> | undefined = mesh.morphTargetDictionary;
  if (!dict) return [];
  const keys = Object.keys(dict);
  const out: number[] = [];
  const lowerPatterns = patterns.map((p) => p.toLowerCase());
  for (const k of keys) {
    const kl = k.toLowerCase();
    if (lowerPatterns.some((p) => kl.includes(p))) out.push(dict[k]);
  }
  return out;
}

function resetMorphs(meshes: THREE.Mesh[]) {
  for (const mesh of meshes) {
    // @ts-ignore
    const infl: number[] | undefined = mesh.morphTargetInfluences;
    if (!infl) continue;
    for (let i = 0; i < infl.length; i++) infl[i] = 0;
  }
}

/**
 * Minimal speech player: simulates a speaking envelope and nods on ! or ?
 */
function useSpeechPlayer() {
  const [speakingSide, setSpeakingSide] = useState<Side | null>(null);
  const [bubbleText, setBubbleText] = useState("");
  const [driveL, setDriveL] = useState(0);
  const [driveR, setDriveR] = useState(0);
  const [nodKickL, setNodKickL] = useState(0);
  const [nodKickR, setNodKickR] = useState(0);

  // simple exponential decay helper
  function playEnvelope(side: Side, durationMs: number) {
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      const norm = Math.min(1, t / durationMs);
      const amp = Math.exp(-3 * norm); // quick-ish decay
      if (side === "left") setDriveL(amp);
      else setDriveR(amp);
      if (norm < 1) requestAnimationFrame(tick);
      else {
        if (side === "left") setDriveL(0);
        else setDriveR(0);
        setSpeakingSide(null);
      }
    };
    requestAnimationFrame(tick);
  }

  const speakFromText = (side: Side, msg: string) => {
    setBubbleText(msg);
    setSpeakingSide(side);
    // duration proportional to characters, clamped
    const duration = Math.max(800, Math.min(6500, msg.length * 55));
    playEnvelope(side, duration);
    const hasPunch = /[!?]{1,}/.test(msg);
    if (hasPunch) (side === "left" ? setNodKickL : setNodKickR)((x) => x + 1);
  };

  // alias for now; you can wire to audio amplitudes later
  const speak = (side: Side, msg: string) => speakFromText(side, msg || "...");

  return { speakingSide, bubbleText, driveL, driveR, nodKickL, nodKickR, speak, speakFromText } as const;
}

function RpmAvatar({
  url,
  position,
  rotation,
  speaking,
  bubbleText,
  drive,
  nodKick,
  reaction,          // NEW
  attend,
}: {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  speaking: boolean;
  bubbleText: string;
  drive: number;
  nodKick: number;
  reaction?: Reaction | null;    // NEW
  attend?: boolean;              // NEW
}) {
  const group = useRef<THREE.Group | null>(null);

  // Load + clone avatar (independent skeleton per instance)
  const gltf = useGLTF(url) as any;
  const scene = useMemo(() => skeletonClone(gltf.scene), [gltf.scene]);

// Load your available GLBs
const idleGLB    = useGLTF("/anims/M_Standing_Idle_001.glb") as any;
const idleVarGLB = useGLTF("/anims/M_Standing_Idle_Variations_003.glb") as any;
const talkGLB    = useGLTF("/anims/M_Standing_Expressions_010.glb") as any;
const talkVarGLB = useGLTF("/anims/M_Talking_variations_007.glb") as any;
const danceGLB   = useGLTF("/anims/M_Dances_004.glb") as any;

const animClips = useMemo(() => {
  const list: THREE.AnimationClip[] = [];

  // helper: retarget source clip → this avatar's skeleton
  const add = (src: any, name: string) => {
    try {
      const srcClip = src?.animations?.[0];
      const srcRoot = src?.scene;
      if (!srcClip || !srcRoot) {
        console.warn(`⚠️  No animation in "${name}" source GLB`);
        return;
      }
      // Retarget tracks so they bind to THIS avatar's bones
      const retargeted = (retargetClip as any)(srcRoot, srcClip, scene) as THREE.AnimationClip;
      retargeted.name = name;
      list.push(retargeted);
    } catch (e) {
      console.warn(`⚠️  Retarget failed for "${name}" — using raw clone`, e);
      const fallback = src?.animations?.[0]?.clone?.();
      if (fallback) {
        fallback.name = name;
        list.push(fallback);
      }
    }
  };

  // Build your library
  add(idleGLB,    "Idle_Base");
  add(idleVarGLB, "Idle_Var");
  add(talkGLB,    "Talk_01");
  add(talkVarGLB, "Talk_02");

  // Reuse the dance clip as placeholders for multiple reactions (distinct names required)
  add(danceGLB,   "Gesture_01");
  add(danceGLB,   "Wave");
  add(danceGLB,   "Head_No");
  add(danceGLB,   "Laugh");
  add(danceGLB,   "Point");

  // Debug: see what's actually in the list
  console.log("✅ animClips (retargeted):", list.map(c => c.name));
  return list;
}, [idleGLB, idleVarGLB, talkGLB, talkVarGLB, danceGLB, scene]);

  // --- bind to THIS avatar skeleton ---
const { actions, mixer } = useAnimations(animClips, scene);
const idleAction  = actions?.Idle_Base as THREE.AnimationAction | undefined;
const talkAction  = actions?.Talk_01   as THREE.AnimationAction | undefined;
//const idleAction  = actions?.Idle_Base as THREE.AnimationAction | undefined;
const talk_02Action  = actions?.Talk_02   as THREE.AnimationAction | undefined;

useEffect(() => {
  if (!idleAction) return;
  idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.5).play();
}, [idleAction]);

useEffect(() => {
  if (!talkAction) return;
  const now = !!speaking;
  if (now && !wasSpeaking.current) {
    talkAction.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(0.7).fadeIn(0.25).play();
  } else if (!now && wasSpeaking.current) {
    talkAction.fadeOut(0.25);
  }
  wasSpeaking.current = now;
}, [speaking, talkAction]);


useEffect(() => {
  console.log("idleGLB animations:", idleGLB?.animations?.map(a => a.name));
  console.log("danceGLB animations:", danceGLB?.animations?.map(a => a.name));
}, [idleGLB, danceGLB]);

useEffect(() => {
  if (!talkAction) return;
  const now = !!speaking;
  if (now && !wasSpeaking.current) {
    talkAction
      .reset()
      .setLoop(THREE.LoopRepeat, Infinity)
      .setEffectiveWeight(0.7) // talk sits under idle; tweak 0..1
      .fadeIn(0.25)
      .play();
  } else if (!now && wasSpeaking.current) {
    talkAction.fadeOut(0.25);
  }
  wasSpeaking.current = now;
}, [speaking, talkAction]);

const [reactionLeft,  setReactionLeft]  = useState<Reaction | null>(null);
const [reactionRight, setReactionRight] = useState<Reaction | null>(null);

  console.log("animClips loaded:", animClips.map(c => c.name));
  console.log("Available actions:", Object.keys(actions || {}));

// --- optional: make talk feel livelier with text intensity (drive) ---
useEffect(() => {
  if (!talkAction) return;
  // speed up a bit when drive is high (0.8x..2x)
  talkAction.setEffectiveTimeScale(0.8 + 1.2 * Math.min(1, Math.max(0, drive)));
}, [drive, talkAction]);



  const morphMeshes = useMemo(() => {
    const arr: THREE.Mesh[] = [];
    traverse(scene, (o) => {
      const m = o as THREE.Mesh & { morphTargetInfluences?: number[] };
      if (m.isMesh && m.morphTargetInfluences) arr.push(m);
    });
    return arr;
  }, [scene]);

  const picked = useMemo(() => {
    return morphMeshes.map((mesh) => {
      const talk = pickMorphIndices(mesh, [
        "viseme_aa",
        "viseme_e",
        "viseme_i",
        "viseme_o",
        "viseme_u",
        "jawopen",
        "mouthopen",
        "vowel",
      ]);
      const jaw = pickMorphIndices(mesh, ["jawopen", "jaw_open", "mouthopen"]);
      const smile = pickMorphIndices(mesh, ["smile", "mouthsmile", "smile_l", "smile_r"]);
      return { mesh, talk, smile, jaw };
    });
  }, [morphMeshes]);

  const bones = useMemo(() => findBones(scene), [scene]);
  const headBase = useRef<{ x: number; y: number; z: number } | null>(null);
  const spineBase = useRef<{ x: number; y: number; z: number } | null>(null);
  const hipsBase = useRef<{ x: number; y: number; z: number; px: number; py: number; pz: number } | null>(null);
  const eyesBase = useRef<{ lx: number; ly: number; rx: number; ry: number } | null>(null);
  const shakeT = useRef(0);     // head shake timer
const leanT  = useRef(0);     // lean-in timer
const smileT = useRef(0);     // smile timer
const frownT = useRef(0);     // frown timer


  useEffect(() => {
    if (bones.head && !headBase.current) headBase.current = { x: bones.head.rotation.x, y: bones.head.rotation.y, z: bones.head.rotation.z };
    if (bones.spine && !spineBase.current) spineBase.current = { x: bones.spine.rotation.x, y: bones.spine.rotation.y, z: bones.spine.rotation.z };
    if (bones.hips && !hipsBase.current) hipsBase.current = {
      x: bones.hips.rotation.x, y: bones.hips.rotation.y, z: bones.hips.rotation.z,
      px: bones.hips.position.x, py: bones.hips.position.y, pz: bones.hips.position.z
    };
    if (!eyesBase.current) eyesBase.current = {
      lx: bones.eyeL?.rotation.x ?? 0, ly: bones.eyeL?.rotation.y ?? 0,
      rx: bones.eyeR?.rotation.x ?? 0, ry: bones.eyeR?.rotation.y ?? 0
    };
  }, [bones]);

  // ---------- ANIMATION LOGIC (fixed) ----------
  // Cross-fade Talk on speak start/stop
  const wasSpeaking = useRef(false);
  useEffect(() => {
    if (!talkAction) return;
    if (speaking && !wasSpeaking.current) {
      talkAction.reset().fadeIn(0.40).play();
    } else if (!speaking && wasSpeaking.current) {
      talkAction.fadeOut(0.25);
    }
    wasSpeaking.current = !!speaking;
  }, [speaking, talkAction]);

  // Clean up mixer only on unmount / mixer change
  useEffect(() => {
    if (!mixer) return;
    const m = mixer;
    return () => { m.stopAllAction(); };
  }, [mixer]);

  useEffect(() => {
  const a = actions["Gesture_01"];
  if (!a) return;
  if (nodKick > 0) {
    a.reset(); a.clampWhenFinished = true; a.setLoop(THREE.LoopOnce, 1);
    a.fadeIn(0.12).play();
    const to = setTimeout(() => a.fadeOut(0.2), 500);
    return () => clearTimeout(to);
  }
}, [nodKick, actions]);


  // Reset facial morphs when quiet
  useEffect(() => {
    if (!speaking && drive <= 0.02 && morphMeshes.length) resetMorphs(morphMeshes);
  }, [speaking, drive, morphMeshes]);

  // ---------- PROCEDURAL FACIAL/IDLE (unchanged) ----------
  const t0 = useRef(Math.random() * 100);
  const nodEnergy = useRef(0);
  const saccadeT = useRef(0);
  const targetYaw = useRef(0);
  const targetPitch = useRef(0);
  const blinkT = useRef(0);
  const blinkPhase = useRef(0);


  useEffect(() => {
  if (!reaction || reaction.type === "none") return;

const tryPlay = (name: string, weight = 0.9, fade = 0.15, onceLenMs = 600) => {
  const a = actions[name];
  if (!a) return false;
  a.reset();
  a.setEffectiveWeight(weight);
  a.setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = true;
  a.fadeIn(fade).play();
  setTimeout(() => a.fadeOut(0.2), onceLenMs);
  return true;
};


  switch (reaction.type) {
    case "greet":
  tryPlay("Wave") || tryPlay("Gesture_01", 0.7);
  break;
case "deny":
  tryPlay("Head_No") || (shakeT.current = 0.7);
  break;
case "laugh":
  tryPlay("Laugh") || (smileT.current = 1.2);
  break;
case "point":
  tryPlay("Point") || tryPlay("Gesture_01", 0.8);
  break;
  }
}, [reaction, actions, nodEnergy]);


//////////////////////////////////




  useEffect(() => { nodEnergy.current = Math.min(1, nodEnergy.current + 0.9); }, [nodKick]);

  useFrame((state, dt) => {
    if (!group.current) return;
    const t = (t0.current += dt);
    // decay timers
  shakeT.current = Math.max(0, shakeT.current - dt);
  leanT.current  = Math.max(0, leanT.current - dt);
  smileT.current = Math.max(0, smileT.current - dt);
  frownT.current = Math.max(0, frownT.current - dt);

  // Listener “attention”: gently bias head/eye toward counterpart while attending
  const attendYaw = attend ? (position[0] < 0 ? +0.15 : -0.15) : 0; // left looks right, right looks left
  if (bones.head && headBase.current) {
    const shake = shakeT.current > 0 ? Math.sin(state.clock.elapsedTime * 8.5) * 0.18 * shakeT.current : 0;
    const idleYaw = Math.sin(t * 0.3) * 0.03;
    bones.head.rotation.y = headBase.current.y + idleYaw + shake + attendYaw;
  }
  if (bones.spine && spineBase.current) {
    const lean = leanT.current > 0 ? (0.15 * Math.sin(Math.min(1, leanT.current) * Math.PI)) : 0;
    bones.spine.rotation.x = spineBase.current.x + Math.sin(t * 0.8) * 0.03 - lean; // forward is negative x in many rigs
  }

  // Smile / Frown overlays on top of your existing smile logic
  if (picked.length) {
    picked.forEach(({ mesh, smile }) => {
      // @ts-ignore
      const infl = mesh.morphTargetInfluences as number[] | undefined;
      if (!infl) return;
      const sm = Math.min(1, smileT.current);
      const fr = Math.min(1, frownT.current);

      // apply smile to first two smile morphs if present
      smile.slice(0, 2).forEach((idx, i) => {
        infl[idx] = Math.max(infl[idx] ?? 0, (0.05 + 0.35 * sm) * (i === 0 ? 1.0 : 0.8));
      });

      // crude frown: if you have "frown" morphs, use them; if not, slightly reduce talk morph amplitude via drive (already handled)
      const frownIdx = pickMorphIndices(mesh, ["frown", "mouthfrown", "browdown", "brow_down"]);
      frownIdx.forEach((idx) => { infl[idx] = Math.max(infl[idx] ?? 0, 0.25 * fr); });
    });
  }
    // bob
    group.current.position.y = position[1] + Math.sin(t * 1.6) * 0.02;

    // mouth + jaw + smile
    const amp = Math.max(0, Math.min(1, speaking ? Math.max(0.25, drive) : drive));
    if (picked.length) {
      picked.forEach(({ mesh, talk, smile, jaw }) => {
        // @ts-ignore
        const infl = mesh.morphTargetInfluences as number[] | undefined;
        if (!infl) return;
        const base = 0.02;
        talk.forEach((idx, i) => {
          const phase = t * (2.1 + (i % 3) * 0.25) + i * 0.6;
          const wave = 0.05 + Math.max(0, Math.sin(phase)) * 0.22 * (0.3 + 0.7 * amp);
          infl[idx] = base + wave;
        });
        jaw.forEach((idx) => { infl[idx] = 0.08 + Math.abs(Math.sin(t * 3.8)) * (0.15 + 0.35 * amp); });
        smile.slice(0, 2).forEach((idx, i) => { infl[idx] = 0.02 + Math.max(0, Math.sin(t * 1.5 + i)) * 0.06; });
      });
    }
// Create mixer for THIS avatar
const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);

// Create an actions map keyed by clip name
const actions = useMemo(() => {
  const map: Record<string, THREE.AnimationAction> = {};
  for (const clip of animClips) {
    const a = mixer.clipAction(clip, scene);
    a.enabled = true;
    map[clip.name] = a;
  }
  console.log("🎬 Available actions:", Object.keys(map));
  return map;
}, [mixer, animClips, scene]);

// Convenience refs
const idleAction = actions["Idle_Base"];
const talkAction = actions["Talk_01"];

    // head/spine/hips idle
    if (bones.head && headBase.current) {
      nodEnergy.current = Math.max(0, nodEnergy.current - dt * 1.5);
      const nod = Math.sin(state.clock.elapsedTime * 7.0) * 0.18 * nodEnergy.current;
      const idleYaw = Math.sin(t * 0.3) * 0.03;
      bones.head.rotation.x = headBase.current.x + nod;
      bones.head.rotation.y = headBase.current.y + idleYaw;
    }
    if (bones.spine && spineBase.current) { bones.spine.rotation.x = spineBase.current.x + Math.sin(t * 0.8) * 0.03; }
    if (bones.hips && hipsBase.current) { bones.hips.position.x = hipsBase.current.px + Math.sin(t * 0.5) * 0.015; }

    // eyes + blinks
    saccadeT.current -= dt;
    if (saccadeT.current <= 0) {
      targetYaw.current = (Math.random() * 2 - 1) * 0.25;
      targetPitch.current = (Math.random() * 2 - 1) * 0.18;
      saccadeT.current = 0.8 + Math.random() * 1.5;
      if (Math.random() < 0.25) blinkT.current = 0.12 + Math.random() * 0.06;
    }
    const eyeEase = Math.min(1, dt * 12);
    if (bones.eyeL && bones.eyeR && eyesBase.current) {
      bones.eyeL.rotation.y = THREE.MathUtils.lerp(bones.eyeL.rotation.y, eyesBase.current.ly + targetYaw.current, eyeEase);
      bones.eyeR.rotation.y = THREE.MathUtils.lerp(bones.eyeR.rotation.y, eyesBase.current.ry + targetYaw.current, eyeEase);
      bones.eyeL.rotation.x = THREE.MathUtils.lerp(bones.eyeL.rotation.x, eyesBase.current.lx + targetPitch.current, eyeEase);
      bones.eyeR.rotation.x = THREE.MathUtils.lerp(bones.eyeR.rotation.x, eyesBase.current.rx + targetPitch.current, eyeEase);
    }
    const eyelidIdx: number[] = [];
    picked.forEach(({ mesh }) => {
      pickMorphIndices(mesh, ["blink", "eyeclose", "eyesclosed", "eye_lid", "eyelid"]).forEach((i) => eyelidIdx.push(i));
    });
    if (eyelidIdx.length) {
      if (blinkT.current > 0) { blinkT.current -= dt; blinkPhase.current = Math.min(1, blinkPhase.current + dt * 16); }
      else { blinkPhase.current = Math.max(0, blinkPhase.current - dt * 10); }
      const blinkAmt = Math.sin(Math.PI * Math.min(1, blinkPhase.current));
      picked.forEach(({ mesh }) => {
        // @ts-ignore
        const infl = mesh.morphTargetInfluences as number[] | undefined;
        if (!infl) return;
        eyelidIdx.forEach((idx) => { infl[idx] = Math.max(infl[idx] ?? 0, blinkAmt); });
      });
    }
  });
  
  return (
    <group ref={group} position={position} rotation={rotation as any}>
      <primitive object={scene} />
      {speaking && bubbleText && (
        <Html position={[0, 1.9, 0]} center distanceFactor={4}>
          <div className="max-w-[260px] rounded-2xl bg-white/90 px-3 py-2 text-xs shadow-xl ring-1 ring-black/10">
            <div className="mb-0.5 font-semibold">Speaking</div>
            <div className="leading-snug opacity-80">{bubbleText}</div>
          </div>
        </Html>
      )}
    </group>
  );
}


/** A simple ring under the active speaker */
function SpeakerRing({ position, active }: { position: [number, number, number]; active: boolean }) {
  const ref = useRef<THREE.Mesh | null>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = active ? 1.0 : 0.0;
    const s = ref.current.scale.x + (target - ref.current.scale.x) * Math.min(1, dt * 10);
    ref.current.scale.setScalar(0.7 + s * 0.6);
  });
  return (
    <mesh ref={ref} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.35, 0.45, 48]} />
      <meshStandardMaterial emissive="#66ccff" emissiveIntensity={active ? 1.4 : 0.0} transparent opacity={0.7} />
    </mesh>
  );
}

export default function RpmChatStage() {
  
  const [urlLeft, setUrlLeft] = useState<string>("https://models.readyplayer.me/68ba77a8c0360165451f5de7.glb");
  const [urlRight, setUrlRight] = useState<string>("https://models.readyplayer.me/68ba7c8cf9dc2e0836805d68.glb");

  const [input, setInput] = useState("");
  const [target, setTarget] = useState<Side>("left");
  const [mode, setMode] = useState<TalkMode>("text");

  const { speakingSide, bubbleText, driveL, driveR, nodKickL, nodKickR, speak, speakFromText } = useSpeechPlayer();
  const [reactionLeft,  setReactionLeft]  = useState<Reaction | null>(null);
const [reactionRight, setReactionRight] = useState<Reaction | null>(null);

  // inside RpmChatStage (it already has "use client" at the top of the file)
// inside RpmChatStage (this file already has "use client")
useEffect(() => {
  useGLTF.preload(urlLeft);
  useGLTF.preload(urlRight);
  useGLTF.preload("/anims/M_Standing_Idle_Variations_003.glb");
  useGLTF.preload("/anims/M_Standing_Expressions_010.glb");
}, [urlLeft, urlRight]);

  const handleSend = () => {
  const msg = input.trim();
  if (!msg) return;

  const rx = analyzeText(msg);

  if (mode === "text") {
    speakFromText(target, msg);
  } else {
    speak(target, msg);
  }

  if (target === "left") {
    setReactionLeft(rx);
    setReactionRight({ type: "none", strength: 0 }); // listener neutral (or small nod if you like)
  } else {
    setReactionRight(rx);
    setReactionLeft({ type: "none", strength: 0 });
  }

  setInput("");
};


  return (
    <div className="relative h-[85vh] w-full bg-gradient-to-b from-slate-100 to-slate-200">
      {/* Controls */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-2xl bg-white/90 p-3 shadow-lg ring-1 ring-black/10">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as Side)}
          className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          <option value="left">Send to LEFT</option>
          <option value="right">Send to RIGHT</option>
        </select>
       
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          
          className="min-w-[280px] rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-300"
        />
        <button
          onClick={handleSend}
          className="rounded-xl bg-sky-600 px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Send
        </button>
      </div>

      

      <Canvas shadows camera={{ position: [0, 1.5, 4.2], fov: 45 }}>
        <color attach="background" args={["#eef2f7"]} />
        <hemisphereLight intensity={0.55} groundColor="#e0e6ef" />
        <directionalLight
          position={[3, 5, 3]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[8, 64]} />
          <meshStandardMaterial color="#f4f6fb" />
        </mesh>

        {/* Avatars */}
        <Suspense fallback={null}>
          <group position={[0, 0, 0]}>
            <RpmAvatar
  url={urlLeft}
  position={[-0.9, 0, 0]}
  rotation={[0, Math.PI / 16, 0]}
  speaking={speakingSide === "left"}
  bubbleText={speakingSide === "left" ? bubbleText : ""}
  drive={driveL}
  nodKick={nodKickL}
  reaction={reactionLeft}                      // NEW
  attend={speakingSide === "right"}           // NEW
/>
<SpeakerRing position={[-0.9, 0.01, 0]} active={speakingSide === "left"} />

<RpmAvatar
  url={urlRight}
  position={[0.9, 0, 0]}
  rotation={[0, -Math.PI / 16, 0]}
  speaking={speakingSide === "right"}
  bubbleText={speakingSide === "right" ? bubbleText : ""}
  drive={driveR}
  nodKick={nodKickR}
  reaction={reactionRight}                     // NEW
  attend={speakingSide === "left"}            // NEW
/>

            <SpeakerRing position={[0.9, 0.01, 0]} active={speakingSide === "right"} />
          </group>
        </Suspense>

        <Environment preset="city" />
        <OrbitControls enablePan={false} minDistance={2.2} maxDistance={6} target={[0, 1.4, 0]} />
      </Canvas>

     
    </div>
  );
}

  