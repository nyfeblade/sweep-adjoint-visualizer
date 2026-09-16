import { assertRunnable } from "./errors";
import type { ClothParams, ClothState, Spring } from "./types";

export const DEFAULT_GRID = 20;

export const DEFAULT_PARAMS: ClothParams = {
  spacing: 1,
  springK: 90,
  shearK: 22,
  pinK: 2400,
  handleK: 320,
  gravityY: -0.35,
  regularizer: 4e-3,
};

export function vertexIndex(col: number, row: number, nx: number): number {
  return row * nx + col;
}

export function vertexColor(index: number, nx: number): 0 | 1 {
  const col = index % nx;
  const row = Math.floor(index / nx);
  return ((col + row) & 1) as 0 | 1;
}

export function colorOrder(n: number, nx: number, color: 0 | 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (vertexColor(i, nx) === color) out.push(i);
  }
  return out;
}

export function createCloth(
  nx = DEFAULT_GRID,
  ny = DEFAULT_GRID,
  params: ClothParams = DEFAULT_PARAMS,
): ClothState {
  const n = nx * ny;
  const x = new Float64Array(n * 2);
  const rest = new Float64Array(n * 2);
  const force = new Float64Array(n * 2);
  const pinned = new Uint8Array(n);
  const springs: Spring[] = [];

  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const i = vertexIndex(col, row, nx);
      const px = col * params.spacing;
      const py = row * params.spacing;
      rest[2 * i] = px;
      rest[2 * i + 1] = py;
      x[2 * i] = px;
      x[2 * i + 1] = py;
      if (row === ny - 1) pinned[i] = 1;
    }
  }

  const addSpring = (i: number, j: number, k: number) => {
    const dx = rest[2 * i] - rest[2 * j];
    const dy = rest[2 * i + 1] - rest[2 * j + 1];
    springs.push({ i, j, rest: Math.hypot(dx, dy), k });
  };

  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const i = vertexIndex(col, row, nx);
      if (col + 1 < nx) addSpring(i, vertexIndex(col + 1, row, nx), params.springK);
      if (row + 1 < ny) addSpring(i, vertexIndex(col, row + 1, nx), params.springK);
      if (col + 1 < nx && row + 1 < ny) {
        addSpring(i, vertexIndex(col + 1, row + 1, nx), params.shearK);
      }
      if (col + 1 < nx && row > 0) {
        addSpring(i, vertexIndex(col + 1, row - 1, nx), params.shearK);
      }
    }
  }

  const handle = n === 0 ? -1 : vertexIndex(Math.min(4, Math.max(0, nx - 1)), 1, nx);
  const probe = n === 0 ? -1 : vertexIndex(Math.min(6, Math.max(0, nx - 1)), 1, nx);

  const targetX = n === 0 ? 0 : rest[2 * handle] + 2.4;
  const targetY = n === 0 ? 0 : rest[2 * handle + 1] - 3.1;

  return {
    nx,
    ny,
    n,
    x,
    rest,
    force,
    pinned,
    handle,
    probe,
    targetX,
    targetY,
    springs,
    params,
  };
}

export function createEmptyMesh(): ClothState {
  return {
    nx: 0,
    ny: 0,
    n: 0,
    x: new Float64Array(0),
    rest: new Float64Array(0),
    force: new Float64Array(0),
    pinned: new Uint8Array(0),
    handle: -1,
    probe: -1,
    targetX: 0,
    targetY: 0,
    springs: [],
    params: DEFAULT_PARAMS,
  };
}

export function cloneCloth(src: ClothState): ClothState {
  return {
    nx: src.nx,
    ny: src.ny,
    n: src.n,
    x: Float64Array.from(src.x),
    rest: Float64Array.from(src.rest),
    force: Float64Array.from(src.force),
    pinned: Uint8Array.from(src.pinned),
    handle: src.handle,
    probe: src.probe,
    targetX: src.targetX,
    targetY: src.targetY,
    springs: src.springs.map((s) => ({ ...s })),
    params: { ...src.params },
  };
}

export function resetToRest(state: ClothState): void {
  state.x.set(state.rest);
}

export function requireMesh(state: ClothState, sweeps: number): void {
  assertRunnable(state.n, sweeps);
}

export function setDraggedNode(state: ClothState, index: number, targetX: number, targetY: number): void {
  if (index < 0 || index >= state.n || state.pinned[index]) return;
  state.handle = index;
  state.targetX = targetX;
  state.targetY = targetY;
  const col = index % state.nx;
  const row = Math.floor(index / state.nx);
  const probeCol = col + 2 < state.nx ? col + 2 : Math.max(0, col - 2);
  state.probe = vertexIndex(probeCol, row, state.nx);
  if (state.probe === state.handle) {
    state.probe = vertexIndex(col, Math.max(0, row - 1), state.nx);
  }
}

export function pickFreeNode(
  state: ClothState,
  worldX: number,
  worldY: number,
  radius: number,
): number {
  let best = -1;
  let bestD = radius * radius;
  for (let i = 0; i < state.n; i++) {
    if (state.pinned[i]) continue;
    const dx = state.x[2 * i] - worldX;
    const dy = state.x[2 * i + 1] - worldY;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
