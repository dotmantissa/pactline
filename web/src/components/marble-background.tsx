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

function smoothstep(value: number) {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
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

    const pointerInfluence = (x: number, y: number, radius: number) => {
      if (!pointer.active) return 0;
      return smoothstep(1 - Math.hypot(x - pointer.x, y - pointer.y) / radius);
    };

    const boundaryPoint = (index: number, time: number, radius: number): Point => {
      const progress = index / 42;
      const y = progress * height;
      const broadWave = Math.sin(progress * 8.2 + time * 0.22) * width * 0.13;
      const fineWave = Math.sin(progress * 25 - time * 0.38) * width * 0.025;
      const fold = Math.sin(progress * 3.1 - time * 0.17) * width * 0.045;
      let x = width * 0.48 + broadWave + fineWave + fold;
      const influence = pointerInfluence(x, y, radius);

      if (influence > 0) {
        const direction = x >= pointer.x ? 1 : -1;
        const spread = width * 0.25 * influence * influence * clamp(pointer.speed / 22, 0.38, 1);
        x += direction * spread;
        x += (y - pointer.y) * influence * 0.12;
      }

      return { x, y };
    };

    const drawField = (boundary: Point[], side: "left" | "right", color: string, alpha: number) => {
      context.beginPath();
      if (side === "left") {
        context.moveTo(0, 0);
        boundary.forEach((point) => context.lineTo(point.x, point.y));
        context.lineTo(0, height);
      } else {
        context.moveTo(width, 0);
        context.lineTo(boundary[0].x, boundary[0].y);
        boundary.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.lineTo(width, height);
      }
      context.closePath();
      context.fillStyle = color;
      context.globalAlpha = alpha;
      context.fill();
    };

    const drawTendril = (
      start: Point,
      end: Point,
      color: string,
      widthValue: number,
      alpha: number,
      time: number,
      index: number,
    ) => {
      const direction = end.x >= start.x ? 1 : -1;
      const curve = Math.sin(time * 0.24 + index * 1.7) * height * 0.045;
      const controlOne = {
        x: start.x + (end.x - start.x) * 0.28,
        y: start.y + curve,
      };
      const controlTwo = {
        x: start.x + (end.x - start.x) * 0.78,
        y: end.y - curve + Math.sin(index) * height * 0.025,
      };
      const localInfluence = pointerInfluence(start.x, start.y, Math.min(width, height) * 0.3);

      context.beginPath();
      context.moveTo(start.x, start.y);
      context.bezierCurveTo(
        controlOne.x + direction * localInfluence * width * 0.1,
        controlOne.y,
        controlTwo.x + direction * localInfluence * width * 0.14,
        controlTwo.y,
        end.x,
        end.y,
      );
      context.strokeStyle = color;
      context.globalAlpha = alpha;
      context.lineWidth = widthValue;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    };

    const draw = (timestamp: number) => {
      const elapsed = (timestamp - startedAt) / 1000;
      const time = reducedMotion ? 0 : elapsed;
      const radius = Math.min(width, height) * 0.28;
      const boundary = Array.from({ length: 43 }, (_, index) => boundaryPoint(index, time, radius));

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      drawField(boundary, "left", "#5aff88", 0.095);
      drawField(boundary, "right", "#1d1d1d", 0.105);

      for (let index = 0; index < 13; index += 1) {
        const progress = (index + 1) / 14;
        const boundaryIndex = Math.round(progress * 42);
        const start = boundary[boundaryIndex];
        const reachesLeft = index % 2 === 0;
        const reach = width * (0.1 + (index % 4) * 0.055);
        const end = {
          x: start.x + (reachesLeft ? -reach : reach),
          y: start.y + Math.sin(index * 2.4 + time * 0.2) * height * 0.07,
        };
        const color = reachesLeft ? "#1d1d1d" : "#5aff88";
        const lineWidth = Math.max(12, width * (0.028 + (index % 3) * 0.012));
        drawTendril(start, end, color, lineWidth, 0.13, time, index);

        if (index % 3 === 0) {
          const innerEnd = {
            x: start.x + (reachesLeft ? -reach * 0.62 : reach * 0.62),
            y: end.y + height * 0.035,
          };
          drawTendril(start, innerEnd, reachesLeft ? "#5aff88" : "#ffffff", Math.max(5, lineWidth * 0.24), 0.11, time, index + 20);
        }
      }

      for (let index = 0; index < 16; index += 1) {
        const progress = (index + 0.5) / 16;
        const anchor = boundary[Math.round(progress * 42)];
        const reachesLeft = index % 2 === 1;
        const distance = width * (0.07 + (index % 5) * 0.024);
        const x = anchor.x + (reachesLeft ? -distance : distance);
        const y = anchor.y + Math.sin(index * 1.4 + time * 0.18) * height * 0.025;
        const localInfluence = pointerInfluence(x, y, radius);
        const direction = reachesLeft ? -1 : 1;
        const spread = direction * localInfluence * width * 0.08 * clamp(pointer.speed / 22, 0.38, 1);
        const dropRadius = Math.max(3, width * (0.006 + (index % 3) * 0.002));

        context.beginPath();
        context.ellipse(
          x + spread,
          y,
          dropRadius * (1.5 + (index % 3) * 0.5),
          dropRadius,
          Math.sin(index * 0.8),
          0,
          TAU,
        );
        context.fillStyle = reachesLeft ? "#1d1d1d" : "#5aff88";
        context.globalAlpha = 0.14;
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
