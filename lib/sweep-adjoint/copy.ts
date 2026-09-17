export const BRIEF = {
  title: "Sweep-Adjoint Visualizer",
  paper: "Shu et al., Differentiate the Solver, Not the Equation",
  arxiv: "2608.08559",
  arxivUrl: "https://arxiv.org/abs/2608.08559",
  thesis: [
    "You ran a solver for K sweeps and want gradients of a loss.",
    "Red = IFT (differentiate the equilibrium equation) — wrong at small K.",
    "Blue = sweep-adjoint (run the same local block updates backward) — matches tape AD; memory flat in K.",
  ] as const,
  problem:
    "Unrolled AD tapes the stepper. Memory grows with K. Equation-level IFT (Neural ODE / DEQ / optimization layers) differentiates the fixed point, not the finite solver that ran. At K=1 it is 37% off. No loved crate is the reverse-colored Gauss–Seidel of the energy-minimizing sweep that actually executed.",
  thisDemo:
    "20×20 cloth (400 nodes), CPU Vertex Block Descent. Drag a node. Red arrows are equation-level IFT — wild at K=1. Blue arrows are the reverse-sweep: local 3×3 (2×2 in this 2D slice) adjoint solves in reverse color order. They match the true (unrolled) gradient to machine precision at every K. Slide K from 1→1000: the tape-AD memory balloon is O(K×N); sweep-adjoint stays flat O(1) versus K. Empty mesh and K=0 are first-class errors. This is not a GPU physics engine.",
  who: "Graphics, ML, and physics-sim developers who need a clean reference for the primitive — not a production differentiable simulator.",
} as const;

export const LIVE_SOLVE_CAP = 32;
