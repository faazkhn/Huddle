/**
 * Synthetic pose generator: keyframed 2D skeletons (front view, y down) -> MediaPipe-style 33-landmark frames.
 * Used to generate test fixtures and to drive the demo "bot" players. Real recordings come from the phone's ?record=1 mode.
 */
export type Joint = "nose" | "rSh" | "lSh" | "rEl" | "lEl" | "rWr" | "lWr" | "rIdx" | "lIdx" | "rHip" | "lHip" | "rKnee" | "lKnee" | "rAnk" | "lAnk";
export type Pose = Record<Joint, [number, number]>;
export type Frame = { t: number; lm: number[] };
export type Keyframe = [ms: number, pose: Pose];

// Body-centred coordinates: origin at mid-hip. Person faces the camera, so their right side has smaller x.
export const STAND: Pose = {
  nose: [0, -0.33],
  rSh: [-0.09, -0.25], lSh: [0.09, -0.25],
  rEl: [-0.11, -0.12], lEl: [0.11, -0.12],
  rWr: [-0.12, 0], lWr: [0.12, 0],
  rIdx: [-0.12, 0.04], lIdx: [0.12, 0.04],
  rHip: [-0.06, 0], lHip: [0.06, 0],
  rKnee: [-0.06, 0.19], lKnee: [0.06, 0.19],
  rAnk: [-0.06, 0.38], lAnk: [0.06, 0.38],
};

const UPPER: Joint[] = ["nose", "rSh", "lSh", "rEl", "lEl", "rWr", "lWr", "rIdx", "lIdx", "rHip", "lHip"];

/** Copy of `base` with overrides, and the upper body + hips shifted down by `drop`. */
export function pose(over: Partial<Pose>, drop = 0, base: Pose = STAND): Pose {
  const p = { ...base } as Pose;
  if (drop) for (const j of UPPER) p[j] = [p[j][0], p[j][1] + drop];
  return { ...p, ...over };
}

// --- Free throw (right hand) ---
const dipLegs = { rKnee: [-0.12, 0.2], lKnee: [0.12, 0.2] } as Partial<Pose>;
export const FT = {
  setGood: pose({ ...dipLegs, rHip: [-0.06, 0.06], lHip: [0.06, 0.06], rEl: [-0.12, -0.17], rWr: [-0.16, -0.23], rIdx: [-0.16, -0.27], nose: [0, -0.27], rSh: [-0.09, -0.19], lSh: [0.09, -0.19] }, 0.06),
  setFlared: pose({ ...dipLegs, rHip: [-0.06, 0.06], lHip: [0.06, 0.06], rEl: [-0.2, -0.18], rWr: [-0.19, -0.255], rIdx: [-0.19, -0.29], nose: [0, -0.27], rSh: [-0.09, -0.19], lSh: [0.09, -0.19] }, 0.06),
  setNoKnees: pose({ rEl: [-0.12, -0.23], rWr: [-0.16, -0.29], rIdx: [-0.16, -0.33] }),
  release: pose({ rEl: [-0.1, -0.37], rWr: [-0.11, -0.49], rIdx: [-0.12, -0.46] }),
};

export type ShotStyle = "good" | "flared" | "no_knees" | "short_follow";
export function shotKeyframes(style: ShotStyle, t0 = 0): Keyframe[] {
  const set = style === "flared" ? FT.setFlared : style === "no_knees" ? FT.setNoKnees : FT.setGood;
  const hold = style === "short_follow" ? 150 : 700;
  return [
    [t0, STAND], [t0 + 300, STAND], [t0 + 700, set], [t0 + 1000, set],
    [t0 + 1200, FT.release], [t0 + 1200 + hold, FT.release], [t0 + 1600 + hold, STAND], [t0 + 2000 + hold, STAND],
  ];
}

// --- Boot camp ---
export const SQUAT = {
  deep: pose({ rHip: [-0.07, 0.18], lHip: [0.07, 0.18], rKnee: [-0.15, 0.2], lKnee: [0.15, 0.2], rWr: [-0.06, -0.1], lWr: [0.06, -0.1], rEl: [-0.14, -0.02], lEl: [0.14, -0.02] }, 0.18),
  partial: pose({ rHip: [-0.07, 0.13], lHip: [0.07, 0.13], rKnee: [-0.15, 0.21], lKnee: [0.15, 0.21], rWr: [-0.06, -0.15], lWr: [0.06, -0.15], rEl: [-0.14, -0.07], lEl: [0.14, -0.07] }, 0.13),
};
export const JACK = {
  open: pose({ rEl: [-0.2, -0.38], lEl: [0.2, -0.38], rWr: [-0.12, -0.5], lWr: [0.12, -0.5], rIdx: [-0.11, -0.54], lIdx: [0.11, -0.54], rKnee: [-0.13, 0.19], lKnee: [0.13, 0.19], rAnk: [-0.2, 0.38], lAnk: [0.2, 0.38] }),
  half: pose({ rEl: [-0.22, -0.22], lEl: [0.22, -0.22], rWr: [-0.3, -0.3], lWr: [0.3, -0.3], rIdx: [-0.32, -0.33], lIdx: [0.32, -0.33], rKnee: [-0.13, 0.19], lKnee: [0.13, 0.19], rAnk: [-0.2, 0.38], lAnk: [0.2, 0.38] }),
};
export const KNEE = {
  rHigh: pose({ rKnee: [-0.07, 0.01], rAnk: [-0.08, 0.2], lWr: [0.1, -0.12], rWr: [-0.14, 0.04] }),
  lHigh: pose({ lKnee: [0.07, 0.01], lAnk: [0.08, 0.2], rWr: [-0.1, -0.12], lWr: [0.14, 0.04] }),
  rLow: pose({ rKnee: [-0.07, 0.06], rAnk: [-0.08, 0.25] }),
  lLow: pose({ lKnee: [0.07, 0.06], lAnk: [0.08, 0.25] }),
};

/** One rep of an exercise, `dur` ms long, starting at t0. */
export function repKeyframes(ex: "squat" | "jumping_jack" | "high_knees_r" | "high_knees_l", good: boolean, t0: number, dur: number): Keyframe[] {
  const peak = ex === "squat" ? (good ? SQUAT.deep : SQUAT.partial)
    : ex === "jumping_jack" ? (good ? JACK.open : JACK.half)
    : ex === "high_knees_r" ? (good ? KNEE.rHigh : KNEE.rLow) : (good ? KNEE.lHigh : KNEE.lLow);
  return [[t0, STAND], [t0 + dur * 0.45, peak], [t0 + dur * 0.55, peak], [t0 + dur, STAND]];
}

// --- Rendering keyframes to landmark frames ---
function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const s = k * k * (3 - 2 * k); // smoothstep
  const out = {} as Pose;
  for (const j in a) out[j as Joint] = [a[j as Joint][0] + (b[j as Joint][0] - a[j as Joint][0]) * s, a[j as Joint][1] + (b[j as Joint][1] - a[j as Joint][1]) * s];
  return out;
}

export function poseAt(kf: Keyframe[], t: number): Pose {
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i][0]) {
      const [ta, pa] = kf[i - 1], [tb, pb] = kf[i];
      return lerpPose(pa, pb, tb === ta ? 1 : (t - ta) / (tb - ta));
    }
  }
  return kf[kf.length - 1][1];
}

export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** MediaPipe index -> [joint, dx, dy] (minor points are offset from a major joint). */
const MAP: [Joint, number, number][] = [
  ["nose", 0, 0], ["nose", 0.012, -0.012], ["nose", 0.02, -0.012], ["nose", 0.028, -0.012], ["nose", -0.012, -0.012], ["nose", -0.02, -0.012], ["nose", -0.028, -0.012],
  ["nose", 0.045, 0], ["nose", -0.045, 0], ["nose", 0.012, 0.025], ["nose", -0.012, 0.025],
  ["lSh", 0, 0], ["rSh", 0, 0], ["lEl", 0, 0], ["rEl", 0, 0], ["lWr", 0, 0], ["rWr", 0, 0],
  ["lIdx", 0.01, 0], ["rIdx", -0.01, 0], ["lIdx", 0, 0], ["rIdx", 0, 0], ["lWr", -0.015, -0.01], ["rWr", 0.015, -0.01],
  ["lHip", 0, 0], ["rHip", 0, 0], ["lKnee", 0, 0], ["rKnee", 0, 0], ["lAnk", 0, 0], ["rAnk", 0, 0],
  ["lAnk", -0.012, 0.015], ["rAnk", 0.012, 0.015], ["lAnk", 0.03, 0.02], ["rAnk", -0.03, 0.02],
];

/** Pose (body coords) -> flat [x,y,vis]*33 in image coords, with gaussian-ish noise. */
export function toLandmarks(p: Pose, rnd: () => number, opts: { cx?: number; cy?: number; scale?: number; noise?: number } = {}): number[] {
  const { cx = 0.5, cy = 0.55, scale = 1, noise = 0.004 } = opts;
  const n = () => (rnd() + rnd() + rnd() - 1.5) * noise * 2;
  const out: number[] = [];
  for (const [j, dx, dy] of MAP) {
    out.push(+(cx + (p[j][0] + dx) * scale + n()).toFixed(3), +(cy + (p[j][1] + dy) * scale + n()).toFixed(3), +(0.9 + rnd() * 0.09).toFixed(3));
  }
  return out;
}

export function render(kf: Keyframe[], opts: { fps?: number; seed?: number; noise?: number; scale?: number } = {}): Frame[] {
  const { fps = 30, seed = 1 } = opts;
  const rnd = mulberry32(seed);
  const end = kf[kf.length - 1][0];
  const frames: Frame[] = [];
  for (let t = 0; t <= end; t += 1000 / fps) frames.push({ t: Math.round(t), lm: toLandmarks(poseAt(kf, t), rnd, opts) });
  return frames;
}

// --- Simulated player (demo bots and the phone's ?sim=1 mode) ---
const WAVE: Keyframe[] = [[0, STAND], [400, pose({ rEl: [-0.2, -0.3], rWr: [-0.24, -0.45], rIdx: [-0.24, -0.49] })], [700, pose({ rEl: [-0.2, -0.3], rWr: [-0.14, -0.45], rIdx: [-0.14, -0.49] })], [1000, pose({ rEl: [-0.2, -0.3], rWr: [-0.24, -0.45], rIdx: [-0.24, -0.49] })], [1400, STAND], [4000, STAND]];
const SHOT_STYLES: ShotStyle[] = ["flared", "no_knees", "short_follow"];

/**
 * Returns (game, nowMs) -> Pose for a simulated player. `skill` 0..1 is the chance a shot/rep uses good form.
 * Motion restarts whenever the game state/mode/exercise changes.
 */
export function simPlayer(skill: number, seed: number) {
  let key = "", start = 0;
  const pick = (i: number) => mulberry32(seed * 7919 + i)();
  return (game: { state: string; mode: string | null; exercise?: string }, now: number): Pose => {
    const k = `${game.state}|${game.mode}|${game.exercise}`;
    if (k !== key) { key = k; start = now; }
    const t = now - start;
    if (game.state !== "ROUND") return poseAt(WAVE, (t + seed * 900) % 4000);
    if (game.mode === "free_throw") {
      const period = 3400 + Math.round(pick(0) * 600), i = Math.floor(t / period);
      const style = pick(i + 1) < skill ? "good" : SHOT_STYLES[Math.floor(pick(i + 101) * 3)];
      return poseAt(shotKeyframes(style), t % period);
    }
    const ex = game.exercise === "jumping_jack" ? "jumping_jack" : game.exercise === "high_knees" ? "high_knees" : "squat";
    const dur = (ex === "squat" ? 1500 : ex === "jumping_jack" ? 1000 : 520) * (1.25 - skill * 0.35);
    const i = Math.floor(t / dur);
    const e = ex === "high_knees" ? (i % 2 ? "high_knees_l" : "high_knees_r") : ex;
    return poseAt(repKeyframes(e, pick(i + 1) < skill, 0, dur), t % dur);
  };
}
