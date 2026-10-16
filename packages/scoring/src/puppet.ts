import { L, mid, pt, dist, type Landmarks, type Pt } from "./geom.ts";

/** Sprite metadata written by apps/tv/avatar/make_avatar.py (parts.json). */
export type PuppetMeta = {
  ppu: number; pad: number; shoulderW: number; lengths: Record<string, number>; head: number[]; shoe: number[];
  parts: Record<string, { w: number; h: number }>;
};
export type PartName = "head" | "neck" | "torso" | "upper_arm" | "forearm" | "hand" | "thigh" | "shin" | "shoe";
/** A sprite placement in landmark units: centre, size, clockwise rotation (radians, y down). */
export type Placement = { part: PartName; cx: number; cy: number; w: number; h: number; angle: number };

const VIS = 0.3;

/**
 * Cutout rig: maps 33 landmarks to body-part sprite placements, back-to-front.
 * Limb width follows overall body scale; length follows the bone, so foreshortened limbs shorten naturally.
 */
export function puppet(lm: Landmarks, meta: PuppetMeta): Placement[] {
  const P = (i: number) => pt(lm, i);
  const shoulders = mid(P(L.lShoulder), P(L.rShoulder)), hips = mid(P(L.lHip), P(L.rHip));
  const sw = dist(P(L.lShoulder), P(L.rShoulder)), torso = dist(shoulders, hips);
  const k = (sw / meta.shoulderW + torso / meta.lengths.torso) / 2; // landmark units per metre
  const out: Placement[] = [];
  const size = (part: PartName) => ({ w: meta.parts[part].w / meta.ppu, h: meta.parts[part].h / meta.ppu });

  function bone(part: PartName, a: Pt, b: Pt, wScale = k, minK = 0.35, maxK = 1.4) {
    if (a.v < VIS || b.v < VIS) return;
    const len = dist(a, b), s = size(part);
    const kl = Math.max(minK * k, Math.min(maxK * k, len / meta.lengths[part]));
    out.push({ part, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, w: s.w * wScale, h: s.h * kl, angle: Math.atan2(-(b.x - a.x), b.y - a.y) });
  }

  const ear = mid(P(7), P(8));
  const up = { x: ear.x - shoulders.x, y: ear.y - shoulders.y }, upLen = Math.hypot(up.x, up.y) || 1;
  const headC: Pt = { x: ear.x + (up.x / upLen) * 0.01 * k, y: ear.y + (up.y / upLen) * 0.01 * k, v: Math.min(P(7).v, P(8).v, P(0).v) };

  for (const [hip, knee, ankle, foot] of [[L.lHip, L.lKnee, L.lAnkle, 31], [L.rHip, L.rKnee, L.rAnkle, 32]]) {
    bone("thigh", P(hip), P(knee));
    bone("shin", P(knee), P(ankle));
    const a = P(ankle), f = P(foot), s = size("shoe");
    if (a.v >= VIS) out.push({ part: "shoe", cx: (a.x + f.x) / 2, cy: (a.y + f.y) / 2 + 0.01 * k, w: s.w * k, h: s.h * k, angle: 0 });
  }
  bone("neck", shoulders, headC, k, 0.5, 1.2);
  bone("torso", shoulders, hips, sw / meta.shoulderW, 0.5, 1.4);
  for (const [sh, el, wr, idx] of [[L.lShoulder, L.lElbow, L.lWrist, L.lIndex], [L.rShoulder, L.rElbow, L.rWrist, L.rIndex]]) {
    bone("upper_arm", P(sh), P(el));
    bone("forearm", P(el), P(wr));
    bone("hand", P(wr), P(idx), k * 0.85, 0.45, 1.0);
  }
  if (headC.v >= VIS) {
    const [a, b] = P(7).x < P(8).x ? [P(7), P(8)] : [P(8), P(7)];
    const s = size("head");
    out.push({ part: "head", cx: headC.x, cy: headC.y, w: s.w * k, h: s.h * k, angle: Math.max(-0.6, Math.min(0.6, Math.atan2(b.y - a.y, b.x - a.x))) });
  }
  return out;
}
