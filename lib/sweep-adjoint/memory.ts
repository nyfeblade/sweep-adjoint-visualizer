import type { MeasuredHold, MeasuredMemory, MemoryReport, TapeAllocation } from "./types";

/** Fat AD tape: x_old, H, g, y, plus temporaries per vertex per sweep. */
export const UNROLLED_BYTES_PER_VERTEX_ITER = 256;

/** Reverse-sweep workspace is one colored iteration, not a K-deep tape. */
export const SWEEP_BYTES_PER_VERTEX = 256;

/** IFT keeps the residual, adjoint, and CG scratch — O(N), not O(K·N). */
export const IFT_BYTES_PER_VERTEX = 96;

/** Real unrolled tape / rematerialize workspace: 2 float64 coords per vertex. */
export const COORDS_PER_VERTEX = 2;

/** Measured stride: 2 × float64 = 16 B per vertex per stored iteration. */
export const MEASURED_BYTES_PER_VERTEX = COORDS_PER_VERTEX * Float64Array.BYTES_PER_ELEMENT;

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

/** Expected `.byteLength` of the unrolled position tape: K × N × 16 B. */
export function measuredTapeBytesFor(n: number, sweeps: number): number {
  return Math.max(0, n) * Math.max(0, sweeps) * MEASURED_BYTES_PER_VERTEX;
}

/** Expected `.byteLength` of the sweep rematerialize workspace: N × 16 B. */
export function measuredSweepBytesFor(n: number): number {
  return Math.max(0, n) * MEASURED_BYTES_PER_VERTEX;
}

/** The K-deep position tape `unrolledAdjoint` actually allocates. */
export function createUnrolledTape(n: number, sweeps: number): Float64Array {
  return new Float64Array(Math.max(0, n) * Math.max(0, sweeps) * COORDS_PER_VERTEX);
}

/** The one-iteration rematerialize buffer `sweepAdjoint` actually allocates. */
export function createSweepWorkspace(n: number): Float64Array {
  return new Float64Array(Math.max(0, n) * COORDS_PER_VERTEX);
}

type PerformanceWithMemory = Performance & {
  memory?: { usedJSHeapSize?: number };
};

function readHeapSize(): number | null {
  const perf = globalThis.performance as PerformanceWithMemory | undefined;
  const used = perf?.memory?.usedJSHeapSize;
  return typeof used === "number" && Number.isFinite(used) ? used : null;
}

function touch(view: Float64Array): void {
  if (view.length === 0) return;
  view[0] = 1;
  view[view.length - 1] = 1;
}

function canReuse(buffer: Float64Array | undefined, length: number): buffer is Float64Array {
  return Boolean(buffer) && buffer.length === length;
}

/**
 * Allocate (or reuse) the TypedArrays the two adjoints keep and return the
 * sum of their `.byteLength`. This is a measured hold, not the schematic
 * K×N×256 model and not a `performance.memory` guess.
 */
export function measureSolverWorkspaces(
  n: number,
  sweeps: number,
  reuse?: MeasuredHold | null,
): MeasuredMemory {
  const nodes = Math.max(0, n);
  const k = Math.max(0, sweeps);
  const tapeLen = nodes * k * COORDS_PER_VERTEX;
  const sweepLen = nodes * COORDS_PER_VERTEX;
  const before = readHeapSize();

  try {
    const tape = canReuse(reuse?.tape, tapeLen) ? reuse.tape : createUnrolledTape(nodes, k);
    const sweepWorkspace = canReuse(reuse?.sweepWorkspace, sweepLen)
      ? reuse.sweepWorkspace
      : createSweepWorkspace(nodes);

    touch(tape);
    touch(sweepWorkspace);

    const after = readHeapSize();
    const heapDeltaBytes =
      before !== null && after !== null ? Math.max(0, after - before) : null;

    return {
      ok: true,
      n: nodes,
      sweeps: k,
      tapeBytes: tape.byteLength,
      sweepBytes: sweepWorkspace.byteLength,
      heapDeltaBytes,
      hold: { tape, sweepWorkspace },
    };
  } catch {
    return {
      ok: false,
      n: nodes,
      sweeps: k,
      tapeBytes: measuredTapeBytesFor(nodes, k),
      sweepBytes: measuredSweepBytesFor(nodes),
      heapDeltaBytes: null,
      reason: "oom",
    };
  }
}
