import {
  assembleLocal,
  applyNewton,
  hessianVecAt,
  probeLoss,
  reverseLocalStepWithForce,
  seedProbeLossAdj,
} from "./energy";
import { requireMesh, colorOrder } from "./mesh";
import { createSweepWorkspace, createUnrolledTape, memoryReport } from "./memory";
import { copyF64 } from "./math2";
import type { ClothState, ExplainerResult, LocalSystem } from "./types";

function newLocal(): LocalSystem {
  return { g0: 0, g1: 0, h00: 0, h01: 0, h10: 0, h11: 0 };
}

export function forwardSweeps(state: ClothState, sweeps: number, local = newLocal()): void {
  const even = colorOrder(state.n, state.nx, 0);
  const odd = colorOrder(state.n, state.nx, 1);
  for (let k = 0; k < sweeps; k++) {
    for (const vertex of even) {
      assembleLocal(state, vertex, local);
      applyNewton(state, vertex, local);
    }
    for (const vertex of odd) {
      assembleLocal(state, vertex, local);
      applyNewton(state, vertex, local);
    }
  }
}

function recordIteration(
  state: ClothState,
  even: number[],
  odd: number[],
  tape: Float64Array,
  local: LocalSystem,
): void {
  for (const vertex of even) {
    tape[2 * vertex] = state.x[2 * vertex];
    tape[2 * vertex + 1] = state.x[2 * vertex + 1];
    assembleLocal(state, vertex, local);
    applyNewton(state, vertex, local);
  }
  for (const vertex of odd) {
    tape[2 * vertex] = state.x[2 * vertex];
    tape[2 * vertex + 1] = state.x[2 * vertex + 1];
    assembleLocal(state, vertex, local);
    applyNewton(state, vertex, local);
  }
}

function reverseIteration(
  state: ClothState,
  even: number[],
  odd: number[],
  tape: Float64Array,
  adj: Float64Array,
  forceAdj: Float64Array,
  local: LocalSystem,
): void {
  for (let i = odd.length - 1; i >= 0; i--) {
    const vertex = odd[i];
    reverseLocalStepWithForce(
      state,
      vertex,
      tape[2 * vertex],
      tape[2 * vertex + 1],
      adj,
      forceAdj,
      local,
    );
  }
  for (let i = even.length - 1; i >= 0; i--) {
    const vertex = even[i];
    reverseLocalStepWithForce(
      state,
      vertex,
      tape[2 * vertex],
      tape[2 * vertex + 1],
      adj,
      forceAdj,
      local,
    );
  }
}

export function unrolledAdjoint(state: ClothState, sweeps: number): Float64Array {
  requireMesh(state, sweeps);
  const local = newLocal();
  const even = colorOrder(state.n, state.nx, 0);
  const odd = colorOrder(state.n, state.nx, 1);
  const tape = createUnrolledTape(state.n, sweeps);

  for (let k = 0; k < sweeps; k++) {
    const slice = tape.subarray(k * state.n * 2, (k + 1) * state.n * 2);
    recordIteration(state, even, odd, slice, local);
  }

  const xFinal = copyF64(state.x);
  const adj = new Float64Array(state.n * 2);
  const forceAdj = new Float64Array(state.n * 2);
  seedProbeLossAdj(state, adj);

  for (let k = sweeps - 1; k >= 0; k--) {
    const slice = tape.subarray(k * state.n * 2, (k + 1) * state.n * 2);
    reverseIteration(state, even, odd, slice, adj, forceAdj, local);
  }

  state.x.set(xFinal);
  return forceAdj;
}

/**
 * Reverse-color-order local vertex-block adjoint (Shu et al.).
 * 3D paper: each vertex solves a local 3×3 block. This 2D slice uses the
 * same object with a 2×2 block. Reverse checkerboard order. No tape.
 * No assembled global Jacobian on the backward path.
 */
export function reverseColorSweep(
  state: ClothState,
  even: number[],
  odd: number[],
  tape: Float64Array,
  adj: Float64Array,
  forceAdj: Float64Array,
  local: LocalSystem,
): void {
  reverseIteration(state, even, odd, tape, adj, forceAdj, local);
}

export function sweepAdjoint(state: ClothState, sweeps: number, x0: Float64Array): Float64Array {
  requireMesh(state, sweeps);
  const local = newLocal();
  const even = colorOrder(state.n, state.nx, 0);
  const odd = colorOrder(state.n, state.nx, 1);
  const workspace = createSweepWorkspace(state.n);
  const adj = new Float64Array(state.n * 2);
  const forceAdj = new Float64Array(state.n * 2);

  seedProbeLossAdj(state, adj);

  for (let k = sweeps - 1; k >= 0; k--) {
    state.x.set(x0);
    forwardSweeps(state, k, local);
    recordIteration(state, even, odd, workspace, local);
    reverseIteration(state, even, odd, workspace, adj, forceAdj, local);
  }

  return forceAdj;
}

export function iftAdjoint(state: ClothState): { adj: Float64Array; iters: number } {
  const dim = state.n * 2;
  const rhs = new Float64Array(dim);
  seedProbeLossAdj(state, rhs);
  return conjugateGradient(state, rhs);
}

function conjugateGradient(
  state: ClothState,
  b: Float64Array,
): { adj: Float64Array; iters: number } {
  const dim = b.length;
  const local = newLocal();
  const x = new Float64Array(dim);
  const r = copyF64(b);
  const p = copyF64(b);
  const hp = new Float64Array(dim);
  const diag = new Float64Array(dim);

  for (let i = 0; i < state.n; i++) {
    assembleLocal(state, i, local);
    diag[2 * i] = Math.max(local.h00, 1e-8);
    diag[2 * i + 1] = Math.max(local.h11, 1e-8);
  }

  let rsold = 0;
  const z = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    z[i] = r[i] / diag[i];
    p[i] = z[i];
    rsold += r[i] * z[i];
  }

  const maxIter = Math.min(800, dim + 40);
  let iters = 0;
  for (; iters < maxIter; iters++) {
    hessianVecAt(state, p, hp, local);
    let pHp = 0;
    for (let i = 0; i < dim; i++) pHp += p[i] * hp[i];
    if (Math.abs(pHp) < 1e-20) break;
    const alpha = rsold / pHp;
    for (let i = 0; i < dim; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * hp[i];
    }
    let rsnew = 0;
    for (let i = 0; i < dim; i++) {
      z[i] = r[i] / diag[i];
      rsnew += r[i] * z[i];
    }
    if (Math.sqrt(rsnew) < 1e-8) {
      iters += 1;
      break;
    }
    const beta = rsnew / rsold;
    for (let i = 0; i < dim; i++) p[i] = z[i] + beta * p[i];
    rsold = rsnew;
  }

  return { adj: x, iters };
}

export type LiveResult = {
  x: Float64Array;
  loss: number;
  sweepAdj: Float64Array;
  iftAdj: Float64Array;
  iftVsSweep: number;
  sweepVsUnrolled: number;
  iftVsUnrolled: number;
  sweeps: number;
  cgIters: number;
};

export function runLive(input: ClothState, sweeps: number): LiveResult {
  requireMesh(input, sweeps);
  resetPositions(input);
  const x0 = copyF64(input.x);

  const unrolledState = clonePositions(input);
  const unrolledAdj = unrolledAdjoint(unrolledState, sweeps);

  input.x.set(unrolledState.x);
  const x = copyF64(input.x);
  const loss = probeLoss(input);
  const { adj: iftAdj, iters: cgIters } = iftAdjoint(input);
  const sweepAdj = sweepAdjoint(input, sweeps, x0);
  input.x.set(x);
  return {
    x,
    loss,
    sweepAdj,
    iftAdj,
    sweepVsUnrolled: relL2(sweepAdj, unrolledAdj),
    iftVsUnrolled: relL2(iftAdj, unrolledAdj),
    iftVsSweep: relL2(iftAdj, sweepAdj),
    sweeps,
    cgIters,
  };
}

export function runExplainer(input: ClothState, sweeps: number): ExplainerResult {
  requireMesh(input, sweeps);

  const sweepState = input;
  resetPositions(sweepState);
  const x0 = copyF64(sweepState.x);

  const unrolledState = clonePositions(sweepState);
  const iftState = clonePositions(sweepState);

  const unrolledAdj = unrolledAdjoint(unrolledState, sweeps);
  const loss = probeLoss(unrolledState);

  sweepState.x.set(unrolledState.x);
  const sweepAdj = sweepAdjoint(sweepState, sweeps, x0);

  iftState.x.set(unrolledState.x);
  const { adj: iftAdj, iters: cgIters } = iftAdjoint(iftState);

  return {
    x: copyF64(unrolledState.x),
    loss,
    sweepAdj,
    unrolledAdj,
    iftAdj,
    sweepVsUnrolled: relL2(sweepAdj, unrolledAdj),
    iftVsUnrolled: relL2(iftAdj, unrolledAdj),
    iftVsSweep: relL2(iftAdj, sweepAdj),
    sweeps,
    cgIters,
    memory: memoryReport(input.n, sweeps),
  };
}

function resetPositions(state: ClothState): void {
  state.x.set(state.rest);
}

function clonePositions(state: ClothState): ClothState {
  return {
    ...state,
    x: copyF64(state.x),
    rest: state.rest,
    force: state.force,
    pinned: state.pinned,
    springs: state.springs,
    params: state.params,
  };
}

function relL2(a: Float64Array, b: Float64Array): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    num += d * d;
    den += b[i] * b[i];
  }
  if (den < 1e-20) return num < 1e-20 ? 0 : Number.POSITIVE_INFINITY;
  return Math.sqrt(num / den);
}

export { probeLoss };
