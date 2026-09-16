"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, memoryReport, tryAllocateTape, type TapeAllocation } from "@/lib/sweep-adjoint";

type MemoryPanelProps = {
  n: number;
  k: number;
  tape: TapeAllocation | null;
  onAllocate: () => void;
  onRelease: () => void;
};

export function MemoryPanel({ n, k, tape, onAllocate, onRelease }: MemoryPanelProps) {
  const report = memoryReport(n, k);
  const peak = Math.max(report.unrolledBytes, report.sweepBytes, 1);
  const oom = tape !== null && !tape.ok;

  return (
    <Card className="bg-card/80">
      <CardHeader className="border-b">
        <CardTitle>Memory telemetry</CardTitle>
        <CardDescription>
          Tape AD balloons O(K\u00d7N) as K goes 1\u21921000. Sweep-adjoint stays flat O(1) versus K.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <Bar
          label="Unrolled AD tape"
          hint="O(K\u00d7N)"
          bytes={report.unrolledBytes}
          peak={peak}
          color="bg-rose-500"
        />
        <Bar
          label="Sweep-adjoint workspace"
          hint="O(1) vs K"
          bytes={report.sweepBytes}
          peak={peak}
          color="bg-blue-500"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            N = {n} nodes. At K={k}, tape is {ratio(report.unrolledBytes, report.sweepBytes)}\u00d7 the
            reverse-sweep workspace.
          </span>
          {oom ? (
            <Badge variant="destructive">Tape OOM \u2014 {formatBytes(tape.bytes)} refused</Badge>
          ) : tape?.ok ? (
            <Badge variant="secondary">Tape materialized {formatBytes(tape.bytes)}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onAllocate}>
            Materialize tape
          </Button>
          <Button size="sm" variant="ghost" onClick={onRelease} disabled={!tape}>
            Release tape
          </Button>
        </div>
      </CardContent>
    </Card>
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
  if (b <= 0) return "\u221e";
  return (a / b).toFixed(0);
}
