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
  formatRelError,
  measureSolverWorkspaces,
  runExplainer,
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

const THESIS = BRIEF.thesis;
const PATH = [
  "Leave K=1",
  "Drag the gold node",
  "Toggle red, then blue",
  "Read the error %",
  "Raise K — red approaches blue",
  "Slide K to 1000 for memory",
] as const;

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
  const [iftVsUnrolled, setIftVsUnrolled] = useState<number | null>(null);
  const [solveError, setSolveError] = useState<SolverErrorCode | null>(null);
  const [tape, setTape] = useState<TapeAllocation | null>(null);
  const [measured, setMeasured] = useState<MeasuredMemory | null>(null);
  const [allocLive, setAllocLive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const tapeHold = useRef<ArrayBuffer | null>(null);
  const measuredHold = useRef<MeasuredHold | null>(null);
  const panelN = emptyMesh ? 0 : 400;

  const mesh = emptyMesh ? createEmptyMesh() : cloth;
  const liveK = Math.min(k, LIVE_SOLVE_CAP);
  const arrowsCapped = !emptyMesh && k > LIVE_SOLVE_CAP;
  const hardError: SolverErrorCode | null = emptyMesh ? "empty_mesh" : k <= 0 ? "k_zero" : null;
  const error = hardError ?? solveError;
  const livePositions = hardError ? null : positions;
  const liveSweepAdj = hardError ? null : sweepAdj;
  const liveIftAdj = hardError ? null : iftAdj;
  const liveIftVsSweep = hardError ? null : iftVsSweep;
  const liveSweepVsUnrolled = hardError ? null : sweepVsUnrolled;
  const liveIftVsUnrolled = hardError ? null : iftVsUnrolled;

  useEffect(() => {
    if (hardError || dragging) return;

    // One path after release / K change: positions + both adjoints + vs-unrolled.
    // Yield so the last drag frame paints before the main-thread solve.
    const id = window.setTimeout(() => {
      try {
        const full = runExplainer(cloneCloth(cloth), liveK);
        setSolveError(null);
        setPositions(full.x);
        setSweepAdj(full.sweepAdj);
        setIftAdj(full.iftAdj);
        setIftVsSweep(full.iftVsSweep);
        setSweepVsUnrolled(full.sweepVsUnrolled);
        setIftVsUnrolled(full.iftVsUnrolled);
      } catch (caught) {
        if (caught instanceof SweepAdjointError) {
          setSolveError(caught.code);
          return;
        }
        throw caught;
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [cloth, dragging, hardError, liveK]);

  const onDragStart = () => {
    setDragging(true);
  };

  const onDragEnd = (index: number, x: number, y: number) => {
    setCloth((prev) => {
      const next = cloneCloth(prev);
      setDraggedNode(next, index, x, y);
      return next;
    });
    setDragging(false);
  };

  useEffect(() => {
    if (!allocLive) {
      tapeHold.current = null;
      measuredHold.current = null;
      return;
    }
    const allocK = Math.max(k, 1);
    const nextTape = tryAllocateTape(tapeBytesFor(panelN, allocK));
    tapeHold.current = nextTape.ok ? nextTape.buffer : null;
    const nextMeasured = measureSolverWorkspaces(panelN, allocK, measuredHold.current);
    measuredHold.current = nextMeasured.ok ? nextMeasured.hold : null;
    const id = window.setTimeout(() => {
      setTape(nextTape);
      setMeasured(nextMeasured);
    }, 0);
    return () => window.clearTimeout(id);
  }, [allocLive, panelN, k]);

  const onAllocate = () => {
    setAllocLive(true);
  };

  const onRelease = () => {
    setAllocLive(false);
    setTape(null);
    setMeasured(null);
  };

  const copy = error ? errorCopy(error) : null;
  const pending = dragging ? "recompute on release" : "computing live adjoints";
  const blue = liveSweepVsUnrolled === null ? null : formatRelError(liveSweepVsUnrolled);
  const red =
    liveIftVsUnrolled !== null
      ? formatRelError(liveIftVsUnrolled)
      : liveIftVsSweep !== null
        ? formatRelError(liveIftVsSweep)
        : null;
  const redFormula =
    liveIftVsUnrolled !== null ? "|red − unrolled| / |unrolled|" : "|red − blue|";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{BRIEF.title}</h1>
        <ol className="max-w-3xl space-y-1.5 text-lg leading-snug text-pretty sm:text-xl">
          {THESIS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {PATH.map((step, i) => (
            <li key={step} className="inline-flex items-center gap-1.5">
              <span className="font-mono text-foreground/80">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <Card className="overflow-hidden bg-card/80">
          <CardHeader className="border-b">
            <CardTitle>Drag the gold node.</CardTitle>
            <CardDescription>
              Arrows are two gradient estimates, not physics forces. Red is IFT. Blue is
              sweep-adjoint. Gold is the handle you drag. Drag redraws the cloth; arrows and error %
              recompute when you release.
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
              positions={livePositions}
              sweepAdj={liveSweepAdj}
              iftAdj={liveIftAdj}
              overlay={overlay}
              disabled={Boolean(copy)}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <ErrorReadout
              tone="blue"
              title="Blue vs tape"
              formula="|blue − unrolled| / |unrolled|"
              value={blue}
              pending={pending}
            />
            <ErrorReadout
              tone="red"
              title="Red vs tape"
              formula={redFormula}
              value={red}
              pending={pending}
            />
          </div>

          <Card className="bg-card/80">
            <CardHeader className="border-b py-3">
              <CardTitle className="text-base">K sweeps</CardTitle>
              <CardDescription>
                Arrows use min(K, {LIVE_SOLVE_CAP}). Memory uses the K you set, including 1000.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-4xl font-semibold">{k}</span>
                <span className="text-xs text-muted-foreground">
                  {emptyMesh
                    ? "live K=\u2014"
                    : arrowsCapped
                      ? `arrows use K=${liveK} (capped)`
                      : `live K=${liveK}`}
                </span>
              </div>
              <Slider
                min={1}
                max={1000}
                step={1}
                value={[k]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  setK(typeof next === "number" ? next : 1);
                }}
              />
              <div className="flex flex-wrap gap-2">
                {[1, 8, 32, 1000].map((preset) => (
                  <Button
                    key={preset}
                    size="xs"
                    variant={k === preset ? "default" : "outline"}
                    onClick={() => setK(preset)}
                  >
                    {preset === 1000 ? "Crank K to 1000" : `K=${preset}`}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Toggle
                  variant="outline"
                  pressed={overlay === "ift"}
                  onPressedChange={() => setOverlay("ift")}
                >
                  Red IFT alone
                </Toggle>
                <Toggle
                  variant="outline"
                  pressed={overlay === "sweep"}
                  onPressedChange={() => setOverlay("sweep")}
                >
                  Blue sweep alone
                </Toggle>
                <Toggle
                  variant="outline"
                  pressed={overlay === "both"}
                  onPressedChange={() => setOverlay("both")}
                >
                  Both
                </Toggle>
              </div>
            </CardContent>
          </Card>

          <MemoryPanel n={panelN} k={k} onCrank={() => setK(1000)} />
        </div>
      </div>

      <details className="rounded-xl border bg-card/80 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Details — paper, VBD, reverse-color, empty mesh
        </summary>
        <div className="mt-4 space-y-4 text-sm leading-6">
          <p className="text-muted-foreground">
            {BRIEF.paper} ·{" "}
            <a className="underline underline-offset-4" href={BRIEF.arxivUrl}>
              arXiv:{BRIEF.arxiv}
            </a>
            {" · "}
            <a className="underline underline-offset-4" href="/k1">
              K=1 proof
            </a>
            . 20×20 cloth, 400 nodes, CPU Vertex Block Descent. Not a GPU physics engine.
          </p>
          <p>{BRIEF.who}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Toggle variant="outline" pressed={emptyMesh} onPressedChange={setEmptyMesh}>
              Empty mesh
            </Toggle>
            <Button size="xs" variant="outline" onClick={() => setK(0)}>
              K=0
            </Button>
            <Badge variant="outline">live adjoint cap {LIVE_SOLVE_CAP}</Badge>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-[#0b1018] p-4 font-mono text-[12px] leading-6 text-slate-200">
            {`// reverse-color-order local blocks (2\u00d72 in this 2D slice)
for (k = K-1; k >= 0; k--) {
  rematerialize x^{k} from x0          // workspace O(N), not O(K\u00d7N)
  for (color of [odd, even])           // reverse of the forward checkerboard
    for (i of reverse(color))
      \u03bc = solve(H_i\u1d40, -\u0101_i)
      VJP through g_i, H_i into neighbors
}`}
          </pre>
        </div>
      </details>

      <Card className="bg-card/80">
        <CardHeader className="border-b">
          <CardTitle>Three-way comparison</CardTitle>
          <CardDescription>
            Unrolled AD is the tape. IFT is the equation. Sweep-adjoint is the solver run backwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <ComparisonTable
            k={k}
            sweepVsUnrolled={liveSweepVsUnrolled}
            iftVsUnrolled={liveIftVsUnrolled}
            iftVsSweep={liveIftVsSweep}
          />
        </CardContent>
      </Card>

      <MemoryPanel
        n={panelN}
        k={k}
        tape={allocLive ? tape : null}
        measured={allocLive ? measured : null}
        onAllocate={onAllocate}
        onRelease={onRelease}
        onCrank={() => setK(1000)}
        showTapeControls
      />
    </div>
  );
}

function ErrorReadout({
  tone,
  title,
  formula,
  value,
  pending,
}: {
  tone: "blue" | "red";
  title: string;
  formula: string;
  value: { headline: string; detail: string } | null;
  pending: string;
}) {
  const color = tone === "blue" ? "text-blue-400" : "text-rose-400";
  const border = tone === "blue" ? "border-blue-500/30" : "border-rose-500/30";
  return (
    <div className={`rounded-xl border bg-card/80 px-4 py-3 ${border}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className={`font-mono text-5xl font-semibold tracking-tight sm:text-6xl ${color}`}>
        {value?.headline ?? "—"}
      </p>
      <p className="text-sm text-muted-foreground">{value?.detail ?? pending}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">{formula}</p>
    </div>
  );
}
