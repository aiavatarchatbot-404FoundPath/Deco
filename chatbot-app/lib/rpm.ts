// lib/rpm.ts
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
    } catch {}
  }
  return null;
}

export function toThumbnail(glbUrl?: string | null): string | null {
  if (!glbUrl) return null;
  return glbUrl.replace(/\.glb(\?.*)?$/, '.png$1');
}
// lib/rpm.ts
import { useEffect, useState } from "react";

export function useValidatedRpmGlb(raw?: string | null) {
  const [glb, setGlb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!raw) { setGlb(null); return; }
      const { glb: candidates } = normalizeRpm(raw);
      const ok = await firstReachable(candidates);
      if (!cancelled) setGlb(ok);   // null if none reachable
    })();

    return () => { cancelled = true; };
  }, [raw]);

  return glb;
}
