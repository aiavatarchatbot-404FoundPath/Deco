export function normalizeRpm(input?: string | null) {
  if (!input) return { id: "", glb: [], png: [] };
  const raw = input.trim();
  const id = raw.split("/").pop()?.replace(/\.(glb|gltf|png).*$/i, "") ?? "";
  const glb = [
    `https://models.readyplayer.me/${id}.glb`,
    `https://api.readyplayer.me/v1/avatars/${id}.glb`,
  ];
  const png = [
    `https://models.readyplayer.me/${id}.png`,
    `https://api.readyplayer.me/v1/avatars/${id}.png`,
  ];
  return { id, glb, png };
}

export async function firstReachable(urls: string[]) {
  for (const u of urls) {
    try {
      const res = await fetch(u, { method: "HEAD", cache: "no-store" });
      if (res.ok) return u;
    } catch {
    }
  }
  return null;
}

export function toThumbnail(glbUrl?: string | null): string | null {
  if (!glbUrl) return null;
  return glbUrl.replace(/\.glb(\?.*)?$/, '.png$1');
}
import { useEffect, useState } from "react";

export function useValidatedRpmGlb(raw?: string | null) {
  const [glb, setGlb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!raw) { setGlb(null); return; }

      const trimmed = raw.trim();
      const looksFullGlb = /^https?:\/\/./i.test(trimmed) && /\.glb(\?.*)?$/i.test(trimmed);
      const { glb: candidates } = normalizeRpm(trimmed);

      const optimistic = looksFullGlb ? trimmed : candidates[0];
      setGlb(optimistic ?? null);
      if (optimistic) {
        console.log('[useValidatedRpmGlb] raw:', trimmed, 'optimistic:', optimistic);
      }

      // Background
      const ok = await firstReachable(candidates);
      if (!cancelled && ok && ok !== optimistic) {
        console.log('[useValidatedRpmGlb] verified:', ok);
        setGlb(ok);
      }
    })();

    return () => { cancelled = true; };
  }, [raw]);

  return glb;
}
