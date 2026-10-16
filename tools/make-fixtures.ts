// Regenerates the synthetic fixtures in fixtures/*.json. Usage: npm run fixtures
import { writeFileSync } from "node:fs";
import { render, repKeyframes, shotKeyframes, STAND, type Keyframe, type ShotStyle } from "../fixtures/synth.ts";

const dir = new URL("../fixtures/", import.meta.url);
const save = (name: string, expected: object, kf: Keyframe[], opts: { seed: number; scale?: number }) =>
  writeFileSync(new URL(name, dir), JSON.stringify({ meta: { source: "synthetic", fps: 30, expected }, frames: render(kf, opts) }));

const shots = (style: ShotStyle, n: number) => Array.from({ length: n }, (_, i) => shotKeyframes(style, i * 3200)).flat();
save("freethrow_good_1.json", { shots: 3, minScore: 75 }, shots("good", 3), { seed: 1 });
save("freethrow_good_2.json", { shots: 3, minScore: 75 }, shots("good", 3), { seed: 2, scale: 0.75 }); // kid-sized body
save("freethrow_flared_elbow.json", { shots: 3, tip: "elbow_in" }, shots("flared", 3), { seed: 3 });
save("freethrow_no_knees.json", { shots: 3, tip: "bend_knees" }, shots("no_knees", 3), { seed: 4 });

function reps(ex: Parameters<typeof repKeyframes>[0] | "high_knees", pattern: boolean[], dur: number): Keyframe[] {
  return pattern.flatMap((good, i) => {
    const e = ex === "high_knees" ? (i % 2 ? "high_knees_l" : "high_knees_r") : ex;
    return repKeyframes(e, good, 500 + i * dur, dur);
  });
}
const mix = (n: number, everyPartial: number) => Array.from({ length: n }, (_, i) => i % everyPartial !== everyPartial - 1);
save("squat_10.json", { exercise: "squat", reps: 10, good: 7 }, reps("squat", mix(10, 3), 1600), { seed: 5 });
save("jumping_jack_12.json", { exercise: "jumping_jack", reps: 12, good: 8 }, reps("jumping_jack", mix(12, 3), 1100), { seed: 6, scale: 0.8 });
save("high_knees_20.json", { exercise: "high_knees", reps: 20, good: 15 }, reps("high_knees", mix(20, 4), 600), { seed: 7 });
save("idle_standing.json", { reps: 0, shots: 0 }, [[0, STAND], [10000, STAND]], { seed: 8 });
console.log("fixtures written");
