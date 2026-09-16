"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPct } from "@/lib/sweep-adjoint";

type ComparisonTableProps = {
  k: number;
  sweepVsUnrolled: number | null;
  iftVsSweep: number | null;
};

export function ComparisonTable({ k, sweepVsUnrolled, iftVsSweep }: ComparisonTableProps) {
  const sweepAcc =
    sweepVsUnrolled === null ? "—" : sweepVsUnrolled < 1e-8 ? "matches tape (0%)" : formatPct(sweepVsUnrolled);
  const iftAcc =
    iftVsSweep === null
      ? "—"
      : k <= 1
        ? `${formatPct(iftVsSweep)} off — wild`
        : `${formatPct(iftVsSweep)} off`;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Method</TableHead>
          <TableHead>Accuracy at this K</TableHead>
          <TableHead>Memory scaling</TableHead>
          <TableHead>Compute flow</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Unrolled AD</TableCell>
          <TableCell>True gradient (tape)</TableCell>
          <TableCell className="font-mono">O(K×N)</TableCell>
          <TableCell>Forward tape, then reverse every stored step</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium text-rose-400">IFT</TableCell>
          <TableCell>{iftAcc}</TableCell>
          <TableCell className="font-mono">O(N)</TableCell>
          <TableCell>One linear solve on the residual — the equation, not the solver</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium text-blue-400">Sweep-adjoint</TableCell>
          <TableCell>{sweepAcc}</TableCell>
          <TableCell className="font-mono">O(1) vs K</TableCell>
          <TableCell>Reverse-color-order local 3×3 / 2×2 blocks. No global Jacobian.</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
