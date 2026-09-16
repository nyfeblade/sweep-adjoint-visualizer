"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ClothCanvas } from "@/components/cloth-canvas";
import { ComparisonTable } from "@/components/comparison-table";
import { MemoryPanel } from "@/components/memory-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import {
  BRIEF,
  LIVE_SOLVE_CAP,
  SweepAdjointError,
  cloneCloth,
  createCloth,
  createEmptyMesh,
  errorCopy,
  formatPct,
  measureSolverWorkspaces,
  runExplainer,
  runLive,
  setDraggedNode,
  tapeBytesFor,
  tryAllocateTape,
  type ClothState,
  type MeasuredHold,
  type MeasuredMemory,
  type OverlayMode,
  type SolverErrorCode,
  type TapeAllocation,
} from "@/lib/sweep-adjoint";

export function ExplainerApp() {
  const baseCloth = useMemo(() => createCloth(20, 20), []);
  const [emptyMesh, setEmptyMesh] = useState(false);
  const [k, setK] = useState(1);
  const [overlay, setOverlay] = useState<OverlayMode>("both");
  const [cloth, setCloth] = useState<ClothState>(() => cloneCloth(baseCloth));
  const [positions, setPositions] = useState<Float64Array | null>(null);
  const [sweepAdj, setSweepAdj] = useState<Float64Array | null>(null);
  const [iftAdj, setIftAdj] = useState<Float64Array | null>(null);
  const [iftVsSweep, setIftVsSweep] = useState<number | null>(null);
  const [sweepVsUnrolled, setSweepVsUnrolled] = useState<number | null>(null);
  const [error, setError] = useState<SolverErrorCode | null>(null);
  const [tape, setTape] = useState<TapeAllocation | null>(null);
  const [measured, setMeasured] = useState<MeasuredMemory | null>(null);
  const [allocLive, setAllocLive] = useState(false);
  const tapeHold = useRef<ArrayBuffer | null>(null);
  const measuredHold = useRef<MeasuredHold | null>(null);
  const panelN = emptyMesh ? 0 : 400;

  const mesh = emptyMesh ? createEmptyMesh() : cloth;
  const liveK = Math.min(k, LIVE_SOLVE_CAP);

  useEffect(() => {
    if (emptyMesh) {
      setError("empty_mesh");
      setPositions(null);
      setSweepAdj(null);
      setIftAdj(null);
      setIftVsSweep(null);
      setSweepVsUnrolled(null);
      return;
    }
    if (k <= 0) {
      setError("k_zero");
      setPositions(null);
      setSweepAdj(null);
      setIftAdj(null);
      setIftVsSweep(null);
      setSweepVsUnrolled(null);
      return;
    }

    setError(null);
    try {
      const live = runLive(cloneCloth(cloth), liveK);
      setPositions(live.x);
      setSweepAdj(live.sweepAdj);
      setIftAdj(live.iftAdj);
      setIftVsSweep(live.iftVsSweep);
    } catch (caught) {
      if (caught instanceof SweepAdjointError) {
        setError(caught.code);
        return;
      }
      throw caught;
    }
  }, [cloth, emptyMesh, k, liveK]);

  useEffect(() => {
    if (emptyMesh || k <= 0) return;
    const id = window.setTimeout(() => {
      try {
        const full = runExplainer(cloneCloth(cloth), liveK);
        setSweepVsUnrolled(full.sweepVsUnrolled);
      } catch {
        setSweepVsUnrolled(null);
      }
    }, 180);
    return () => window.clearTimeout(id);
  }, [cloth, emptyMesh, k, liveK]);

  const onDrag = (index: number, x: number, y: number) => {
    setCloth((prev) => {
      const next = cloneCloth(prev);
      setDraggedNode(next, index, x, y);
      return next;
    });
  };

  useEffect(() => {
    if (!allocLive) {
      tapeHold.current = null;
      measuredHold.current = null;
      setTape(null);
      setMeasured(null);
      return;
    }
    const allocK = Math.max(k, 1);
    const nextTape = tryAllocateTape(tapeBytesFor(panelN, allocK));
    tapeHold.current = nextTape.ok ? nextTape.buffer : null;
    setTape(nextTape);

    const nextMeasured = measureSolverWorkspaces(panelN, allocK, measuredHold.current);
    measuredHold.current = nextMeasured.ok ? nextMeasured.hold : null;
    setMeasured(nextMeasured);
  }, [allocLive, panelN, k]);

  const onAllocate = () => {
    setAllocLive(true);
  };

  const onRelease = () => {
    setAllocLive(false);
  };

  const copy = error ? errorCopy(error) : null;
  const match =
    sweepVsUnrolled !== null && Number.isFinite(sweepVsUnrolled)
      ? maxAbsDiffLabel(sweepVsUnrolled)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-wide text-blue-300/80">
          {BRIEF.paper} ·{" "}
          <a className="underline underline-offset-4" href={BRIEF.arxivUrl}>
            arXiv:{BRIEF.arxiv}
          </a>
        </p>
        <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {BRIEF.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">20×20 VBD · 400 nodes · CPU</Badge>
          <Badge variant="outline">Red IFT · Blue reverse-sweep</Badge>
          <Badge variant="outline">K = 1 → 1000 memory</Badge>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <CopyCard title="Problem" body={BRIEF.problem} />
        <CopyCard title="This demo" body={BRIEF.thisDemo} />
        <CopyCard title="Who is this for" body={BRIEF.who} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <Card className="overflow-hidden bg-card/80">
          <CardHeader className="border-b">
            <CardTitle>Drag a node</CardTitle>
            <CardDescription>
              Gold node is the handle. Purple is the probe loss. At K=1, red IFT is wild; blue
              reverse-sweep is the true gradient. Slide K up — they meet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {copy ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm">
                <p className="font-medium text-destructive">{copy.title}</p>
                <p className="mt-1 text-destructive/90">{copy.body}</p>
              </div>
            ) : null}
            <ClothCanvas
              state={mesh}
              positions={positions}
              sweepAdj={sweepAdj}
              iftAdj={iftAdj}
              overlay={overlay}
              disabled={Boolean(copy)}
              onDrag={onDrag}
            />
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-500" /> IFT (equation)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-blue-500" /> Reverse-sweep (solver)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-400" /> Handle
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-purple-400" /> Probe
              </span>
              {iftVsSweep !== null ? (
                <span className="font-mono text-foreground">
                  IFT vs sweep {formatPct(iftVsSweep)}
                </span>
              ) : null}
              {match ? <span className="font-mono text-blue-300">{match}</span> : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card/80">
            <CardHeader className="border-b">
              <CardTitle>K sweeps</CardTitle>
              <CardDescription>
                Arrows solve min(K, {LIVE_SOLVE_CAP}) so the cloth stays live. Memory uses the K you
                set, including 1000.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-3xl font-semibold">{k}</span>
                <span className="text-xs text-muted-foreground">
                  live adjoint K={emptyMesh ? "\u2014" : liveK}
                </span>
              </div>
              <Slider
                min={0}
                max={1000}
                step={1}
                value={[k]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  setK(typeof next === "number" ? next : 0);
                }}
              />
              <div className="flex flex-wrap gap-2">
                {[0, 1, 8, 32, 1000].map((preset) => (
                  <Button
                    key={preset}
                    size="xs"
                    variant={k === preset ? "default" : "outline"}
                    onClick={() => setK(preset)}
                  >
                    K={preset}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["both", "sweep", "ift"] as OverlayMode[]).map((mode) => (
                  <Toggle
                    key={mode}
                    variant="outline"
                    pressed={overlay === mode}
                    onPressedChange={() => setOverlay(mode)}
                    className="capitalize"
                  >
                    {mode === "ift" ? "Red IFT" : mode === "sweep" ? "Blue sweep" : "Both"}
                  </Toggle>
                ))}
              </div>
              <Toggle
                variant="outline"
                pressed={emptyMesh}
                onPressedChange={setEmptyMesh}
              >
                Empty mesh
              </Toggle>
            </CardContent>
          </Card>

          <MemoryPanel
            n={panelN}
            k={k}
            tape={tape}
            measured={measured}
            onAllocate={onAllocate}
            onRelease={onRelease}
          />
        </div>
      </div>

      <Card className="bg-card/80">
        <CardHeader className="border-b">
          <CardTitle>Three-way comparison</CardTitle>
          <CardDescription>
            Unrolled AD is the tape. IFT is the equation. Sweep-adjoint is the solver run backwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <ComparisonTable k={k} sweepVsUnrolled={sweepVsUnrolled} iftVsSweep={iftVsSweep} />
        </CardContent>
      </Card>

      <Card className="bg-card/80">
        <CardHeader className="border-b">
          <CardTitle>Reverse-color-order local blocks</CardTitle>
          <CardDescription>
            The backward pass is the forward block-implicit sweep run in reverse. Readable
            implementation — not a global Jacobian, not fake arrows.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <pre className="overflow-x-auto rounded-lg bg-[#0b1018] p-4 font-mono text-[12px] leading-6 text-slate-200">
            {`// Shu et al.: local 3\u00d73 adjoint (2\u00d72 in this 2D slice), reverse color order
for (k = K-1; k >= 0; k--) {
  rematerialize x^{k} from x0          // workspace O(N), not O(K\u00d7N)
  for (color of [odd, even])           // reverse of the forward checkerboard
    for (i of reverse(color))
      \u03bc = solve(H_i\u1d40, -\u0101_i)           // vertex block \u2014 not assembled J
      VJP through g_i, H_i into neighbors
}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="bg-card/80">
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-pretty">{body}</p>
      </CardContent>
    </Card>
  );
}

function maxAbsDiffLabel(rel: number): string {
  if (rel < 1e-10) return "sweep matches tape to machine precision";
  return `sweep vs tape ${formatPct(rel)}`;
}
