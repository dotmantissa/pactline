"use client";

import { useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
};

type PointerState = Point & {
  active: boolean;
  lastX: number;
  lastY: number;
  speed: number;
};

const TAU = Math.PI * 2;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export default function MarbleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const pointer: PointerState = {
      x: 0,
      y: 0,
      active: false,
      lastX: 0,
      lastY: 0,
      speed: 0,
    };
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let startedAt = performance.now();
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const drawRibbon = (
      points: Point[],
      color: string,
      lineWidth: number,
      alpha: number,
    ) => {
      if (points.length < 2) return;
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
      }
      const last = points[points.length - 1];
      context.lineTo(last.x, last.y);
      context.strokeStyle = color;
      context.globalAlpha = alpha;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    };

    const draw = (timestamp: number) => {
      const elapsed = (timestamp - startedAt) / 1000;
      const time = reducedMotion ? 0 : elapsed;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";

      const center = width * 0.46;
      const pointerRadius = Math.min(width, height) * 0.24;
      const pointerStrength = pointer.active ? clamp(pointer.speed / 24, 0.35, 1) : 0;
      const boundary: Point[] = [];

      for (let index = 0; index <= 32; index += 1) {
        const progress = index / 32;
        const y = progress * height;
        const slowWave = Math.sin(progress * 8.4 + time * 0.24) * width * 0.06;
        const fastWave = Math.sin(progress * 21 - time * 0.42) * width * 0.018;
        let x = center + slowWave + fastWave;

        if (pointer.active) {
          const distanceX = x - pointer.x;
          const distanceY = y - pointer.y;
          const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
          const influence = Math.max(0, 1 - distance / pointerRadius);
          const direction = distanceX >= 0 ? 1 : -1;
          x += direction * influence * influence * width * 0.15 * pointerStrength;
          x += (distanceY / Math.max(pointerRadius, 1)) * influence * width * 0.04 * pointerStrength;
        }

        boundary.push({ x, y });
      }

      const darkField = [...boundary, { x: 0, y: height }, { x: 0, y: 0 }];
      context.beginPath();
      context.moveTo(darkField[0].x, darkField[0].y);
      darkField.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.closePath();
      context.fillStyle = "#1d1d1d";
      context.globalAlpha = 0.048;
      context.fill();

      for (let ribbon = -3; ribbon <= 3; ribbon += 1) {
        const points = boundary.map((point, index) => {
          const progress = index / 32;
          const drift = Math.sin(progress * 13 + time * (0.3 + ribbon * 0.018) + ribbon) * width * 0.012;
          const separation = ribbon * width * 0.017;
          let x = point.x + drift + separation;

          if (pointer.active) {
            const distanceX = x - pointer.x;
            const distanceY = point.y - pointer.y;
            const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
            const influence = Math.max(0, 1 - distance / pointerRadius);
            const direction = distanceX >= 0 ? 1 : -1;
            x += direction * influence * influence * width * 0.11 * pointerStrength;
          }

          return { x, y: point.y };
        });

        drawRibbon(
          points,
          ribbon % 2 === 0 ? "#5aff88" : "#1d1d1d",
          Math.max(8, width * (ribbon === 0 ? 0.02 : 0.008)),
          ribbon === 0 ? 0.095 : 0.05,
        );
      }

      for (let index = 0; index < 15; index += 1) {
        const progress = (index + 1) / 16;
        const y = progress * height + Math.sin(time * 0.22 + index) * height * 0.035;
        const boundaryPoint = boundary[Math.round(progress * 32)];
        const direction = index % 2 === 0 ? -1 : 1;
        const distance = width * (0.045 + (index % 4) * 0.014);
        const x = boundaryPoint.x + direction * distance;
        const radius = Math.max(2, width * (0.004 + (index % 3) * 0.0015));
        const localPointerDistance = Math.hypot(x - pointer.x, y - pointer.y);
        const pointerLift = pointer.active && localPointerDistance < pointerRadius
          ? (1 - localPointerDistance / pointerRadius) * width * 0.035 * pointerStrength
          : 0;

        context.beginPath();
        context.ellipse(
          x + direction * pointerLift,
          y,
          radius * (1.8 + (index % 3) * 0.4),
          radius,
          Math.sin(index) * 0.5,
          0,
          TAU,
        );
        context.fillStyle = index % 2 === 0 ? "#5aff88" : "#1d1d1d";
        context.globalAlpha = 0.065;
        context.fill();
      }

      context.globalAlpha = 1;
      pointer.speed *= 0.9;

      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const movement = Math.hypot(event.clientX - pointer.lastX, event.clientY - pointer.lastY);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.speed = clamp(pointer.speed * 0.4 + movement, 0, 48);
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      window.cancelAnimationFrame(animationFrame);
      startedAt = performance.now();
      draw(startedAt);
    };

    resize();
    draw(startedAt);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionPreference.addEventListener("change", handleMotionPreference);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      motionPreference.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  return <canvas ref={canvasRef} className="marble-background" aria-hidden="true" />;
}
