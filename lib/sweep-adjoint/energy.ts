import { hypot2 } from "./math2";
import type { ClothState, LocalSystem } from "./types";

const LEN_FLOOR = 1e-8;

export function clearLocal(out: LocalSystem): void {
  out.g0 = 0;
  out.g1 = 0;
  out.h00 = 0;
  out.h01 = 0;
  out.h10 = 0;
  out.h11 = 0;
}

export function addSpringToLocal(
  state: ClothState,
  vertex: number,
  other: number,
  rest: number,
  k: number,
  out: LocalSystem,
): void {
  const e0 = state.x[2 * vertex] - state.x[2 * other];
  const e1 = state.x[2 * vertex + 1] - state.x[2 * other + 1];
  const len = Math.max(hypot2(e0, e1), LEN_FLOOR);
  const alpha = 1 - rest / len;
  const scale = k * (rest / (len * len * len));
  out.g0 += k * alpha * e0;
  out.g1 += k * alpha * e1;
  out.h00 += k * alpha + scale * e0 * e0;
  out.h01 += scale * e0 * e1;
  out.h10 += scale * e1 * e0;
  out.h11 += k * alpha + scale * e1 * e1;
}

export function addPinToLocal(
  state: ClothState,
  vertex: number,
  tx: number,
  ty: number,
  k: number,
  out: LocalSystem,
): void {
  out.g0 += k * (state.x[2 * vertex] - tx);
  out.g1 += k * (state.x[2 * vertex + 1] - ty);
  out.h00 += k;
  out.h11 += k;
}

export function assembleLocal(state: ClothState, vertex: number, out: LocalSystem): void {
  clearLocal(out);
  const { params } = state;

  for (const spring of state.springs) {
    if (spring.i === vertex) {
      addSpringToLocal(state, vertex, spring.j, spring.rest, spring.k, out);
    } else if (spring.j === vertex) {
      addSpringToLocal(state, vertex, spring.i, spring.rest, spring.k, out);
    }
  }

  if (state.pinned[vertex]) {
    addPinToLocal(state, vertex, state.rest[2 * vertex], state.rest[2 * vertex + 1], params.pinK, out);
  }

  if (vertex === state.handle) {
    addPinToLocal(state, vertex, state.targetX, state.targetY, params.handleK, out);
  }

  out.g1 += -params.gravityY;
  out.g0 -= state.force[2 * vertex];
  out.g1 -= state.force[2 * vertex + 1];
  out.h00 += params.regularizer;
  out.h11 += params.regularizer;
}

export function applyNewton(state: ClothState, vertex: number, local: LocalSystem): void {
  const [dx, dy] = solveLocal(local);
  state.x[2 * vertex] -= dx;
  state.x[2 * vertex + 1] -= dy;
}

export function solveLocal(local: LocalSystem): [number, number] {
  const det = local.h00 * local.h11 - local.h01 * local.h10;
  let h00 = local.h00;
  let h01 = local.h01;
  let h10 = local.h10;
  let h11 = local.h11;
  let d = det;
  if (Math.abs(d) < 1e-14) {
    h00 += 1e-8;
    h11 += 1e-8;
    d = h00 * h11 - h01 * h10;
  }
  const inv = 1 / d;
  return [(h11 * local.g0 - h01 * local.g1) * inv, (-h10 * local.g0 + h00 * local.g1) * inv];
}

function solve2x2(
  h00: number,
  h01: number,
  h10: number,
  h11: number,
  bx: number,
  by: number,
): [number, number] {
  let a00 = h00;
  let a01 = h01;
  let a10 = h10;
  let a11 = h11;
  let det = a00 * a11 - a01 * a10;
  if (Math.abs(det) < 1e-14) {
    a00 += 1e-8;
    a11 += 1e-8;
    det = a00 * a11 - a01 * a10;
  }
  const inv = 1 / det;
  return [(a11 * bx - a01 * by) * inv, (-a10 * bx + a00 * by) * inv];
}

function applyEnergyVjp(
  state: ClothState,
  vertex: number,
  gBar0: number,
  gBar1: number,
  hb00: number,
  hb01: number,
  hb10: number,
  hb11: number,
  adj: Float64Array,
): void {
  const { params } = state;

  for (const spring of state.springs) {
    let other = -1;
    if (spring.i === vertex) other = spring.j;
    else if (spring.j === vertex) other = spring.i;
    else continue;
    springVjp(
      state,
      vertex,
      other,
      spring.rest,
      spring.k,
      gBar0,
      gBar1,
      hb00,
      hb01,
      hb10,
      hb11,
      adj,
    );
  }

  if (state.pinned[vertex]) {
    adj[2 * vertex] += params.pinK * gBar0;
    adj[2 * vertex + 1] += params.pinK * gBar1;
  }

  if (vertex === state.handle) {
    adj[2 * vertex] += params.handleK * gBar0;
    adj[2 * vertex + 1] += params.handleK * gBar1;
  }

  // g includes -force, so ∂L/∂force += -̄g. Accumulated on a side buffer in the solver.
  adj[2 * vertex] += 0;
  adj[2 * vertex + 1] += 0;
}

export function forceVjp(gBar0: number, gBar1: number): [number, number] {
  return [-gBar0, -gBar1];
}

function springVjp(
  state: ClothState,
  vertex: number,
  other: number,
  rest: number,
  k: number,
  gBar0: number,
  gBar1: number,
  hb00: number,
  hb01: number,
  hb10: number,
  hb11: number,
  adj: Float64Array,
): void {
  const e0 = state.x[2 * vertex] - state.x[2 * other];
  const e1 = state.x[2 * vertex + 1] - state.x[2 * other + 1];
  const len = Math.max(hypot2(e0, e1), LEN_FLOOR);
  const alpha = 1 - rest / len;
  const l3 = len * len * len;
  const l5 = l3 * len * len;

  // ē from g: H_spring ̄g
  const h00 = k * alpha + k * (rest / l3) * e0 * e0;
  const h01 = k * (rest / l3) * e0 * e1;
  const h10 = k * (rest / l3) * e1 * e0;
  const h11 = k * alpha + k * (rest / l3) * e1 * e1;
  let eBar0 = h00 * gBar0 + h01 * gBar1;
  let eBar1 = h10 * gBar0 + h11 * gBar1;

  // ē from H̄
  const trH = hb00 + hb11;
  const eHe = e0 * (hb00 * e0 + hb01 * e1) + e1 * (hb10 * e0 + hb11 * e1);
  const ht0 = (hb00 + hb10) * e0 + (hb01 + hb11) * e1;
  const ht1 = (hb00 + hb01) * e0 + (hb10 + hb11) * e1;
  // (H̄ + H̄ᵀ) e
  const sym0 = hb00 * e0 + hb01 * e1 + hb00 * e0 + hb10 * e1;
  const sym1 = hb10 * e0 + hb11 * e1 + hb01 * e0 + hb11 * e1;
  void ht0;
  void ht1;

  eBar0 += k * (rest / l3) * trH * e0;
  eBar1 += k * (rest / l3) * trH * e1;
  eBar0 += k * rest * (-3 / l5) * eHe * e0;
  eBar1 += k * rest * (-3 / l5) * eHe * e1;
  eBar0 += k * (rest / l3) * sym0;
  eBar1 += k * (rest / l3) * sym1;

  adj[2 * vertex] += eBar0;
  adj[2 * vertex + 1] += eBar1;
  adj[2 * other] -= eBar0;
  adj[2 * other + 1] -= eBar1;
}

export function probeLoss(state: ClothState): number {
  if (state.probe < 0) return 0;
  const dx = state.x[2 * state.probe] - state.rest[2 * state.probe];
  const dy = state.x[2 * state.probe + 1] - state.rest[2 * state.probe + 1];
  return 0.5 * (dx * dx + dy * dy);
}

export function seedProbeLossAdj(state: ClothState, adj: Float64Array): void {
  adj.fill(0);
  if (state.probe < 0) return;
  adj[2 * state.probe] = state.x[2 * state.probe] - state.rest[2 * state.probe];
  adj[2 * state.probe + 1] = state.x[2 * state.probe + 1] - state.rest[2 * state.probe + 1];
}

export function hessianVecAt(
  state: ClothState,
  v: Float64Array,
  out: Float64Array,
  local: LocalSystem,
): void {
  out.fill(0);
  for (let i = 0; i < state.n; i++) {
    assembleLocal(state, i, local);
    // Local (on-diagonal) contribution uses the VBD Hessian, which already
    // includes springs, pins, handle, regularizer. Off-diagonals of springs
    // must be added separately so IFT sees the global energy Hessian.
    out[2 * i] += local.h00 * v[2 * i] + local.h01 * v[2 * i + 1];
    out[2 * i + 1] += local.h10 * v[2 * i] + local.h11 * v[2 * i + 1];
  }

  for (const spring of state.springs) {
    const { i, j, rest, k } = spring;
    const e0 = state.x[2 * i] - state.x[2 * j];
    const e1 = state.x[2 * i + 1] - state.x[2 * j + 1];
    const len = Math.max(hypot2(e0, e1), LEN_FLOOR);
    const alpha = 1 - rest / len;
    const scale = k * (rest / (len * len * len));
    const s00 = k * alpha + scale * e0 * e0;
    const s01 = scale * e0 * e1;
    const s10 = scale * e1 * e0;
    const s11 = k * alpha + scale * e1 * e1;
    // Off-diagonal blocks H_ij = H_ji = -H_spring
    const vix = v[2 * i];
    const viy = v[2 * i + 1];
    const vjx = v[2 * j];
    const vjy = v[2 * j + 1];
    out[2 * i] += -s00 * vjx - s01 * vjy;
    out[2 * i + 1] += -s10 * vjx - s11 * vjy;
    out[2 * j] += -s00 * vix - s01 * viy;
    out[2 * j + 1] += -s10 * vix - s11 * viy;
  }
}

/**
 * Force adjoint through g += -f: accumulate -̄g into forceAdj.
 */
export function accumulateForceAdj(
  forceAdj: Float64Array,
  vertex: number,
  gBar0: number,
  gBar1: number,
): void {
  forceAdj[2 * vertex] += -gBar0;
  forceAdj[2 * vertex + 1] += -gBar1;
}

/**
 * Reverse a local step and also accumulate dL/df.
 */
export function reverseLocalStepWithForce(
  state: ClothState,
  vertex: number,
  xOld0: number,
  xOld1: number,
  adj: Float64Array,
  forceAdj: Float64Array,
  local: LocalSystem,
): void {
  const aNew0 = adj[2 * vertex];
  const aNew1 = adj[2 * vertex + 1];
  adj[2 * vertex] = 0;
  adj[2 * vertex + 1] = 0;

  state.x[2 * vertex] = xOld0;
  state.x[2 * vertex + 1] = xOld1;
  assembleLocal(state, vertex, local);

  const [y0, y1] = solveLocal(local);
  const [mu0, mu1] = solve2x2(local.h00, local.h01, local.h10, local.h11, -aNew0, -aNew1);

  const hb00 = -mu0 * y0;
  const hb01 = -mu0 * y1;
  const hb10 = -mu1 * y0;
  const hb11 = -mu1 * y1;

  applyEnergyVjp(state, vertex, mu0, mu1, hb00, hb01, hb10, hb11, adj);
  accumulateForceAdj(forceAdj, vertex, mu0, mu1);

  adj[2 * vertex] += aNew0;
  adj[2 * vertex + 1] += aNew1;
}
