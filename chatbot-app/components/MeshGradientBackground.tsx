'use client';

import React, { useEffect, useRef } from 'react';

type Props = {
  className?: string;
  colors?: string[];
  pointCount?: number;
  speed?: number;   // px per frame at 60fps in CSS pixels (scaled by dpr internally)
  opacity?: number; // 0..1 visual opacity via canvas global alpha
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
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
    const c = canvasRef.current;
    if (!c) return;

    const maybe = c.getContext('2d', { alpha: true }) as CanvasRenderingContext2D | null;
    if (!maybe) return;

    // ✅ Non-nullable alias captured by closures
    const ctx: CanvasRenderingContext2D = maybe;

    let raf = 0;
    let stopped = false;
    let width = 1;
    let height = 1;
    let dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    type RGB = { r: number; g: number; b: number };
    type Point = { x: number; y: number; r: number; vx: number; vy: number; rgb: RGB };
    let points: Point[] = [];

    const parsed = (colors?.length ? colors : ['#a78bfa']).map(hexToRgb).filter(Boolean) as RGB[];
    const colorRgbs: RGB[] = parsed.length ? parsed : [{ r: 167, g: 139, b: 250 }];

    function resetPoints() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.parentElement?.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1)));
      height = Math.max(1, Math.floor(rect?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 1)));

      // High-DPI setup
      dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Points
      const count = Math.max(3, pointCount);
      points = Array.from({ length: count }).map((_, i) => {
        const rgb = colorRgbs[i % colorRgbs.length];
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
          rgb,
        };
      });
    }

    function tick() {
      if (stopped) return;

      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = 'lighter';

      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;

        // Bounce (soft bounds)
        if (p.x < -p.r * 0.2 || p.x > width + p.r * 0.2) p.vx *= -1;
        if (p.y < -p.r * 0.2 || p.y > height + p.r * 0.2) p.vy *= -1;

        // Radial blob
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, 0.9)`);
        g.addColorStop(1, `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, 0)`);
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
