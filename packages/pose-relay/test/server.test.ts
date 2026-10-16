import { describe, expect, it } from "vitest";
import { createPoseRelay } from "../src/server.ts";

const json = (raw: string) => { try { const m = JSON.parse(raw); return m && typeof m.type === "string" ? m : null; } catch { return null; } };

function setup() {
  const relay = createPoseRelay({ baseUrl: "https://x.test", parseScreen: json, parsePhone: json, broadcastTypes: ["state"], log: () => {} });
  const client = () => {
    const sent: any[] = [];
    const c = { sent, send: (d: string) => sent.push(JSON.parse(d)), close: () => h.close() };
    const h = relay.connect(c);
    return Object.assign(c, { say: (o: object) => h.message(JSON.stringify(o)), last: (t: string) => sent.filter((m) => m.type === t).at(-1) });
  };
  return { relay, client };
}

describe("pose-relay (generic JSON protocol)", () => {
  it("pairs a screen with phones, forwards poses tagged by player, broadcasts state", () => {
    const { client } = setup();
    const screen = client(); screen.say({ type: "tv_hello" });
    const { code, joinUrl } = screen.last("room_created");
    expect(joinUrl).toBe(`https://x.test/r/${code}`);
    const phone = client(); phone.say({ type: "join", code, name: "Ana" });
    const { playerId } = phone.last("joined");
    expect(screen.last("player_joined")).toMatchObject({ playerId, name: "Ana", slot: 0 });
    phone.say({ type: "pose", t: 1, lm: [0.5, 0.5, 1] });
    expect(screen.last("pose")).toMatchObject({ playerId, lm: [0.5, 0.5, 1] });
    screen.say({ type: "state", scene: "menu" });
    expect(phone.last("state")).toMatchObject({ scene: "menu" });
    const late = client(); late.say({ type: "join", code });
    expect(late.last("state")).toMatchObject({ scene: "menu" }); // replayed to late joiners
  });
});
