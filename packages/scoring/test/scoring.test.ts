import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Exercise, RepEvent, ShotEvent } from "@huddle/protocol";
import { createRepCounter, createShotDetector, makeSmoother, rank, angle, fullBodyVisible } from "../src/index.ts";

type Fixture = { meta: { expected: Record<string, number | string> }; frames: { t: number; lm: number[] }[] };
const load = (n: string): Fixture => JSON.parse(readFileSync(new URL(`../../../fixtures/${n}`, import.meta.url), "utf8"));

function shots(name: string): ShotEvent[] {
  const det = createShotDetector("right"), smooth = makeSmoother(0.5);
  return load(name).frames.map((f) => det(smooth(f.lm), f.t)).filter((e): e is ShotEvent => !!e);
}
function reps(name: string, ex: Exercise): RepEvent[] {
  const c = createRepCounter(ex), smooth = makeSmoother(0.5);
  return load(name).frames.map((f) => c(smooth(f.lm))).filter((e): e is RepEvent => !!e);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("geometry", () => {
  it("measures angles", () => {
    expect(angle({ x: 1, y: 0, v: 1 }, { x: 0, y: 0, v: 1 }, { x: 0, y: 1, v: 1 })).toBeCloseTo(90);
    expect(angle({ x: -1, y: 0, v: 1 }, { x: 0, y: 0, v: 1 }, { x: 1, y: 0, v: 1 })).toBeCloseTo(180);
  });
  it("calibration needs full body visibility", () => {
    const lm = load("idle_standing.json").frames[0].lm;
    expect(fullBodyVisible(lm)).toBe(true);
    const hidden = lm.slice(); hidden[27 * 3 + 2] = 0.2; // left ankle out of frame
    expect(fullBodyVisible(hidden)).toBe(false);
  });
});

describe("free throw", () => {
  const good = [...shots("freethrow_good_1.json"), ...shots("freethrow_good_2.json")];
  it("detects every good shot and scores it >= 75 (adult and kid-sized bodies)", () => {
    expect(good).toHaveLength(6);
    for (const s of good) expect(s.score).toBeGreaterThanOrEqual(75);
  });
  it.each([["freethrow_flared_elbow.json", "elbow_in"], ["freethrow_no_knees.json", "bend_knees"]])(
    "%s scores >= 15 lower and tips %s", (file, tip) => {
      const bad = shots(file);
      expect(bad).toHaveLength(3);
      expect(mean(good.map((s) => s.score)) - mean(bad.map((s) => s.score))).toBeGreaterThanOrEqual(15);
      for (const s of bad) expect(s.tip).toBe(tip);
    });
  it("counts no shots while standing idle", () => expect(shots("idle_standing.json")).toHaveLength(0));
  it("scores a left-handed shot with the left-hand detector", () => {
    // Mirror the right-handed fixture: swap left/right landmarks and flip x.
    const pairs = [[11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
    const det = createShotDetector("left"), smooth = makeSmoother(0.5);
    const out = load("freethrow_good_1.json").frames.map((f) => {
      const m = f.lm.slice();
      for (const [a, b] of pairs) for (let k = 0; k < 3; k++) [m[a * 3 + k], m[b * 3 + k]] = [f.lm[b * 3 + k], f.lm[a * 3 + k]];
      for (let i = 0; i < 33; i++) m[i * 3] = 1 - m[i * 3];
      return det(smooth(m), f.t);
    }).filter(Boolean);
    expect(out).toHaveLength(3);
  });
});

describe("boot camp rep counters", () => {
  it.each([
    ["squat_10.json", "squat"], ["jumping_jack_12.json", "jumping_jack"], ["high_knees_20.json", "high_knees"],
  ] as const)("%s: >= 90% count accuracy and correct quality", (file, ex) => {
    const { reps: want, good } = load(file).meta.expected as { reps: number; good: number };
    const got = reps(file, ex);
    expect(Math.abs(got.length - want) / want).toBeLessThanOrEqual(0.1);
    expect(got.filter((r) => r.quality === "good").length).toBe(good);
  });
  it.each(["squat", "jumping_jack", "high_knees"] as const)("counts zero %s reps while idle", (ex) =>
    expect(reps("idle_standing.json", ex)).toHaveLength(0));
});

describe("rank", () => {
  it("ties share rank", () => {
    expect(rank([{ score: 5 }, { score: 9 }, { score: 9 }, { score: 1 }]).map((p) => p.rank)).toEqual([1, 1, 3, 4]);
  });
});
