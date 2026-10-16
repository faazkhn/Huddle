import { describe, expect, it, vi } from "vitest";
import { createRelay, REJOIN_MS, ROOM_TTL_MS, PEER_TIMEOUT_MS, HEARTBEAT_MS, type Coach } from "../src/relay.ts";
import { fallbackLine } from "../src/coach.ts";

const lm = Array.from({ length: 99 }, () => 0.5);
const j = (o: object) => JSON.stringify({ v: 1, ...o });

function setup(coach: Partial<Coach> = {}) {
  let t = 1_000_000;
  const clock = { advance: (ms: number) => { t += ms; } };
  const relay = createRelay({
    baseUrl: "https://huddle.test", now: () => t, log: () => {},
    coach: { line: async () => ({ text: "Nice!" }), callout: () => undefined, ...coach },
  });
  const client = () => {
    const sent: any[] = [];
    const c = { sent, closed: false, send: (d: string) => sent.push(JSON.parse(d)), close: () => { c.closed = true; h.close(); } };
    const h = relay.connect(c);
    return Object.assign(c, { say: (o: object) => h.message(j(o)), raw: h.message, last: (type: string) => sent.filter((m) => m.type === type).at(-1) });
  };
  const tv = client();
  tv.say({ type: "tv_hello" });
  const code: string = tv.last("room_created").code;
  const phone = (name?: string, sessionToken?: string) => { const p = client(); p.say({ type: "join", code, name, sessionToken }); return p; };
  return { relay, clock, tv, code, phone, client };
}

describe("relay rooms", () => {
  it("creates a room with an unambiguous 4-letter code and join URL", () => {
    const { tv, code } = setup();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(tv.last("room_created").joinUrl).toBe(`https://huddle.test/r/${code}`);
  });

  it("joins up to 4 players; the 5th gets room_full", () => {
    const { tv, phone } = setup();
    const ps = ["Maya", "Dad", "Mom", "Leo"].map((n) => phone(n));
    expect(ps.map((p) => p.last("joined").slot)).toEqual([0, 1, 2, 3]);
    expect(new Set(ps.map((p) => p.last("joined").color)).size).toBe(4);
    expect(tv.sent.filter((m) => m.type === "player_joined").map((m) => m.name)).toEqual(["Maya", "Dad", "Mom", "Leo"]);
    expect(phone("Extra").last("error").code).toBe("room_full");
  });

  it("unknown room -> no_room; default names", () => {
    const { client, phone } = setup();
    const p = client(); p.say({ type: "join", code: "ZZZZ" });
    expect(p.last("error").code).toBe("no_room");
    expect(phone().last("joined")).toBeTruthy();
  });

  it("forwards pose and events to the TV with playerId, and game_state to phones", () => {
    const { tv, phone } = setup();
    const p = phone("Maya");
    const id = p.last("joined").playerId;
    p.say({ type: "pose", t: 5, lm });
    p.say({ type: "event", event: { kind: "rep", exercise: "squat", quality: "good" } });
    expect(tv.last("pose")).toMatchObject({ playerId: id, t: 5 });
    expect(tv.last("event")).toMatchObject({ playerId: id, event: { kind: "rep" } });
    tv.say({ type: "game_state", state: "COUNTDOWN", mode: "boot_camp", round: 1, scores: [] });
    expect(p.last("game_state").state).toBe("COUNTDOWN");
  });

  it("restores the same slot when a phone rejoins with its token within 60 s (R4)", () => {
    const { tv, phone, clock } = setup();
    phone("Maya");
    const p = phone("Dad");
    const { slot, sessionToken, playerId } = p.last("joined");
    p.close();
    expect(tv.last("player_left").playerId).toBe(playerId);
    clock.advance(REJOIN_MS - 1000);
    const again = phone("Dad", sessionToken);
    expect(again.last("joined")).toMatchObject({ slot, playerId });
  });

  it("frees the slot after the rejoin window", () => {
    const { relay, phone, clock, code } = setup();
    const p = phone("Dad");
    const { sessionToken } = p.last("joined");
    p.close();
    clock.advance(REJOIN_MS + 1);
    relay.tick();
    expect(relay.rooms.get(code)!.players.size).toBe(0);
    expect(phone("Dad", sessionToken).last("joined").sessionToken).not.toBe(sessionToken);
  });

  it("drops a room 5 minutes after its TV disconnects (R5), but a returning TV keeps it", () => {
    const { relay, tv, clock, code, client } = setup();
    tv.close();
    clock.advance(ROOM_TTL_MS - 1000); relay.tick();
    expect(relay.rooms.has(code)).toBe(true);
    const tv2 = client(); tv2.say({ type: "tv_hello", code });
    expect(tv2.last("room_created").code).toBe(code);
    tv2.close();
    clock.advance(ROOM_TTL_MS + 1); relay.tick();
    expect(relay.rooms.has(code)).toBe(false);
  });

  it("closes peers silent for 15 s and pings live ones (R6)", () => {
    const { relay, tv, phone, clock } = setup();
    const p = phone("Maya");
    clock.advance(HEARTBEAT_MS); relay.tick();
    expect(p.last("ping")).toBeTruthy();
    tv.say({ type: "pong" });
    clock.advance(PEER_TIMEOUT_MS - HEARTBEAT_MS + 1); relay.tick();
    expect(p.closed).toBe(true);
    expect(tv.closed).toBe(false);
    expect(tv.last("player_left")).toBeTruthy();
  });

  it("survives malformed input and reports bad_message (R7)", () => {
    const { phone, tv } = setup();
    const p = phone("Maya");
    for (const raw of ["", "null", "{", "[]", j({ type: "pose", t: 1, lm: [1] }), j({ type: "join" }), "x".repeat(20_000)]) {
      expect(() => p.raw(raw)).not.toThrow();
      expect(() => tv.raw(raw)).not.toThrow();
    }
    expect(p.last("error").code).toBe("bad_message");
  });

  it("rate-limits a connection to 40 msg/s", () => {
    const { tv, phone } = setup();
    const p = phone("Maya");
    for (let i = 0; i < 100; i++) p.say({ type: "pose", t: i, lm });
    expect(tv.sent.filter((m) => m.type === "pose")).toHaveLength(39); // 40 incl. the join
  });

  it("asks the coach at most once per 10 s per room", async () => {
    const line = vi.fn(async () => ({ text: "Maya wins!", audioUrl: "https://huddle.test/audio/x.mp3" }));
    const { tv, clock } = setup({ line });
    const summary = { type: "round_summary", mode: "free_throw", players: [{ name: "Maya", score: 400, rank: 1 }] };
    tv.say(summary); tv.say(summary);
    await Promise.resolve(); await Promise.resolve();
    expect(line).toHaveBeenCalledTimes(1);
    expect(tv.last("coach_line")).toMatchObject({ text: "Maya wins!" });
    clock.advance(10_001); tv.say(summary);
    expect(line).toHaveBeenCalledTimes(2);
  });
});

describe("coach fallback", () => {
  it("names the winner without AWS", () => {
    expect(fallbackLine({ type: "round_summary", mode: "free_throw", players: [
      { name: "Dad", score: 300, rank: 2, weakest: "Elbow in!" }, { name: "Maya", score: 410, rank: 1 },
    ] })).toBe("Maya takes it with 410 points! Next round, focus on: Elbow in!.");
  });
});

describe("qr", () => {
  it("sends a square QR matrix for the join URL", () => {
    const { tv } = setup();
    const { qr } = tv.last("room_created");
    expect(qr.bits).toHaveLength(qr.size * qr.size);
    expect(qr.bits).toMatch(/^[01]+$/);
  });
});

describe("slot expiry", () => {
  it("tells the TV when a disconnected player's slot is freed", () => {
    const { relay, tv, phone, clock } = setup();
    const p = phone("Dad");
    const { playerId } = p.last("joined");
    p.close();
    clock.advance(REJOIN_MS + 1);
    tv.say({ type: "pong" }); // a live TV answers heartbeats
    relay.tick();
    expect(tv.last("player_left")).toMatchObject({ playerId, gone: true });
  });
});
