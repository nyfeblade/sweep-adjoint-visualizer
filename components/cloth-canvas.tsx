"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import type { ClothState, OverlayMode } from "@/lib/sweep-adjoint";

const IFT_RED = "#f43f5e";
const SWEEP_BLUE = "#3b82f6";
const THREAD = "rgba(148, 163, 184, 0.45)";
const PIN = "#94a3b8";
const NODE = "#e2e8f0";
const HANDLE = "#fbbf24";
const PROBE = "#c084fc";

type ClothCanvasProps = {
  state: ClothState;
  positions: Float64Array | null;
  sweepAdj: Float64Array | null;
  iftAdj: Float64Array | null;
  overlay: OverlayMode;
  disabled?: boolean;
  onDragStart: () => void;
  onDragEnd: (index: number, x: number, y: number) => void;
};

export function ClothCanvas({
  state,
  positions,
  sweepAdj,
  iftAdj,
  overlay,
  disabled = false,
  onDragStart,
  onDragEnd,
}: ClothCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<number | null>(null);
  const lastTargetRef = useRef<{ index: number; x: number; y: number } | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Float64Array | null>(null);
  const [preview, setPreview] = useState<Float64Array | null>(null);
  const display = preview && positions === dragOrigin ? preview : positions;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCloth(ctx, canvas, state, display, sweepAdj, iftAdj, overlay);
  }, [state, display, sweepAdj, iftAdj, overlay]);

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const layout = layoutOf(canvas, state);
    const mx = ((clientX - rect.left) * (canvas.width / rect.width) - layout.ox) / layout.scale;
    const my = (layout.oy - (clientY - rect.top) * (canvas.height / rect.height)) / layout.scale;
    return { x: mx, y: my };
  };

  const movePreview = (index: number, x: number, y: number) => {
    lastTargetRef.current = { index, x, y };
    setPreview((prev) => {
      const src = prev ?? positions ?? state.x;
      const next = new Float64Array(src);
      next[2 * index] = x;
      next[2 * index + 1] = y;
      return next;
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const world = toWorld(event.clientX, event.clientY);
    if (!world) return;
    const x = positions ?? state.x;
    let best = state.handle;
    let bestD = Infinity;
    for (let i = 0; i < state.n; i++) {
      if (state.pinned[i]) continue;
      const dx = x[2 * i] - world.x;
      const dy = x[2 * i + 1] - world.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 || bestD > 2.4) return;
    dragRef.current = best;
    setDragOrigin(positions);
    event.currentTarget.setPointerCapture(event.pointerId);
    lastTargetRef.current = { index: best, x: world.x, y: world.y };
    const src = positions ?? state.x;
    const seeded = new Float64Array(src);
    seeded[2 * best] = world.x;
    seeded[2 * best + 1] = world.y;
    setPreview(seeded);
    onDragStart();
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || dragRef.current === null) return;
    const world = toWorld(event.clientX, event.clientY);
    if (!world) return;
    movePreview(dragRef.current, world.x, world.y);
  };

  const endDrag = () => {
    const target = lastTargetRef.current;
    if (dragRef.current === null || !target) return;
    dragRef.current = null;
    onDragEnd(target.index, target.x, target.y);
  };

  return (
    <div className="relative">
      <p className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-black/55 px-2 py-1 text-sm font-medium text-amber-300">
        Drag the gold node.
      </p>
      <p className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[90%] text-[11px] leading-4 text-slate-300/90">
        Arrows are gradient estimates — red IFT, blue sweep-adjoint — not forces on the cloth.
      </p>
      <canvas
        ref={canvasRef}
        className="h-[min(72vw,560px)] w-full cursor-grab touch-none rounded-xl bg-[#0b1018] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      />
    </div>
  );
}

function layoutOf(canvas: HTMLCanvasElement, state: ClothState) {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 520;
  const w = Math.floor(cssW * dpr);
  const h = Math.floor(cssH * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const pad = 48 * dpr;
  const spanX = Math.max(1, (state.nx - 1) * state.params.spacing);
  const spanY = Math.max(1, (state.ny - 1) * state.params.spacing + 4);
  const scale = Math.min((w - pad * 2) / (spanX + 4), (h - pad * 2) / spanY);
  const ox = pad + 2 * scale;
  const oy = h - pad;
  return { w, h, scale, ox, oy, dpr };
}

function drawCloth(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: ClothState,
  positions: Float64Array | null,
  sweepAdj: Float64Array | null,
  iftAdj: Float64Array | null,
  overlay: OverlayMode,
) {
  const { w, h, scale, ox, oy, dpr } = layoutOf(canvas, state);
  const x = positions ?? state.rest;
  const px = (i: number) => ox + x[2 * i] * scale;
  const py = (i: number) => oy - x[2 * i + 1] * scale;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b1018";
  ctx.fillRect(0, 0, w, h);

  if (state.n === 0) return;

  ctx.lineWidth = Math.max(1, 0.9 * dpr);
  ctx.strokeStyle = THREAD;
  ctx.beginPath();
  for (const spring of state.springs) {
    if (spring.k < state.params.springK) continue;
    ctx.moveTo(px(spring.i), py(spring.i));
    ctx.lineTo(px(spring.j), py(spring.j));
  }
  ctx.stroke();

  let maxLen = 0;
  const measure = (adj: Float64Array | null) => {
    if (!adj) return;
    for (let i = 0; i < state.n; i++) {
      const len = Math.hypot(adj[2 * i], adj[2 * i + 1]);
      if (len > maxLen) maxLen = len;
    }
  };
  if (overlay === "both" || overlay === "ift") measure(iftAdj);
  if (overlay === "both" || overlay === "sweep") measure(sweepAdj);
  const arrowScale = maxLen > 1e-12 ? (2.15 * state.params.spacing * scale) / maxLen : 0;

  const drawField = (adj: Float64Array, color: string) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.2, 1.35 * dpr);
    ctx.globalAlpha = overlay === "both" ? 0.92 : 1;
    for (let i = 0; i < state.n; i++) {
      const ax = adj[2 * i] * arrowScale;
      const ay = -adj[2 * i + 1] * arrowScale;
      if (ax * ax + ay * ay < 9) continue;
      arrow(ctx, px(i), py(i), px(i) + ax, py(i) + ay, 5 * dpr);
    }
    ctx.globalAlpha = 1;
  };

  if ((overlay === "both" || overlay === "ift") && iftAdj) drawField(iftAdj, IFT_RED);
  if ((overlay === "both" || overlay === "sweep") && sweepAdj) drawField(sweepAdj, SWEEP_BLUE);

  for (let i = 0; i < state.n; i++) {
    const r =
      i === state.handle ? 5.2 * dpr : i === state.probe ? 4.4 * dpr : state.pinned[i] ? 2.6 * dpr : 2.1 * dpr;
    ctx.beginPath();
    ctx.fillStyle = i === state.handle ? HANDLE : i === state.probe ? PROBE : state.pinned[i] ? PIN : NODE;
    ctx.arc(px(i), py(i), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  head: number,
) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const angle = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(angle - 0.45), y1 - head * Math.sin(angle - 0.45));
  ctx.lineTo(x1 - head * Math.cos(angle + 0.45), y1 - head * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
}
