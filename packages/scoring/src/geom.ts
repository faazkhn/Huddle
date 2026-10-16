/** Flat landmark array: [x, y, visibility] * 33, y pointing down. x should be aspect-corrected (x * w/h) before scoring. */
export type Landmarks = number[];

export const L = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lIndex: 19, rIndex: 20, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
} as const;

export type Pt = { x: number; y: number; v: number };
export const pt = (lm: Landmarks, i: number): Pt => ({ x: lm[i * 3], y: lm[i * 3 + 1], v: lm[i * 3 + 2] });
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

/** Angle at b (degrees) formed by a-b-c. */
export function angle(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (d === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))) * 180) / Math.PI;
}

export const torsoLen = (lm: Landmarks) =>
  dist(mid(pt(lm, L.lShoulder), pt(lm, L.rShoulder)), mid(pt(lm, L.lHip), pt(lm, L.rHip)));

/** Linear score: 1 at `ideal`, 0 at `fail`, clamped. */
export const lin = (value: number, ideal: number, fail: number) =>
  Math.max(0, Math.min(1, (value - fail) / (ideal - fail)));

/** Exponential moving average smoother for landmark frames (P5). */
export function makeSmoother(alpha = 0.5) {
  let prev: Landmarks | null = null;
  return (lm: Landmarks): Landmarks => {
    prev = prev ? lm.map((v, i) => alpha * v + (1 - alpha) * prev![i]) : lm.slice();
    return prev;
  };
}

/** Calibration (P3): shoulders, hips, knees, ankles, wrists all visible > 0.6. */
const CALIB = [L.lShoulder, L.rShoulder, L.lHip, L.rHip, L.lKnee, L.rKnee, L.lAnkle, L.rAnkle, L.lWrist, L.rWrist];
export const fullBodyVisible = (lm: Landmarks) => CALIB.every((i) => lm[i * 3 + 2] > 0.6);

/** Skeleton segments for drawing avatars (phone overlay + TV). */
export const BONES: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28],
];
