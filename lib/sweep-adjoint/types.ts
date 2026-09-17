export type ClothParams = {
  spacing: number;
  springK: number;
  shearK: number;
  pinK: number;
  handleK: number;
  gravityY: number;
  regularizer: number;
};

export type Spring = {
  i: number;
  j: number;
  rest: number;
  k: number;
};

export type ClothState = {
  nx: number;
  ny: number;
  n: number;
  x: Float64Array;
  rest: Float64Array;
  force: Float64Array;
  pinned: Uint8Array;
  handle: number;
  probe: number;
  targetX: number;
  targetY: number;
  springs: Spring[];
  params: ClothParams;
};

export type LocalSystem = {
  g0: number;
  g1: number;
  h00: number;
  h01: number;
  h10: number;
  h11: number;
};

export type MethodName = "unrolled" | "ift" | "sweep";

export type ExplainerResult = {
  x: Float64Array;
  loss: number;
  sweepAdj: Float64Array;
  unrolledAdj: Float64Array;
  iftAdj: Float64Array;
  sweepVsUnrolled: number;
  iftVsUnrolled: number;
  iftVsSweep: number;
  sweeps: number;
  cgIters: number;
  memory: MemoryReport;
};

export type MemoryReport = {
  n: number;
  sweeps: number;
  unrolledBytes: number;
  sweepBytes: number;
  iftBytes: number;
};

export type TapeAllocation =
  | { ok: true; bytes: number; buffer: ArrayBuffer }
  | { ok: false; bytes: number; reason: "oom" | "limit" };

/** TypedArrays the two adjoints actually keep. Held so GC cannot drop them. */
export type MeasuredHold = {
  tape: Float64Array;
  sweepWorkspace: Float64Array;
};

export type MeasuredMemory =
  | {
      ok: true;
      n: number;
      sweeps: number;
      /** Sum of `.byteLength` of tape-path buffers actually held. */
      tapeBytes: number;
      /** Sum of `.byteLength` of sweep-path buffers actually held. Independent of K. */
      sweepBytes: number;
      /** Chromium `performance.memory.usedJSHeapSize` delta; null if unavailable. */
      heapDeltaBytes: number | null;
      hold: MeasuredHold;
    }
  | {
      ok: false;
      n: number;
      sweeps: number;
      tapeBytes: number;
      sweepBytes: number;
      heapDeltaBytes: number | null;
      reason: "oom";
    };

export type OverlayMode = "both" | "sweep" | "ift";
