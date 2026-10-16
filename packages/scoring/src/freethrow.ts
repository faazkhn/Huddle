import type { ShotEvent, TipKey } from "@huddle/protocol";
import { angle, dist, L, lin, pt, type Landmarks } from "./geom.ts";

export type Hand = "right" | "left";
type Phase = "IDLE" | "SET" | "FOLLOW_THROUGH";

const COOLDOWN_MS = 800;
const STALL_MS = 2000;
const MAX_HOLD_MS = 1000;

/**
 * Free-throw shot detector + form scorer (PRD 7.3).
 * IDLE -> SET -> (RELEASE) -> FOLLOW_THROUGH -> IDLE. RELEASE is the instant transition between SET and FOLLOW_THROUGH.
 */
export function createShotDetector(hand: Hand = "right") {
  const s = hand === "right"
    ? { sh: L.rShoulder, el: L.rElbow, wr: L.rWrist, idx: L.rIndex, hip: L.rHip, kn: L.rKnee, an: L.rAnkle, osh: L.lShoulder }
    : { sh: L.lShoulder, el: L.lElbow, wr: L.lWrist, idx: L.lIndex, hip: L.lHip, kn: L.lKnee, an: L.lAnkle, osh: L.rShoulder };

  let phase: Phase = "IDLE";
  let phaseStart = 0, cooldownUntil = 0;
  let setElbow = 90, setFlare = 0, minKnee = 180, maxElbow = 0, holdStart = 0, goosenecked = false;

  return function update(lm: Landmarks, t: number): ShotEvent | null {
    const sh = pt(lm, s.sh), el = pt(lm, s.el), wr = pt(lm, s.wr), nose = pt(lm, L.nose);
    const elbowAng = angle(sh, el, wr);
    const kneeAng = angle(pt(lm, s.hip), pt(lm, s.kn), pt(lm, s.an));
    const shoulderW = Math.max(1e-3, dist(sh, pt(lm, s.osh)));

    const inSet = wr.y > nose.y && wr.y < sh.y && elbowAng >= 60 && elbowAng <= 120;
    const released = wr.y < nose.y && elbowAng > 150;

    if (phase === "IDLE") {
      if (t < cooldownUntil || !inSet) return null;
      phase = "SET"; phaseStart = t; minKnee = kneeAng; maxElbow = 0; goosenecked = false; setElbow = 180;
    }
    if (phase === "SET") {
      minKnee = Math.min(minKnee, kneeAng);
      // The set point is the most-bent elbow frame while in the set zone.
      if (inSet && elbowAng < setElbow) { setElbow = elbowAng; setFlare = Math.abs(el.x - sh.x) / shoulderW; }
      if (released) { phase = "FOLLOW_THROUGH"; holdStart = t; maxElbow = elbowAng; return null; }
      if (t - phaseStart > STALL_MS) phase = "IDLE";
      return null;
    }
    // FOLLOW_THROUGH: arm stays extended; ends when it drops or after MAX_HOLD_MS.
    maxElbow = Math.max(maxElbow, elbowAng);
    // shortcut: "gooseneck" = index fingertip below wrist (pose model has no knuckle), upgrade with hand landmarker if needed.
    if (pt(lm, s.idx).y > wr.y) goosenecked = true;
    const held = t - holdStart;
    if (released && held < MAX_HOLD_MS) return null;

    phase = "IDLE"; cooldownUntil = t + COOLDOWN_MS;
    const components: Record<TipKey, number> = {
      set_angle: 20 * lin(Math.abs(setElbow - 90), 0, 45),
      elbow_in: 20 * lin(setFlare, 0.15, 0.6),
      bend_knees: 20 * (minKnee > 150 ? lin(minKnee, 150, 175) : minKnee < 120 ? lin(minKnee, 120, 90) : 1),
      extend_arm: 20 * lin(maxElbow, 165, 140),
      hold_follow: 15 * lin(held, 500, 0) + (goosenecked ? 5 : 0),
    };
    const tip = (Object.keys(components) as TipKey[]).reduce((a, b) => (components[b] < components[a] ? b : a));
    const score = Math.round(Object.values(components).reduce((a, b) => a + b, 0));
    for (const k in components) components[k as TipKey] = Math.round(components[k as TipKey] * 10) / 10;
    return { kind: "shot", score, tip, components };
  };
}
