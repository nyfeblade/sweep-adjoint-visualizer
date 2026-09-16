import { formatBytes } from "../lib/sweep-adjoint/math2";
import {
  MEASURED_BYTES_PER_VERTEX,
  UNROLLED_BYTES_PER_VERTEX_ITER,
  measureSolverWorkspaces,
  measuredSweepBytesFor,
  measuredTapeBytesFor,
} from "../lib/sweep-adjoint/memory";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

const N = 400;
const KS = [1, 8, 32, 100] as const;
const LINEAR_TOLERANCE = 1e-9;

function nearlyEqual(a: number, b: number, tol = LINEAR_TOLERANCE): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= tol;
}

function runMemoryProof(): Check[] {
  const results: Check[] = [];
  const samples = KS.map((k) => {
    const measured = measureSolverWorkspaces(N, k);
    return { k, measured };
  });

  for (const { k, measured } of samples) {
    const expectedTape = measuredTapeBytesFor(N, k);
    const expectedSweep = measuredSweepBytesFor(N);
    results.push({
      name: `K=${k} tape .byteLength matches K×N×${MEASURED_BYTES_PER_VERTEX}`,
      ok: measured.ok && measured.tapeBytes === expectedTape,
      detail: measured.ok
        ? `${formatBytes(measured.tapeBytes)} (expected ${expectedTape} B)`
        : "oom",
    });
    results.push({
      name: `K=${k} sweep .byteLength matches N×${MEASURED_BYTES_PER_VERTEX}`,
      ok: measured.ok && measured.sweepBytes === expectedSweep,
      detail: measured.ok
        ? `${formatBytes(measured.sweepBytes)} (expected ${expectedSweep} B)`
        : "oom",
    });
    const heldSum = measured.ok
      ? measured.hold.tape.byteLength + measured.hold.sweepWorkspace.byteLength
      : -1;
    results.push({
      name: `K=${k} reported bytes are the sum of held .byteLength`,
      ok: measured.ok && heldSum === measured.tapeBytes + measured.sweepBytes,
      detail: measured.ok ? `${heldSum} B` : "oom",
    });
  }

  const sweepBytes = samples.map(({ measured }) => (measured.ok ? measured.sweepBytes : -1));
  const sweepFlat = sweepBytes.every((bytes) => bytes === sweepBytes[0] && bytes > 0);
  results.push({
    name: "measured sweep is identical across K",
    ok: sweepFlat,
    detail: KS.map((k, i) => `K=${k}:${sweepBytes[i]}`).join(" "),
  });

  const tapeAt = (k: (typeof KS)[number]): number => {
    const sample = samples.find((entry) => entry.k === k);
    return sample?.measured.ok ? sample.measured.tapeBytes : Number.NaN;
  };

  const tape1 = tapeAt(1);
  const tape32 = tapeAt(32);
  const tape100 = tapeAt(100);
  results.push({
    name: "measured tape grows linearly with K (K=32 ≈ 32× K=1)",
    ok: nearlyEqual(tape32, 32 * tape1),
    detail: `tape(1)=${tape1} B tape(32)=${tape32} B ratio=${(tape32 / tape1).toFixed(4)}`,
  });

  for (const k of KS) {
    const tapeK = tapeAt(k);
    results.push({
      name: `measured tape at K=${k} is ${k}× tape at K=1`,
      ok: nearlyEqual(tapeK, k * tape1),
      detail: `tape(${k})=${tapeK} B vs ${k}×${tape1} B`,
    });
  }

  results.push({
    name: "measured tape exceeds sweep at K=32",
    ok: tape32 > sweepBytes[0],
    detail: `tape ${tape32} B > sweep ${sweepBytes[0]} B`,
  });
  results.push({
    name: "measured tape exceeds sweep at K=100 (K ≫ 1)",
    ok: tape100 > sweepBytes[0],
    detail: `tape ${tape100} B > sweep ${sweepBytes[0]} B`,
  });

  results.push({
    name: "measured stride is the real 16 B tape, not schematic 256 B",
    ok:
      MEASURED_BYTES_PER_VERTEX === 16 &&
      UNROLLED_BYTES_PER_VERTEX_ITER === 256 &&
      tape1 === N * MEASURED_BYTES_PER_VERTEX &&
      tape1 !== N * UNROLLED_BYTES_PER_VERTEX_ITER,
    detail: `measured ${MEASURED_BYTES_PER_VERTEX} B/vertex vs schematic ${UNROLLED_BYTES_PER_VERTEX_ITER} B/vertex`,
  });

  const reused = measureSolverWorkspaces(N, 8, samples[1]?.measured.ok ? samples[1].measured.hold : null);
  results.push({
    name: "reuse keeps sweep workspace byteLength flat",
    ok: reused.ok && reused.sweepBytes === sweepBytes[0],
    detail: reused.ok ? `${reused.sweepBytes} B` : "oom",
  });

  const otherN = measureSolverWorkspaces(100, 32);
  results.push({
    name: "sweep scales with N, not K (N=100 vs N=400)",
    ok:
      otherN.ok &&
      otherN.sweepBytes === measuredSweepBytesFor(100) &&
      otherN.sweepBytes < sweepBytes[0],
    detail: otherN.ok
      ? `N=100 sweep ${otherN.sweepBytes} B; N=400 sweep ${sweepBytes[0]} B`
      : "oom",
  });

  return results;
}

function report(results: Check[]): boolean {
  let ok = true;
  for (const result of results) {
    const mark = result.ok ? "ok" : "FAIL";
    console.log(`${mark}  ${result.name} — ${result.detail}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

const passed = report(runMemoryProof());
if (!passed) process.exitCode = 1;
else {
  console.log("");
  console.log(`PASS  measured memory proof  N=${N}  K=${KS.join(",")}`);
  console.log(
    `      K=1  tape=${measuredTapeBytesFor(N, 1)} B  sweep=${measuredSweepBytesFor(N)} B`,
  );
  console.log(
    `      K=32 tape=${measuredTapeBytesFor(N, 32)} B  sweep=${measuredSweepBytesFor(N)} B  (32× tape, flat sweep)`,
  );
}
