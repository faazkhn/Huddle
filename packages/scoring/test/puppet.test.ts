import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { puppet, type PuppetMeta } from "../src/index.ts";

const meta: PuppetMeta = JSON.parse(readFileSync(new URL("../../../apps/tv/src/assets/avatar/parts.json", import.meta.url), "utf8"));
const idle = JSON.parse(readFileSync(new URL("../../../fixtures/idle_standing.json", import.meta.url), "utf8")).frames[0].lm as number[];

describe("cutout puppet rig", () => {
  it("places every body part, back to front, head last", () => {
    const parts = puppet(idle, meta).map((p) => p.part);
    expect(parts).toHaveLength(15); // 2 legs x 3 + neck + torso + 2 arms x 3 + head
    expect(parts[0]).toBe("thigh");
    expect(parts.at(-1)).toBe("head");
  });
  it("centres the torso between shoulders and hips and keeps a standing torso upright", () => {
    const t = puppet(idle, meta).find((p) => p.part === "torso")!;
    const shY = (idle[11 * 3 + 1] + idle[12 * 3 + 1]) / 2, hipY = (idle[23 * 3 + 1] + idle[24 * 3 + 1]) / 2;
    expect(t.cy).toBeCloseTo((shY + hipY) / 2, 2);
    expect(Math.abs(t.angle)).toBeLessThan(0.1);
  });
  it("rotates a raised arm to point up (angle ~ pi)", () => {
    const lm = idle.slice();
    lm[13 * 3 + 1] = lm[11 * 3 + 1] - 0.13; lm[13 * 3] = lm[11 * 3]; // left elbow straight above the left shoulder
    const ua = puppet(lm, meta).filter((p) => p.part === "upper_arm")[0];
    expect(Math.abs(Math.abs(ua.angle) - Math.PI)).toBeLessThan(0.1);
  });
  it("skips parts whose joints are not visible", () => {
    const lm = idle.slice();
    for (const i of [25, 26, 27, 28]) lm[i * 3 + 2] = 0; // knees + ankles out of frame
    const parts = puppet(lm, meta).map((p) => p.part);
    expect(parts).not.toContain("shin");
    expect(parts).not.toContain("shoe");
  });
});
