// src/utils/math.ts — FIX 2.5: canonical math utilities
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerpAngle(a: number, b: number, t: number): number {
  // Shortest-path angular interpolation
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}