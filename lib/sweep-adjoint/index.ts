export { SweepAdjointError, errorCopy, assertRunnable } from "./errors";
export type { SolverErrorCode } from "./errors";
export {
  createCloth,
  createEmptyMesh,
  cloneCloth,
  resetToRest,
  DEFAULT_GRID,
  DEFAULT_PARAMS,
  vertexIndex,
  setDraggedNode,
  pickFreeNode,
} from "./mesh";
export {
  runExplainer,
  runLive,
  forwardSweeps,
  unrolledAdjoint,
  sweepAdjoint,
  iftAdjoint,
  reverseColorSweep,
} from "./solver";
export { BRIEF, LIVE_SOLVE_CAP } from "./copy";
export type { LiveResult } from "./solver";
export {
  memoryReport,
  tryAllocateTape,
  tapeBytesFor,
  measureSolverWorkspaces,
  measuredTapeBytesFor,
  measuredSweepBytesFor,
  createUnrolledTape,
  createSweepWorkspace,
  UNROLLED_BYTES_PER_VERTEX_ITER,
  MEASURED_BYTES_PER_VERTEX,
} from "./memory";
export { formatBytes, formatPct, relError, maxAbsDiff } from "./math2";
export { probeLoss } from "./energy";
export type {
  ClothState,
  ClothParams,
  ExplainerResult,
  MemoryReport,
  OverlayMode,
  TapeAllocation,
  MeasuredHold,
  MeasuredMemory,
  MethodName,
} from "./types";
