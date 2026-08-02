"use client";

import { useEffect, useRef } from "react";

/**
 * Fondo de partículas estilo "Google Antigravity": pequeños trazos de los tres
 * colores de marca que flotan a la deriva y se dispersan al pasar el mouse.
 * Canvas con pointer-events: none (el mouse se trackea por window), respeta
 * prefers-reduced-motion (render estático, sin animación).
 */

interface Particle {
  x: number;
  y: number;
  /** Deriva base (constante). */
  bvx: number;
  bvy: number;
  /** Impulso extra por repulsión del mouse (decae solo). */
  vx: number;
  vy: number;
  len: number;
  w: number;
  angle: number;
  spin: number;
  color: string;
  alpha: number;
}

const MOUSE_RADIUS = 150;
const MOUSE_FORCE = 2.2;
const FRICTION = 0.9;

export function ParticleField({
  className,
}: {
  className?: string;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const styles = getComputedStyle(document.documentElement);
    const palette = [
      styles.getPropertyValue("--brand-aqua").trim() || "#008e97",
      styles.getPropertyValue("--brand-blue").trim() || "#005778",
      styles.getPropertyValue("--brand-orange").trim() || "#f58220",
    ];

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let raf = 0;
    const mouse = { x: -9999, y: -9999 };

    function seed(): void {
      const count = Math.min(320, Math.floor((width * height) / 5500));
      particles = Array.from({ length: count }, () => {
        const speed = 0.08 + Math.random() * 0.22;
        const dir = Math.random() * Math.PI * 2;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          bvx: Math.cos(dir) * speed,
          bvy: Math.sin(dir) * speed,
          vx: 0,
          vy: 0,
          len: 5 + Math.random() * 10,
          w: 1.5 + Math.random() * 2,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.02,
          color: palette[Math.floor(Math.random() * palette.length)],
          alpha: 0.25 + Math.random() * 0.55,
        };
      });
    }

    function resize(): void {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function draw(): void {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        // Repulsión del mouse con caída suave hacia el borde del radio.
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_RADIUS * MOUSE_RADIUS && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = ((MOUSE_RADIUS - d) / MOUSE_RADIUS) * MOUSE_FORCE;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.vx *= FRICTION;
        p.vy *= FRICTION;
        p.x += p.bvx + p.vx;
        p.y += p.bvy + p.vy;
        p.angle += p.spin + (Math.abs(p.vx) + Math.abs(p.vy)) * 0.01;

        // Wrap en los bordes para que el campo nunca se vacíe.
        if (p.x < -24) p.x = width + 24;
        else if (p.x > width + 24) p.x = -24;
        if (p.y < -24) p.y = height + 24;
        else if (p.y > height + 24) p.y = -24;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-p.len / 2, -p.w / 2, p.len, p.w, p.w / 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function loop(): void {
      draw();
      raf = requestAnimationFrame(loop);
    }

    function onMove(e: MouseEvent): void {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    function onLeave(): void {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    window.addEventListener("resize", resize);
    if (reduced) {
      draw(); // un frame estático, sin animación ni mouse
    } else {
      window.addEventListener("mousemove", onMove);
      document.addEventListener("mouseleave", onLeave);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
