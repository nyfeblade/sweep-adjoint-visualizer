import type { MemoryReport, TapeAllocation } from "./types";

/** Fat AD tape: x_old, H, g, y, plus temporaries per vertex per sweep. */
export const UNROLLED_BYTES_PER_VERTEX_ITER = 256;

/** Reverse-sweep workspace is one colored iteration, not a K-deep tape. */
export const SWEEP_BYTES_PER_VERTEX = 256;

/** IFT keeps the residual, adjoint, and CG scratch — O(N), not O(K·N). */
export const IFT_BYTES_PER_VERTEX = 96;

export function memoryReport(n: number, sweeps: number): MemoryReport {
  const k = Math.max(0, sweeps);
  const nodes = Math.max(0, n);
  return {
    n: nodes,
    sweeps: k,
    unrolledBytes: k * nodes * UNROLLED_BYTES_PER_VERTEX_ITER,
    sweepBytes: nodes * SWEEP_BYTES_PER_VERTEX,
    iftBytes: nodes * IFT_BYTES_PER_VERTEX,
  };
}

export function tryAllocateTape(bytes: number): TapeAllocation {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return { ok: false, bytes: 0, reason: "oom" };
  }
  const rounded = Math.ceil(bytes);
  try {
    const buffer = new ArrayBuffer(rounded);
    const view = new Uint8Array(buffer);
    if (rounded > 0) {
      view[0] = 1;
      view[rounded - 1] = 1;
    }
    return { ok: true, bytes: rounded, buffer };
  } catch {
    return { ok: false, bytes: rounded, reason: "oom" };
  }
}

export function tapeBytesFor(n: number, sweeps: number): number {
  return Math.max(0, n) * Math.max(0, sweeps) * UNROLLED_BYTES_PER_VERTEX_ITER;
}
