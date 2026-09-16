import { SweepAdjointError } from "./errors";
import { createCloth, createEmptyMesh } from "./mesh";
import { tryAllocateTape, tapeBytesFor } from "./memory";
import { createK1ProofCloth, fdForceGrad, proveK1 } from "./prove-k1";
import { runExplainer } from "./solver";

export type SelfTestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

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

  const proof = proveK1();
  results.push({
    name: "sweep matches unrolled at K=1",
    ok: proof.sweepVsUnrolled < 1e-8,
    detail: `rel ${proof.sweepVsUnrolled.toExponential(2)}`,
  });
  results.push({
    name: "IFT disagrees at K=1",
    ok: proof.iftVsSweep > 0.08,
    detail: `rel ${proof.iftVsSweep.toFixed(3)}`,
  });
  results.push({
    name: "/k1 FD ≈ sweep; IFT wrong",
    ok: proof.ok,
    detail: `fd=${proof.fd.toExponential(3)} sweep=${proof.sweep.toExponential(3)} ift=${proof.ift.toExponential(3)} sweepVsFd=${proof.sweepVsFd.toExponential(2)} iftVsFd=${proof.iftVsFd.toFixed(3)}`,
  });

  const k32 = runExplainer(createK1ProofCloth(), 32);
  results.push({
    name: "sweep matches unrolled at K=32",
    ok: k32.sweepVsUnrolled < 1e-7,
    detail: `rel ${k32.sweepVsUnrolled.toExponential(2)}`,
  });
  results.push({
    name: "IFT moves toward sweep as K grows",
    ok: k32.iftVsSweep < proof.iftVsSweep,
    detail: `K=1 ${proof.iftVsSweep.toFixed(3)} → K=32 ${k32.iftVsSweep.toFixed(3)}`,
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
    name: "20×20 K=1 IFT fight",
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
    console.log(`${mark}  ${result.name} — ${result.detail}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

const invoked = process.argv[1]?.includes("self-test");
if (invoked) {
  const passed = reportSelfTests(runSelfTests());
  if (!passed) process.exitCode = 1;
}
