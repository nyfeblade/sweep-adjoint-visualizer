import type { Metadata } from "next";

import { BRIEF, proveK1 } from "@/lib/sweep-adjoint";

export const metadata: Metadata = {
  title: "K=1 proof — Sweep-Adjoint",
  description: "Blue matches truth. Red does not — the solver only ran K=1.",
};

function sci(value: number): string {
  return value.toExponential(8);
}

function relLabel(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (value < 1e-8) return `${value.toExponential(2)}  (match)`;
  return value.toExponential(2);
}

export default function K1ProofPage() {
  const proof = proveK1();

  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-10 px-4 py-16 sm:px-6">
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-wide text-muted-foreground">
          K=1 proof · v0.1.0-proof · {proof.grid}×{proof.grid} · one sweep
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Three numbers. One sweep.</h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          After the solver runs once, how does the probe loss change if you nudge the handle&apos;s
          x-force? Finite difference is the truth. Blue is the reverse sweep. Red is the equation.
        </p>
      </header>

      <section className="grid gap-6 sm:grid-cols-3" aria-label="K=1 gradients">
        <NumberCard
          label="Finite difference"
          hint="truth"
          value={proof.fd}
          tone="truth"
        />
        <NumberCard
          label="Sweep-adjoint"
          hint="blue"
          value={proof.sweep}
          tone="sweep"
        />
        <NumberCard
          label="IFT"
          hint="red"
          value={proof.ift}
          tone="ift"
        />
      </section>

      <p className="text-xl font-medium leading-8 text-pretty sm:text-2xl">
        Blue matches truth. Red does not — the solver only ran K=1.
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Raw ∂L/∂p and relative error vs FD
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-card/80">
          <table className="w-full min-w-[28rem] text-left font-mono text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">method</th>
                <th className="px-4 py-3 font-medium">∂L/∂p</th>
                <th className="px-4 py-3 font-medium">vs FD</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="px-4 py-3">Finite difference</td>
                <td className="px-4 py-3">{sci(proof.fd)}</td>
                <td className="px-4 py-3">—</td>
              </tr>
              <tr className="border-b text-blue-400">
                <td className="px-4 py-3">Sweep-adjoint</td>
                <td className="px-4 py-3">{sci(proof.sweep)}</td>
                <td className="px-4 py-3">{relLabel(proof.sweepVsFd)}</td>
              </tr>
              <tr className="text-rose-400">
                <td className="px-4 py-3">IFT</td>
                <td className="px-4 py-3">{sci(proof.ift)}</td>
                <td className="px-4 py-3">{relLabel(proof.iftVsFd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Same <code>runExplainer</code> + central FD path as <code>npm run check:math</code>. Independent
          NumPy table: <code>python3 scripts/verify_k1.py</code>.
        </p>
      </section>

      <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <a className="underline underline-offset-4" href="/">
          ← Cloth visualizer
        </a>
        <a className="underline underline-offset-4" href={BRIEF.arxivUrl}>
          {BRIEF.paper} · arXiv:{BRIEF.arxiv}
        </a>
      </nav>
    </main>
  );
}

function NumberCard({
  label,
  hint,
  value,
  tone,
}: {
  label: string;
  hint: string;
  value: number;
  tone: "truth" | "sweep" | "ift";
}) {
  return (
    <div className="rounded-lg border bg-card/80 px-4 py-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        <span className="ml-2 normal-case text-muted-foreground/80">({hint})</span>
      </p>
      <p
        data-k1-method={tone}
        className={`mt-3 font-mono text-3xl font-semibold tracking-tight sm:text-4xl ${toneClass(tone)}`}
      >
        {value.toExponential(3)}
      </p>
    </div>
  );
}

function toneClass(tone: "truth" | "sweep" | "ift"): string {
  switch (tone) {
    case "sweep":
      return "text-blue-400";
    case "ift":
      return "text-rose-400";
    case "truth":
      return "text-foreground";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}
