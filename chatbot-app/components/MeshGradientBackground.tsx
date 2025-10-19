'use client';

import React, { useEffect, useRef } from 'react';

type Props = {
  className?: string;
  colors?: string[];
  pointCount?: number;
  speed?: number; // px per frame at 60fps in CSS pixels (scaled by dpr internally)
  opacity?: number; // 0..1 visual opacity via canvas global alpha
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let stopped = false;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Point = {
      x: number;
      y: number;
      r: number; // radius
      vx: number;
      vy: number;
      rgb: { r: number; g: number; b: number };
    };
    let points: Point[] = [];

    const colorRgbs = colors
      .map(hexToRgb)
      .filter(Boolean) as { r: number; g: number; b: number }[];

    function resetPoints() {
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect?.width || window.innerWidth));
      height = Math.max(1, Math.floor(rect?.height || window.innerHeight));

      // Setup high-DPI canvas
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Create points
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
        } as Point;
      });
    }

    function tick() {
      if (stopped) return;

      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = 'lighter';

      for (const p of points) {
        // Move
        p.x += p.vx;
        p.y += p.vy;
        // Bounce at edges (soft bounds using radius)
        if (p.x < -p.r * 0.2 || p.x > width + p.r * 0.2) p.vx *= -1;
        if (p.y < -p.r * 0.2 || p.y > height + p.r * 0.2) p.vy *= -1;

        // Draw radial gradient
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

    function onResize() {
      resetPoints();
    }

    resetPoints();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', onResize);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [colors, pointCount, speed, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={
        `absolute inset-0 -z-10 w-full h-full ${className ?? ''}`
      }
      aria-hidden="true"
    />
  );
}

