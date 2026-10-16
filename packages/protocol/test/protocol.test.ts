import { describe, expect, it } from "vitest";
import { parse, PhoneToRelay, TvToRelay, sanitizeName, MAX_MESSAGE_BYTES } from "../src/index.ts";

const lm = Array.from({ length: 99 }, () => 0.5);

describe("protocol", () => {
  it("accepts valid phone messages", () => {
    expect(parse(PhoneToRelay, JSON.stringify({ v: 1, type: "pose", t: 1, lm }))?.type).toBe("pose");
    expect(parse(PhoneToRelay, JSON.stringify({ v: 1, type: "join", code: "ABCD", name: "Maya" }))?.type).toBe("join");
    expect(parse(PhoneToRelay, JSON.stringify({ v: 1, type: "event", event: { kind: "rep", exercise: "squat", quality: "good" } }))).not.toBeNull();
  });
  it.each([
    ["not json", "{nope"],
    ["wrong version", JSON.stringify({ v: 2, type: "ping" })],
    ["unknown type", JSON.stringify({ v: 1, type: "hack" })],
    ["short landmark array", JSON.stringify({ v: 1, type: "pose", t: 1, lm: [1, 2] })],
    ["NaN-ish landmark", JSON.stringify({ v: 1, type: "pose", t: 1, lm: [...lm.slice(1), "x"] })],
    ["bad name chars", JSON.stringify({ v: 1, type: "join", code: "ABCD", name: "<script>" })],
    ["oversize", JSON.stringify({ v: 1, type: "ping", pad: "x".repeat(MAX_MESSAGE_BYTES) })],
    ["phone sending tv-only message", JSON.stringify({ v: 1, type: "tv_hello" })],
  ])("rejects %s without throwing", (_, raw) => expect(parse(PhoneToRelay, raw)).toBeNull());
  it("validates tv messages", () => {
    expect(parse(TvToRelay, JSON.stringify({ v: 1, type: "tv_hello" }))).not.toBeNull();
    expect(parse(TvToRelay, JSON.stringify({ v: 1, type: "game_state", state: "LOBBY", mode: null, round: 0, scores: [] }))).not.toBeNull();
  });
  it("sanitizes names", () => expect(sanitizeName("  Mä<b>ya!!  the Great One ")).toBe("Mbya the Great O"));
});
