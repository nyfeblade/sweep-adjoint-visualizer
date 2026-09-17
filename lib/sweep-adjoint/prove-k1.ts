import { probeLoss } from "./energy";
import { cloneCloth, createCloth, resetToRest, vertexIndex } from "./mesh";
import { forwardSweeps, runExplainer } from "./solver";
import type { ClothState } from "./types";

/** Same 10×10 handle/probe pairing as `scripts/verify_k1.py`. */
export const K1_PROOF_GRID = 10;
export const K1_PROOF_SWEEPS = 1;
export const K1_PROOF_EPS_FD = 1e-5;
export const K1_PROOF_PASS_ABS = 1e-7;
export const K1_PROOF_PASS_REL = 1e-5;
export const K1_PROOF_IFT_MIN_REL = 0.08;

export type K1Proof = {
  grid: number;
  sweeps: number;
  param: "handle force_x";
  fd: number;
  sweep: number;
  ift: number;
  unrolled: number;
  sweepVsFd: number;
  iftVsFd: number;
  sweepVsUnrolled: number;
  iftVsSweep: number;
  loss: number;
  ok: boolean;
};

export function createK1ProofCloth(): ClothState {
  const cloth = createCloth(K1_PROOF_GRID, K1_PROOF_GRID);
  // Same pairing as scripts/verify_k1.py: handle is even, probe is the odd
  // neighbor, so one sweep couples p → x_handle → x_probe. Default createCloth
  // handle/probe is a same-color +2 hop — ∂L/∂p is exactly 0 at K=1.
  cloth.handle = vertexIndex(3, 1, K1_PROOF_GRID);
  cloth.probe = vertexIndex(4, 1, K1_PROOF_GRID);
  cloth.targetX = cloth.rest[2 * cloth.handle] + 1.6;
  cloth.targetY = cloth.rest[2 * cloth.handle + 1] - 1.8;
  return cloth;
}

/** Central finite difference of probe loss w.r.t. a vertex force component. */
export function fdForceGrad(
  state: ClothState,
  sweeps: number,
  vertex: number,
  axis: 0 | 1,
  eps = K1_PROOF_EPS_FD,
): number {
  const idx = 2 * vertex + axis;
  const orig = state.force[idx];
  resetToRest(state);
  state.force[idx] = orig + eps;
  forwardSweeps(state, sweeps);
  const lp = probeLoss(state);
  resetToRest(state);
  state.force[idx] = orig - eps;
  forwardSweeps(state, sweeps);
  const lm = probeLoss(state);
  state.force[idx] = orig;
  resetToRest(state);
  return (lp - lm) / (2 * eps);
}

function vsFd(value: number, fd: number): number {
  return Math.abs(value - fd) / Math.max(Math.abs(fd), 1e-12);
}

/**
 * K=1 ∂L/∂p on the verify_k1 10×10 fixture, via the same `runExplainer` + FD
 * path as `npm run check:math`. p is handle force_x.
 */
export function proveK1(): K1Proof {
  const cloth = createK1ProofCloth();
  const explained = runExplainer(cloneCloth(cloth), K1_PROOF_SWEEPS);
  const pIndex = 2 * cloth.handle;
  const fd = fdForceGrad(cloneCloth(cloth), K1_PROOF_SWEEPS, cloth.handle, 0);
  const sweep = explained.sweepAdj[pIndex];
  const ift = explained.iftAdj[pIndex];
  const unrolled = explained.unrolledAdj[pIndex];
  const sweepVsFd = vsFd(sweep, fd);
  const iftVsFd = vsFd(ift, fd);
  const sweepOk = Math.abs(sweep - fd) < K1_PROOF_PASS_ABS || sweepVsFd < K1_PROOF_PASS_REL;
  const tapeOk = explained.sweepVsUnrolled < 1e-8;
  const iftWrong = iftVsFd > K1_PROOF_IFT_MIN_REL;

  return {
    grid: K1_PROOF_GRID,
    sweeps: K1_PROOF_SWEEPS,
    param: "handle force_x",
    fd,
    sweep,
    ift,
    unrolled,
    sweepVsFd,
    iftVsFd,
    sweepVsUnrolled: explained.sweepVsUnrolled,
    iftVsSweep: explained.iftVsSweep,
    loss: explained.loss,
    ok: sweepOk && tapeOk && iftWrong,
  };
}
