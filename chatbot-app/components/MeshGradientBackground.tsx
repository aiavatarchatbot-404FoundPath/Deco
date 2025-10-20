'use client';

import React, { useEffect, useRef } from 'react';

type Props = {
  className?: string;
  colors?: string[];   // any CSS colors: #fff, #112233, rgb(...), hsl(...), 'rebeccapurple', etc.
  pointCount?: number;
  speed?: number;      // px per frame at 60fps (scaled by dpr internally)
  opacity?: number;    // 0..1 overall opacity (uses globalAlpha)
};

export default function MeshGradientBackground({
  className = '',
  colors = ['#f3e8ff', '#ffe4e6', '#dbeafe', '#e9d5ff', '#fecdd3', '#bfdbfe'],
  pointCount = 6,
  speed = 0.25,
  opacity = 0.65,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const maybe = c.getContext('2d', { alpha: true }) as CanvasRenderingContext2D | null;
    if (!maybe) return;
    const ctx: CanvasRenderingContext2D = maybe; // non-nullable alias for closures

    let raf = 0;
    let stopped = false;
    let width = 1;
    let height = 1;
    let dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    type Point = { x: number; y: number; r: number; vx: number; vy: number; color: string };
    let points: Point[] = [];

    // normalize color list; ensure we have at least one valid string
    const palette: string[] = (Array.isArray(colors) && colors.length > 0 ? colors : ['#a78bfa']).map(String);
    const safePalette: string[] = palette.length ? palette : ['#a78bfa'];

    function resetPoints() {
      const node = canvasRef.current;
      if (!node) return;

      const rect = node.parentElement?.getBoundingClientRect();
      width  = Math.max(1, Math.floor(rect?.width  ?? (typeof window !== 'undefined' ? window.innerWidth  : 1)));
      height = Math.max(1, Math.floor(rect?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 1)));

      dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      node.width = Math.floor(width * dpr);
      node.height = Math.floor(height * dpr);
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(3, pointCount);
      points = Array.from({ length: count }).map((_, i) => {
        const color = safePalette[i % safePalette.length];
        const base = Math.min(width, height);
        const radius = Math.max(180, Math.min(480, base * (0.28 + Math.random() * 0.22)));
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

      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = 'lighter';

      for (const p of points) {
        // move
        p.x += p.vx; p.y += p.vy;

        // soft bounce
        if (p.x < -p.r * 0.2 || p.x > width  + p.r * 0.2) p.vx *= -1;
        if (p.y < -p.r * 0.2 || p.y > height + p.r * 0.2) p.vy *= -1;

        // gradient: center uses the CSS color, edge fades to transparent
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'transparent');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(tick);
    }

    const onResize = () => resetPoints();

    resetPoints();
    raf = requestAnimationFrame(tick);
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
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
