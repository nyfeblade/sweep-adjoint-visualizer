export type SolverErrorCode = "empty_mesh" | "k_zero";

export class SweepAdjointError extends Error {
  readonly code: SolverErrorCode;

  constructor(code: SolverErrorCode, message: string) {
    super(message);
    this.name = "SweepAdjointError";
    this.code = code;
  }
}

export function assertRunnable(nodeCount: number, sweeps: number): void {
  if (nodeCount <= 0) {
    throw new SweepAdjointError(
      "empty_mesh",
      "Empty mesh: no vertices, no residual, no adjoint. Sweep-adjoint is the reverse of an executed colored sweep — there is nothing to reverse.",
    );
  }
  if (sweeps <= 0) {
    throw new SweepAdjointError(
      "k_zero",
      "K=0: the solver did not run. Sweep-adjoint is the reverse of an executed block-implicit sweep. There is no tape to play and no residual to invert.",
    );
  }
}

export function errorCopy(code: SolverErrorCode): { title: string; body: string } {
  switch (code) {
    case "empty_mesh":
      return {
        title: "Empty mesh",
        body: "No vertices, no residual, no adjoint. This is a first-class failure of the primitive — not a blank canvas.",
      };
    case "k_zero":
      return {
        title: "K = 0",
        body: "The solver did not run. Sweep-adjoint is the reverse of the sweep that actually executed. Equation-level IFT still wants a residual; here there is none.",
      };
    default: {
      const neverCode: never = code;
      throw new Error(`Unhandled solver error: ${neverCode}`);
    }
  }
}
