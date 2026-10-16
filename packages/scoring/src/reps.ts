import type { Exercise, RepEvent } from "@huddle/protocol";
import { angle, dist, L, mid, pt, torsoLen, type Landmarks } from "./geom.ts";

type Counter = (lm: Landmarks) => RepEvent | null;
const rep = (exercise: Exercise, good: boolean): RepEvent => ({ kind: "rep", exercise, quality: good ? "good" : "partial" });

/** Squat: mean knee angle < 110 (down) then > 160 (up). Good if hip dropped to within 0.1 torso of knee height. */
function squat(): Counter {
  let down = false, good = false;
  return (lm) => {
    const knee = (angle(pt(lm, L.lHip), pt(lm, L.lKnee), pt(lm, L.lAnkle)) + angle(pt(lm, L.rHip), pt(lm, L.rKnee), pt(lm, L.rAnkle))) / 2;
    const hipY = mid(pt(lm, L.lHip), pt(lm, L.rHip)).y, kneeY = mid(pt(lm, L.lKnee), pt(lm, L.rKnee)).y;
    if (!down && knee < 110) { down = true; good = false; }
    if (down && (kneeY - hipY) / torsoLen(lm) <= 0.1) good = true;
    if (down && knee > 160) { down = false; return rep("squat", good); }
    return null;
  };
}

/** Jumping jack: open (wrists above shoulders, ankles > 1.2x shoulder width) then closed (wrists below shoulders, ankles < 0.9x). Good if both wrists went above the nose. */
function jumpingJack(): Counter {
  let open = false, good = false;
  return (lm) => {
    const ls = pt(lm, L.lShoulder), rs = pt(lm, L.rShoulder), lw = pt(lm, L.lWrist), rw = pt(lm, L.rWrist);
    const sw = Math.max(1e-3, dist(ls, rs)), spread = Math.abs(pt(lm, L.lAnkle).x - pt(lm, L.rAnkle).x) / sw;
    const shY = Math.min(ls.y, rs.y), nose = pt(lm, L.nose);
    if (!open && lw.y < shY && rw.y < shY && spread > 1.2) { open = true; good = false; }
    if (open && lw.y < nose.y && rw.y < nose.y) good = true;
    if (open && lw.y > Math.max(ls.y, rs.y) && rw.y > Math.max(ls.y, rs.y) && spread < 0.9) { open = false; return rep("jumping_jack", good); }
    return null;
  };
}

/** High knees: each knee lift counts. Lifted when knee is within 0.3 torso below hip; reset when back below 0.6. Good if it reaches within 0.1 torso of hip height. */
function highKnees(): Counter {
  const st = { l: { up: false, good: false }, r: { up: false, good: false } };
  return (lm) => {
    const t = Math.max(1e-3, torsoLen(lm));
    for (const [side, hip, knee] of [["l", L.lHip, L.lKnee], ["r", L.rHip, L.rKnee]] as const) {
      const below = (pt(lm, knee).y - pt(lm, hip).y) / t; // how far the knee is below the hip, in torso lengths
      const s = st[side];
      if (!s.up && below < 0.3) { s.up = true; s.good = false; }
      if (s.up && below <= 0.1) s.good = true;
      if (s.up && below > 0.6) { s.up = false; return rep("high_knees", s.good); }
    }
    return null;
  };
}

export const createRepCounter = (exercise: Exercise): Counter =>
  ({ squat, jumping_jack: jumpingJack, high_knees: highKnees })[exercise]();

/** Boot Camp score (PRD 5.3). */
export const repPoints = (q: RepEvent["quality"]) => (q === "good" ? 10 : 4);
