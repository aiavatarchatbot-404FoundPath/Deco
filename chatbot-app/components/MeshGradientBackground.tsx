'use client';

import React, { useEffect, useRef } from 'react';

type Props = {
  className?: string;
  colors?: string[];   // any CSS color: #fff, #112233, rgb(...), hsl(...), names
  pointCount?: number;
  speed?: number;      // px per frame @60fps (scaled by dpr)
  opacity?: number;    // 0..1
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export default function MeshGradientBackground({
  className = '',
  colors = ['#f3e8ff', '#ffe4e6', '#dbeafe', '#e9d5ff', '#fecdd3', '#bfdbfe'],
  pointCount = 6,
  speed = 0.25,
  opacity = 0.65,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // bail in non-browser (defensive)
    if (typeof window === 'undefined') return;

    const node = canvasRef.current;
    if (!node) return;

    const maybe = node.getContext('2d', { alpha: true }) as CanvasRenderingContext2D | null;
    if (!maybe) return;
    const ctx: CanvasRenderingContext2D = maybe; // non-nullable for closures

    // state
    let raf = 0;
    let stopped = false;
    let width = 1;
    let height = 1;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Point = { x: number; y: number; r: number; vx: number; vy: number; color: string };
    let points: Point[] = [];

    // palette (never empty)
    const palette = (Array.isArray(colors) && colors.length > 0 ? colors : ['#a78bfa']).map(String);
    const safePalette = palette.length ? palette : ['#a78bfa'];

    function resetPoints() {
      const c = canvasRef.current;
      if (!c) return;

      const rect = c.parentElement?.getBoundingClientRect();
      const w = rect?.width ?? window.innerWidth;
      const h = rect?.height ?? window.innerHeight;
      width = Math.max(1, Math.floor(isFinite(w) ? w : 1));
      height = Math.max(1, Math.floor(isFinite(h) ? h : 1));

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(width * dpr);
      c.height = Math.floor(height * dpr);
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(3, pointCount);
      points = Array.from({ length: count }).map((_, i) => {
        const color = safePalette[i % safePalette.length];
        const base = Math.min(width, height);
        const radius = clamp(base * (0.28 + Math.random() * 0.22), 180, 480);
        const s = speed * (0.5 + Math.random());
        const dir = Math.random() * Math.PI * 2;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: radius,
          vx: Math.cos(dir) * s,
          vy: Math.sin(dir) * s,
          color,
        };
      });
    }

    function tick() {
      if (stopped) return;

      try {
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = clamp(opacity, 0, 1);
        ctx.globalCompositeOperation = 'lighter';

        for (const p of points) {
          // move
          p.x += p.vx; p.y += p.vy;

          // soft bounce
          if (p.x < -p.r * 0.2 || p.x > width  + p.r * 0.2) p.vx *= -1;
          if (p.y < -p.r * 0.2 || p.y > height + p.r * 0.2) p.vy *= -1;

          const r = Math.max(1, p.r); // radius must be > 0
          // gradient: center → color, edge → transparent
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'transparent');

          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
      } catch (err) {
        // don’t crash the whole app if a frame blows up
        console.error('MeshGradientBackground tick error:', err);
        stopped = true;
        return;
      }

      raf = window.requestAnimationFrame(tick);
    }

    const onResize = () => {
      try { resetPoints(); } catch (e) { console.error('resetPoints error:', e); }
    };

    try {
      resetPoints();
      raf = window.requestAnimationFrame(tick);
      window.addEventListener('resize', onResize);
    } catch (e) {
      console.error('MeshGradientBackground init error:', e);
    }

    return () => {
      stopped = true;
      try { if (raf) cancelAnimationFrame(raf); } catch {}
      try { window.removeEventListener('resize', onResize); } catch {}
    };
  }, [colors, pointCount, speed, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 -z-10 w-full h-full ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}
