export const EPS = 1e-12;

export function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function solve2(
  h00: number,
  h01: number,
  h10: number,
  h11: number,
  bx: number,
  by: number,
): [number, number] {
  let a00 = h00;
  let a01 = h01;
  let a10 = h10;
  let a11 = h11;
  let det = a00 * a11 - a01 * a10;
  if (Math.abs(det) < 1e-14) {
    a00 += 1e-8;
    a11 += 1e-8;
    det = a00 * a11 - a01 * a10;
  }
  const inv = 1 / det;
  return [(a11 * bx - a01 * by) * inv, (-a10 * bx + a00 * by) * inv];
}

export function relError(a: Float64Array, b: Float64Array): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    num += d * d;
    den += b[i] * b[i];
  }
  if (den < EPS) {
    return num < EPS ? 0 : Infinity;
  }
  return Math.sqrt(num / den);
}

export function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

export function copyF64(src: Float64Array): Float64Array {
  return Float64Array.from(src);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatPct(frac: number): string {
  if (!Number.isFinite(frac)) return "∞";
  return `${(frac * 100).toFixed(1)}%`;
}
