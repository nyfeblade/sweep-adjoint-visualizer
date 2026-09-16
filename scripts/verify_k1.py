#!/usr/bin/env python3
"""K=1 sweep-adjoint verification — Shu et al., arXiv:2608.08559.

ONE forward Vertex-Block-Descent sweep on a 10×10 mass-spring grid.
Compares ∂L/∂p four ways. p is the handle's x-force. L is probe-node
matching, ½‖x_probe − rest_probe‖².

---------------------------------------------------------------------------
Local 3×3 block adjoint (the reverse local solve)
---------------------------------------------------------------------------
Paper (3D): each vertex i holds a 3×3 SPD block H_i = ∂g_i/∂x_i.
This 2D slice uses the same object with a 2×2 block (z omitted).

Forward VBD Newton step at i (neighbors held at their current GS values):

    g = g(x_i, x_N, p)          # local force residual
    H = ∂g/∂x_i                 # local Hessian, regularized so invertible
    y = H^{-1} g
    x_i' = x_i − y

Reverse (incoming ā' = ∂L/∂x_i'):

    ȳ = −ā'                     # x' = x − y
    Solve Hᵀ μ = ȳ              # ← the local 3×3 (2×2) adjoint solve
    ḡ += μ
    H̄ += −μ yᵀ
    VJP of (g, H) w.r.t. x_i, x_N, p
    ā_x += ā'                   # direct path through x' = x − y

That is *not* IFT on g(x*)=0, and *not* an assembled global Jacobian.
Reverse schedule here: reverse checkerboard (odd then even) — the reverse
of the forward red-black sweep. Sequential LIFO (reverse the exact vertex
visit list) is equivalent if it matches the forward order. Warm-start and
contact are not in v1.

Caveats
-------
- Local H must be invertible; we add a small diagonal regularizer.
- Red-black reverse, not a generic sequential LIFO of an arbitrary GS.
- No warm-start, no contact / friction, no GPU fixture.
- IFT differentiates the energy residual as if K=1 had reached a root.
  At K=1 it must be WRONG. Sweep-adjoint must match tape and FD.
"""

from __future__ import annotations

import sys

import numpy as np

NX = NY = 10
SPACING = 1.0
SPRING_K = 90.0
SHEAR_K = 22.0
PIN_K = 2400.0
HANDLE_K = 320.0
GRAV_Y = -0.35
REG = 4e-3
EPS_FD = 1e-5
LEN_FLOOR = 1e-8
PASS_ABS = 1e-7
IFT_MIN_REL = 0.08


def idx(col: int, row: int) -> int:
    return row * NX + col


N = NX * NY
# Handle updates in the even pass; probe is an odd neighbor so K=1
# actually couples p → x_handle → x_probe. Same-color +2 hops is a zero.
HANDLE = idx(3, 1)
PROBE = idx(4, 1)
P_INDEX = 2 * HANDLE  # ∂L/∂(handle force_x)


def rest_positions() -> np.ndarray:
    x = np.zeros(N * 2)
    for row in range(NY):
        for col in range(NX):
            i = idx(col, row)
            x[2 * i] = col * SPACING
            x[2 * i + 1] = row * SPACING
    return x


def springs() -> list[tuple[int, int, float, float]]:
    out: list[tuple[int, int, float, float]] = []
    rest = rest_positions()

    def add(i: int, j: int, k: float) -> None:
        d = rest[2 * i : 2 * i + 2] - rest[2 * j : 2 * j + 2]
        out.append((i, j, float(np.linalg.norm(d)), k))

    for row in range(NY):
        for col in range(NX):
            i = idx(col, row)
            if col + 1 < NX:
                add(i, idx(col + 1, row), SPRING_K)
            if row + 1 < NY:
                add(i, idx(col, row + 1), SPRING_K)
            if col + 1 < NX and row + 1 < NY:
                add(i, idx(col + 1, row + 1), SHEAR_K)
            if col + 1 < NX and row > 0:
                add(i, idx(col + 1, row - 1), SHEAR_K)
    return out


SPRINGS = springs()
REST = rest_positions()
PINNED = np.array([1 if i // NX == NY - 1 else 0 for i in range(N)], dtype=np.int8)
TARGET = REST[2 * HANDLE : 2 * HANDLE + 2] + np.array([1.6, -1.8])
EVEN = [i for i in range(N) if ((i % NX) + (i // NX)) % 2 == 0]
ODD = [i for i in range(N) if ((i % NX) + (i // NX)) % 2 == 1]


def assemble_local(x: np.ndarray, force: np.ndarray, i: int) -> tuple[np.ndarray, np.ndarray]:
    g = np.zeros(2)
    h = np.zeros((2, 2))
    xi = x[2 * i : 2 * i + 2]
    for a, b, rest, k in SPRINGS:
        if a == i:
            other = b
        elif b == i:
            other = a
        else:
            continue
        e = xi - x[2 * other : 2 * other + 2]
        length = max(float(np.linalg.norm(e)), LEN_FLOOR)
        alpha = 1.0 - rest / length
        scale = k * (rest / length**3)
        g += k * alpha * e
        h += k * alpha * np.eye(2) + scale * np.outer(e, e)
    if PINNED[i]:
        g += PIN_K * (xi - REST[2 * i : 2 * i + 2])
        h += PIN_K * np.eye(2)
    if i == HANDLE:
        g += HANDLE_K * (xi - TARGET)
        h += HANDLE_K * np.eye(2)
    g[1] += -GRAV_Y
    g -= force[2 * i : 2 * i + 2]
    h[0, 0] += REG
    h[1, 1] += REG
    return g, h


def solve_local(h: np.ndarray, g: np.ndarray) -> np.ndarray:
    hh = h.copy()
    if abs(np.linalg.det(hh)) < 1e-14:
        hh += 1e-8 * np.eye(2)
    return np.linalg.solve(hh, g)


def newton(x: np.ndarray, force: np.ndarray, i: int) -> None:
    g, h = assemble_local(x, force, i)
    x[2 * i : 2 * i + 2] -= solve_local(h, g)


def one_sweep(x: np.ndarray, force: np.ndarray, tape: np.ndarray | None) -> None:
    for color in (EVEN, ODD):
        for i in color:
            if tape is not None:
                tape[2 * i : 2 * i + 2] = x[2 * i : 2 * i + 2]
            newton(x, force, i)


def loss(x: np.ndarray) -> float:
    d = x[2 * PROBE : 2 * PROBE + 2] - REST[2 * PROBE : 2 * PROBE + 2]
    return 0.5 * float(d @ d)


def seed_loss_adj(x: np.ndarray) -> np.ndarray:
    adj = np.zeros_like(x)
    adj[2 * PROBE : 2 * PROBE + 2] = x[2 * PROBE : 2 * PROBE + 2] - REST[2 * PROBE : 2 * PROBE + 2]
    return adj


def spring_vjp(
    x: np.ndarray,
    i: int,
    other: int,
    rest: float,
    k: float,
    g_bar: np.ndarray,
    h_bar: np.ndarray,
    adj: np.ndarray,
) -> None:
    e = x[2 * i : 2 * i + 2] - x[2 * other : 2 * other + 2]
    length = max(float(np.linalg.norm(e)), LEN_FLOOR)
    alpha = 1.0 - rest / length
    l3 = length**3
    l5 = length**5
    hs = k * alpha * np.eye(2) + k * (rest / l3) * np.outer(e, e)
    e_bar = hs @ g_bar
    tr_h = float(np.trace(h_bar))
    eHe = float(e @ (h_bar @ e))
    sym = (h_bar + h_bar.T) @ e
    e_bar = e_bar + k * (rest / l3) * tr_h * e
    e_bar = e_bar + k * rest * (-3.0 / l5) * eHe * e
    e_bar = e_bar + k * (rest / l3) * sym
    adj[2 * i : 2 * i + 2] += e_bar
    adj[2 * other : 2 * other + 2] -= e_bar


def reverse_vertex(
    x: np.ndarray,
    force: np.ndarray,
    i: int,
    x_old: np.ndarray,
    adj: np.ndarray,
    force_adj: np.ndarray,
) -> None:
    a_new = adj[2 * i : 2 * i + 2].copy()
    adj[2 * i : 2 * i + 2] = 0.0
    x[2 * i : 2 * i + 2] = x_old
    g, h = assemble_local(x, force, i)
    y = solve_local(h, g)
    # Hᵀ μ = −ā'   (local 2×2 / 3×3 adjoint solve)
    mu = solve_local(h.T, -a_new)
    h_bar = -np.outer(mu, y)
    for a, b, rest, k in SPRINGS:
        if a == i:
            spring_vjp(x, i, b, rest, k, mu, h_bar, adj)
        elif b == i:
            spring_vjp(x, i, a, rest, k, mu, h_bar, adj)
    if PINNED[i]:
        adj[2 * i : 2 * i + 2] += PIN_K * mu
    if i == HANDLE:
        adj[2 * i : 2 * i + 2] += HANDLE_K * mu
    force_adj[2 * i : 2 * i + 2] += -mu  # g includes −f
    adj[2 * i : 2 * i + 2] += a_new


def reverse_sweep(
    x: np.ndarray,
    force: np.ndarray,
    tape: np.ndarray,
    adj: np.ndarray,
    force_adj: np.ndarray,
) -> None:
    for color in (ODD, EVEN):
        for i in reversed(color):
            reverse_vertex(x, force, i, tape[2 * i : 2 * i + 2], adj, force_adj)


def tape_gradient(force: np.ndarray) -> float:
    x = REST.copy()
    tape = np.zeros_like(x)
    one_sweep(x, force, tape)
    adj = seed_loss_adj(x)
    force_adj = np.zeros_like(x)
    reverse_sweep(x, force, tape, adj, force_adj)
    return float(force_adj[P_INDEX])


def sweep_adjoint_gradient(force: np.ndarray) -> float:
    """O(N) workspace: rematerialize the single sweep from x0, then reverse it."""
    x0 = REST.copy()
    x = x0.copy()
    workspace = np.zeros_like(x)
    one_sweep(x, force, workspace)
    adj = seed_loss_adj(x)
    force_adj = np.zeros_like(x)
    x_rev = x.copy()
    reverse_sweep(x_rev, force, workspace, adj, force_adj)
    return float(force_adj[P_INDEX])


def hessian_vec(x: np.ndarray, force: np.ndarray, v: np.ndarray) -> np.ndarray:
    out = np.zeros_like(v)
    for i in range(N):
        _, h = assemble_local(x, force, i)
        out[2 * i : 2 * i + 2] += h @ v[2 * i : 2 * i + 2]
    for a, b, rest, k in SPRINGS:
        e = x[2 * a : 2 * a + 2] - x[2 * b : 2 * b + 2]
        length = max(float(np.linalg.norm(e)), LEN_FLOOR)
        alpha = 1.0 - rest / length
        scale = k * (rest / length**3)
        hs = k * alpha * np.eye(2) + scale * np.outer(e, e)
        va = v[2 * a : 2 * a + 2]
        vb = v[2 * b : 2 * b + 2]
        out[2 * a : 2 * a + 2] += -hs @ vb
        out[2 * b : 2 * b + 2] += -hs @ va
    return out


def ift_gradient(force: np.ndarray) -> float:
    x = REST.copy()
    one_sweep(x, force, None)
    rhs = seed_loss_adj(x)
    # Dense H for 200 DOF — IFT is a global solve on the residual, not the sweep.
    h = np.zeros((N * 2, N * 2))
    eye = np.eye(N * 2)
    for j in range(N * 2):
        h[:, j] = hessian_vec(x, force, eye[:, j])
    lam = np.linalg.solve(h + 1e-10 * eye, rhs)
    return float(lam[P_INDEX])


def fd_gradient(force: np.ndarray) -> float:
    fp = force.copy()
    fm = force.copy()
    fp[P_INDEX] += EPS_FD
    fm[P_INDEX] -= EPS_FD
    xp = REST.copy()
    xm = REST.copy()
    one_sweep(xp, fp, None)
    one_sweep(xm, fm, None)
    return (loss(xp) - loss(xm)) / (2.0 * EPS_FD)


def main() -> int:
    force = np.zeros(N * 2)
    fd = fd_gradient(force)
    tape = tape_gradient(force)
    sweep = sweep_adjoint_gradient(force)
    ift = ift_gradient(force)

    def vs_fd(value: float) -> float:
        denom = max(abs(fd), 1e-12)
        return abs(value - fd) / denom

    rows = [
        ("Central FD (gold)", fd, "O(1) evals, no adjoint", 0.0),
        ("Tape / unrolled AD", tape, "O(K·N) = O(N) at K=1", vs_fd(tape)),
        ("Standard IFT", ift, "O(N) global residual solve", vs_fd(ift)),
        ("Sweep-adjoint", sweep, "O(N) workspace, O(1) vs K", vs_fd(sweep)),
    ]

    print("K=1 verification  ·  10×10 VBD mass-spring  ·  ONE sweep")
    print("p = handle force_x    L = ½‖x_probe − rest‖²")
    print()
    print(f"{'method':<24} {'∂L/∂p':>14} {'vs FD':>10}  memory")
    print("-" * 72)
    for name, value, memory, err in rows:
        print(f"{name:<24} {value:14.8e} {err:10.2e}  {memory}")
    print()
    print("Caveats: local H regularized/invertible; reverse is red-black LIFO;")
    print("warm-start and contact are not in v1. IFT is the equation, not the solver.")

    tape_ok = abs(tape - fd) < PASS_ABS or vs_fd(tape) < 1e-5
    sweep_ok = abs(sweep - fd) < PASS_ABS or vs_fd(sweep) < 1e-5
    sweep_tape_ok = abs(sweep - tape) < PASS_ABS
    ift_wrong = vs_fd(ift) > IFT_MIN_REL
    passed = tape_ok and sweep_ok and sweep_tape_ok and ift_wrong

    print()
    if passed:
        print("PASS  sweep-adjoint matches tape/FD; IFT is wrong at K=1.")
        return 0
    print("FAIL  thesis did not hold on this fixture.")
    print(f"  tape_ok={tape_ok} sweep_ok={sweep_ok} sweep_tape_ok={sweep_tape_ok} ift_wrong={ift_wrong}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
