import { SweepAdjointError } from "./errors";
import { probeLoss } from "./energy";
import { createCloth, createEmptyMesh, resetToRest } from "./mesh";
import { tryAllocateTape, tapeBytesFor } from "./memory";
import { forwardSweeps, runExplainer } from "./solver";
import type { ClothState } from "./types";

export type SelfTestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function fdForceGrad(state: ClothState, sweeps: number, vertex: number, axis: 0 | 1, eps = 1e-5): number {
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

export function runSelfTests(): SelfTestResult[] {
  const results: SelfTestResult[] = [];

  try {
    runExplainer(createEmptyMesh(), 1);
    results.push({ name: "empty mesh", ok: false, detail: "expected SweepAdjointError" });
  } catch (error) {
    const ok = error instanceof SweepAdjointError && error.code === "empty_mesh";
    results.push({ name: "empty mesh", ok, detail: ok ? error.code : String(error) });
  }

  try {
    runExplainer(createCloth(4, 4), 0);
    results.push({ name: "K=0", ok: false, detail: "expected SweepAdjointError" });
  } catch (error) {
    const ok = error instanceof SweepAdjointError && error.code === "k_zero";
    results.push({ name: "K=0", ok, detail: ok ? error.code : String(error) });
  }

  const tiny = createCloth(6, 6);
  tiny.targetX = tiny.rest[2 * tiny.handle] + 1.6;
  tiny.targetY = tiny.rest[2 * tiny.handle + 1] - 1.8;
  const k1 = runExplainer(tiny, 1);
  results.push({
    name: "sweep matches unrolled at K=1",
    ok: k1.sweepVsUnrolled < 1e-8,
    detail: `rel ${k1.sweepVsUnrolled.toExponential(2)}`,
  });
  results.push({
    name: "IFT disagrees at K=1",
    ok: k1.iftVsSweep > 0.08,
    detail: `rel ${k1.iftVsSweep.toFixed(3)}`,
  });

  const k32 = runExplainer(tiny, 32);
  results.push({
    name: "sweep matches unrolled at K=32",
    ok: k32.sweepVsUnrolled < 1e-7,
    detail: `rel ${k32.sweepVsUnrolled.toExponential(2)}`,
  });
  results.push({
    name: "IFT moves toward sweep as K grows",
    ok: k32.iftVsSweep < k1.iftVsSweep,
    detail: `K=1 ${k1.iftVsSweep.toFixed(3)} → K=32 ${k32.iftVsSweep.toFixed(3)}`,
  });

  const fdState = createCloth(5, 5);
  fdState.targetX = fdState.rest[2 * fdState.handle] + 1.2;
  fdState.targetY = fdState.rest[2 * fdState.handle + 1] - 1.4;
  const explained = runExplainer(fdState, 2);
  const sample = fdState.probe;
  const fd = fdForceGrad(fdState, 2, sample, 0);
  const ad = explained.sweepAdj[2 * sample];
  const fdRel = Math.abs(fd - ad) / Math.max(Math.abs(fd), 1e-8);
  results.push({
    name: "sweep vs finite difference",
    ok: fdRel < 0.05,
    detail: `fd=${fd.toExponential(3)} ad=${ad.toExponential(3)} rel=${fdRel.toFixed(3)}`,
  });

  const cloth = createCloth(20, 20);
  const live = runExplainer(cloth, 1);
  results.push({
    name: "20\u00d720 K=1 IFT fight",
    ok: live.iftVsSweep > 0.15 && live.sweepVsUnrolled < 1e-7,
    detail: `IFT ${ (live.iftVsSweep * 100).toFixed(1) }% off; sweep-vs-tape ${live.sweepVsUnrolled.toExponential(2)}`,
  });

  const bytes = tapeBytesFor(400, 250_000);
  const boom = tryAllocateTape(bytes);
  results.push({
    name: "tape twin OOM or huge alloc",
    ok: !boom.ok || boom.bytes >= 1_000_000,
    detail: boom.ok ? `allocated ${boom.bytes} B` : `oom ${bytes} B`,
  });

  return results;
}

export function reportSelfTests(results: SelfTestResult[]): boolean {
  let ok = true;
  for (const result of results) {
    const mark = result.ok ? "ok" : "FAIL";
    console.log(`${mark}  ${result.name} \u2014 ${result.detail}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

const invoked = process.argv[1]?.includes("self-test");
if (invoked) {
  const passed = reportSelfTests(runSelfTests());
  if (!passed) process.exitCode = 1;
}
