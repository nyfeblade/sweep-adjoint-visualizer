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
  iftVsUnrolled: number | null;
  iftVsSweep: number | null;
};

export function ComparisonTable({
  k,
  sweepVsUnrolled,
  iftVsUnrolled,
  iftVsSweep,
}: ComparisonTableProps) {
  const sweepAcc =
    sweepVsUnrolled === null
      ? "—"
      : sweepVsUnrolled < 1e-8
        ? "matches tape (~0)"
        : formatPct(sweepVsUnrolled);
  const redRel = iftVsUnrolled ?? iftVsSweep;
  const iftAcc =
    redRel === null ? "—" : k <= 1 ? `${formatPct(redRel)} off — wild` : `${formatPct(redRel)} off`;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Method</TableHead>
          <TableHead>Accuracy at this K</TableHead>
          <TableHead>Memory scaling</TableHead>
          <TableHead>What it differentiates</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Unrolled AD</TableCell>
          <TableCell>True gradient (tape)</TableCell>
          <TableCell className="font-mono">O(K×N)</TableCell>
          <TableCell>The K solver steps that actually ran</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium text-rose-400">IFT (red)</TableCell>
          <TableCell>{iftAcc}</TableCell>
          <TableCell className="font-mono">O(N)</TableCell>
          <TableCell>The equilibrium equation — wrong at small K</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium text-blue-400">Sweep-adjoint (blue)</TableCell>
          <TableCell>{sweepAcc}</TableCell>
          <TableCell className="font-mono">flat in K</TableCell>
          <TableCell>The same local block updates, run backward</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
