"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatBytes,
  memoryReport,
  type MeasuredMemory,
  type TapeAllocation,
} from "@/lib/sweep-adjoint";

type MemoryPanelProps = {
  n: number;
  k: number;
  tape: TapeAllocation | null;
  measured: MeasuredMemory | null;
  onAllocate: () => void;
  onRelease: () => void;
};

export function MemoryPanel({ n, k, tape, measured, onAllocate, onRelease }: MemoryPanelProps) {
  const report = memoryReport(n, k);
  const schematicPeak = Math.max(report.unrolledBytes, report.sweepBytes, 1);
  const oom = tape !== null && !tape.ok;
  const measuredOom = measured !== null && !measured.ok;
  const held = measured?.ok === true ? measured : null;
  const measuredPeak = held ? Math.max(held.tapeBytes, held.sweepBytes, 1) : 1;

  return (
    <Card className="bg-card/80">
      <CardHeader className="border-b">
        <CardTitle>Memory telemetry</CardTitle>
        <CardDescription>
          Schematic bars are the fat-tape model (K×N×256 B). Measured bars are
          `.byteLength` of the TypedArrays the solvers actually keep.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <section className="space-y-4">
          <SectionHeading
            title="Schematic"
            hint="Not a measured heap. Model: tape = K×N×256 B, sweep = N×256 B."
          />
          <Bar
            label="Unrolled AD tape"
            hint="O(K×N)"
            bytes={report.unrolledBytes}
            peak={schematicPeak}
            color="bg-rose-500"
          />
          <Bar
            label="Sweep-adjoint workspace"
            hint="O(1) vs K"
            bytes={report.sweepBytes}
            peak={schematicPeak}
            color="bg-blue-500"
          />
          <p className="text-xs text-muted-foreground">
            N = {n} nodes. At K={k}, schematic tape is{" "}
            {ratio(report.unrolledBytes, report.sweepBytes)}× the reverse-sweep workspace.
          </p>
        </section>

        <section className="space-y-4">
          <SectionHeading
            title="Measured"
            hint="Sum of .byteLength of solver workspaces. Tape = K×N×16 B. Sweep = N×16 B, independent of K."
          />
          {held ? (
            <>
              <Bar
                label="Unrolled tape"
                hint="K×N×16"
                bytes={held.tapeBytes}
                peak={measuredPeak}
                color="bg-rose-400"
              />
              <Bar
                label="Sweep workspace"
                hint="N×16"
                bytes={held.sweepBytes}
                peak={measuredPeak}
                color="bg-blue-400"
              />
              <p className="text-xs text-muted-foreground">
                Held at N={held.n}, K={held.sweeps}. Measured tape is{" "}
                {ratio(held.tapeBytes, held.sweepBytes)}× measured sweep.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Not yet measured. Click <span className="font-medium text-foreground">Materialize tape</span>{" "}
              to allocate the real solver workspaces at this K and read their{" "}
              <span className="font-mono">.byteLength</span>. Numbers update as K changes until you
              release.
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {oom ? (
            <Badge variant="destructive">Schematic tape OOM — {formatBytes(tape.bytes)} refused</Badge>
          ) : tape?.ok ? (
            <Badge variant="secondary">Schematic tape materialized {formatBytes(tape.bytes)}</Badge>
          ) : null}
          {measuredOom ? (
            <Badge variant="destructive">Measured workspace OOM</Badge>
          ) : held ? (
            <Badge variant="secondary">
              Measured hold {formatBytes(held.tapeBytes + held.sweepBytes)}
            </Badge>
          ) : null}
          {held ? <HeapBadge delta={held.heapDeltaBytes} /> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onAllocate}>
            Materialize tape
          </Button>
          <Button size="sm" variant="ghost" onClick={onRelease} disabled={!tape && !measured}>
            Release tape
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function HeapBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <Badge variant="outline">Chrome heap Δ unavailable (best-effort, Chromium only)</Badge>
    );
  }
  return (
    <Badge variant="outline">Chrome heap Δ {formatBytes(delta)} (best-effort, Chromium only)</Badge>
  );
}

function Bar({
  label,
  hint,
  bytes,
  peak,
  color,
}: {
  label: string;
  hint: string;
  bytes: number;
  peak: number;
  color: string;
}) {
  const width = `${Math.max(2, (bytes / peak) * 100)}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {label}{" "}
          <span className="font-mono text-xs text-muted-foreground">{hint}</span>
        </span>
        <span className="font-mono text-xs">{formatBytes(bytes)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width }} />
      </div>
    </div>
  );
}

function ratio(a: number, b: number): string {
  if (b <= 0) return "∞";
  return (a / b).toFixed(0);
}
