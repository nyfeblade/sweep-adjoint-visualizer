# Sweep-Adjoint Visualizer: Exact Gradients at O(1) Memory

**Maintainer / demo author:** Luke Horn (`hornsons21@gmail.com` / [nyfeblade](https://github.com/nyfeblade))

**Citation:** Shu et al., *Differentiate the Solver, Not the Equation*, [arXiv:2608.08559](https://arxiv.org/abs/2608.08559)

This repo is a reference visualizer and verifier for the **sweep-adjoint** primitive. Math credit belongs to the paper authors. Implementation and demo by Luke Horn.

First public proof release: annotated tag **`v0.1.0-proof`**.

The backward pass **is** the forward block-implicit sweep run in reverse. Not a production differentiable physics engine. Not a GPU fixture.

The math lives in `lib/sweep-adjoint/` — a small local module, no extra solver dependencies. The UI is Next.js + Tailwind + shadcn so you can watch the fight.

## Problem

Unrolled AD tapes the stepper. Memory grows with K. Equation-level IFT (Neural ODE / DEQ / optimization layers) differentiates the fixed point, not the finite solver that ran. At K=1 it is 37% off. No loved crate is the reverse-colored Gauss–Seidel of the energy-minimizing sweep that actually executed.

## This demo

20×20 cloth (400 nodes), CPU Vertex Block Descent. Drag a node. Red arrows are equation-level IFT — wild at K=1. Blue arrows are the reverse-sweep: local 3×3 (2×2 in this 2D slice) adjoint solves in reverse color order. They match the true (unrolled) gradient to machine precision at every K. Slide K from 1→1000: the tape-AD memory balloon is O(K×N); sweep-adjoint stays flat O(1) versus K. Empty mesh and K=0 are first-class errors. This is not a GPU physics engine.

## Who is this for

Graphics, ML, and physics-sim developers who need a clean reference for the primitive — not a production differentiable simulator.

## How to run (laptop)

Node **22** (this repo is developed on 22.14). Python **3.12+** with NumPy for the K=1 table. No Docker, no GPU, no extra services.

```bash
git clone https://github.com/nyfeblade/sweep-adjoint-visualizer.git
cd sweep-adjoint-visualizer
npm install
npm run dev -- -p 43187
```

Open **http://127.0.0.1:43187**. Drag the gold node at K=1.

**K=1 proof page** (three numbers, ten seconds): **http://127.0.0.1:43187/k1**

Finite difference (truth), sweep-adjoint (blue), IFT (red). Blue matches truth. Red does not — the solver only ran K=1.

K=1 verification (the thesis, not chrome):

```bash
python3 scripts/verify_k1.py
```

If NumPy is missing:

```bash
python3 -m pip install -r scripts/requirements.txt
```

Homebrew Python is PEP 668-managed. Use a venv if user install is blocked:

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/verify_k1.py
```

**What numbers mean the thesis holds.** The script prints ∂L/∂p (handle force_x) four ways after **one** VBD sweep on a 10×10 grid. Pass when:

- Tape / unrolled AD matches central FD (relative ~1e-7 or better)
- Sweep-adjoint matches tape and FD to ~1e-7
- Standard IFT is **wrong** at K=1 (tens or hundreds of percent off)

That is the paper: differentiate the solver that ran, not the equation. IFT is the equation. Sweep-adjoint is the reverse local 3×3 / 2×2 block in reverse color order.

`npm run check:math` is the same claim in the in-repo TypeScript module. It also asserts the `/k1` fixture: FD ≈ sweep-adjoint, IFT wrong at K=1.

`npm run check:memory` is the memory claim as a measured hold, not a schematic bar. It allocates the TypedArrays the solvers actually keep and asserts:

- measured sweep `.byteLength` is identical across K ∈ {1, 8, 32, 100}
- measured tape grows as K×N×16 B (tape at K=32 is 32× tape at K=1)
- measured tape exceeds sweep for K ≫ 1

That is `.byteLength` of the real buffers — not the schematic K×N×256 model, and not `performance.memory`. The Memory panel shows both: **Schematic** (fat-tape model) and **Measured** (held workspaces after **Materialize tape**).

## Checks

```bash
python3 scripts/verify_k1.py   # NumPy: FD ≈ tape ≈ sweep; IFT wrong at K=1
npm run check:math             # TypeScript module + /k1 fixture
npm run check:memory           # measured tape grows with K; sweep is flat
```

Open `/k1` for the three-number proof page. Tag `v0.1.0-proof` is the first public proof release.

## GIF-quality: what you watch

1. The page opens at **K=1** with the 3-line thesis and two huge live error %.
2. **Drag the gold node.** Arrows and error % recompute when you release.
3. Toggle **Red IFT alone**, then **Blue sweep alone**, then **Both**.
4. Read **|blue − unrolled| / |unrolled|** (~0) and **|red − unrolled| / |unrolled|** (tens of percent at K=1).
5. Raise **K**. Red approaches blue.
6. **Crank K to 1000**. Schematic tape bar ≫ flat sweep workspace (labeled schematic, not a measured heap).
7. **Materialize tape**: **Measured** bars are `.byteLength` of the real tape (K×N×16 B) and sweep workspace (N×16 B, flat vs K).
8. **Details** holds arXiv, VBD, reverse-color, empty mesh, K=0, tape allocate, and the `/k1` proof.

## Math (in-repo)

`lib/sweep-adjoint/` is the reference:

- Vertex-block descent, checkerboard Gauss–Seidel
- Reverse-color-order local blocks (3×3 in the paper; 2×2 here)
- Unrolled-AD tape twin (O(K×N))
- Equation-level IFT via the energy Hessian
- Empty mesh / K=0 throw `SweepAdjointError`
- Measured workspace hold: tape = K×N×16 B, sweep = N×16 B (`npm run check:memory`)

Self-check: sweep-adjoint matches the tape to ~0 relative error; IFT is far at K=1 and meets at large K. Memory self-check: measured sweep is flat vs K; measured tape is K× the K=1 tape.

## Not this repo

No GPU 10⁶-body fixture. No production sim API. No notes app, Hands, nginx, or Pebble.
