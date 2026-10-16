import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_PLAYERS = 4;
// Color-blind-safe (Okabe-Ito). Always shown with name + number, never alone.
export const PLAYER_COLORS = ["#E69F00", "#56B4E9", "#009E73", "#CC79A7"] as const;
export const LANDMARKS = 33;

// Landmarks: [x, y, visibility] * 33. y is normalized to image height; x is in the same units (image-height), centred at 0.5, mirrored.
const lm = z.array(z.number().finite()).length(LANDMARKS * 3);

export const TipKey = z.enum(["elbow_in", "bend_knees", "extend_arm", "hold_follow", "set_angle"]);
export const Exercise = z.enum(["squat", "jumping_jack", "high_knees"]);
export const GameMode = z.enum(["free_throw", "boot_camp"]);
export const GameStateName = z.enum(["LOBBY", "COUNTDOWN", "ROUND", "RESULTS"]);

export const ShotEvent = z.object({
  kind: z.literal("shot"),
  score: z.number().min(0).max(100),
  tip: TipKey,
  components: z.record(TipKey, z.number().min(0).max(20)),
});
export const RepEvent = z.object({
  kind: z.literal("rep"),
  exercise: Exercise,
  quality: z.enum(["good", "partial"]),
});
export const GameEvent = z.discriminatedUnion("kind", [ShotEvent, RepEvent]);

const name = z.string().max(16).regex(/^[A-Za-z0-9 ]*$/);
const playerId = z.string().min(1).max(32);

export const PlayerScore = z.object({
  playerId,
  name: z.string().max(16),
  score: z.number(),
  detail: z.string().max(80).optional(),
});

export const GameState = z.object({
  type: z.literal("game_state"),
  state: GameStateName,
  mode: GameMode.nullable(),
  round: z.number().int().min(0),
  scores: z.array(PlayerScore).max(MAX_PLAYERS),
  exercise: Exercise.optional(),
});

export const RoundSummary = z.object({
  type: z.literal("round_summary"),
  mode: GameMode,
  players: z.array(z.object({
    name: z.string().max(16),
    score: z.number(),
    rank: z.number().int(),
    best: z.string().max(24).optional(),
    weakest: z.string().max(24).optional(),
    reps: z.number().int().optional(),
  })).max(MAX_PLAYERS),
});

const base = { v: z.literal(PROTOCOL_VERSION) };
const ping = z.object({ ...base, type: z.literal("ping"), t: z.number().optional() });
const pong = z.object({ ...base, type: z.literal("pong"), t: z.number().optional(), now: z.number().optional() });

export const TvToRelay = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("tv_hello"), code: z.string().length(4).optional() }),
  GameState.extend(base),
  RoundSummary.extend(base),
  z.object({ ...base, type: z.literal("callout"), key: z.string().max(32), text: z.string().max(80) }),
  ping, pong,
]);

export const RelayToTv = z.discriminatedUnion("type", [
  // qr: square module matrix of joinUrl, row-major "0"/"1" string — the TV just draws it.
  z.object({ ...base, type: z.literal("room_created"), code: z.string().length(4), joinUrl: z.string(), qr: z.object({ size: z.number().int(), bits: z.string() }) }),
  z.object({ ...base, type: z.literal("player_joined"), playerId, name: z.string(), color: z.string(), slot: z.number().int() }),
  // gone: the rejoin window expired and the slot is free again.
  z.object({ ...base, type: z.literal("player_left"), playerId, gone: z.boolean().optional() }),
  z.object({ ...base, type: z.literal("pose"), playerId, t: z.number(), lm, rt: z.number().optional() }),
  z.object({ ...base, type: z.literal("event"), playerId, event: GameEvent }),
  z.object({ ...base, type: z.literal("coach_line"), text: z.string(), audioUrl: z.string().optional() }),
  ping, pong,
]);

export const PhoneToRelay = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("join"), code: z.string().length(4), name: name.optional(), sessionToken: z.string().max(64).optional() }),
  z.object({ ...base, type: z.literal("pose"), t: z.number(), lm }),
  z.object({ ...base, type: z.literal("event"), event: GameEvent }),
  ping, pong,
]);

export const RelayToPhone = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("joined"), playerId, color: z.string(), slot: z.number().int(), sessionToken: z.string() }),
  GameState.extend(base),
  z.object({ ...base, type: z.literal("error"), code: z.enum(["room_full", "no_room", "bad_message"]) }),
  ping, pong,
]);

export type TvToRelay = z.infer<typeof TvToRelay>;
export type RelayToTv = z.infer<typeof RelayToTv>;
export type PhoneToRelay = z.infer<typeof PhoneToRelay>;
export type RelayToPhone = z.infer<typeof RelayToPhone>;
export type GameEvent = z.infer<typeof GameEvent>;
export type ShotEvent = z.infer<typeof ShotEvent>;
export type RepEvent = z.infer<typeof RepEvent>;
export type TipKey = z.infer<typeof TipKey>;
export type Exercise = z.infer<typeof Exercise>;
export type GameMode = z.infer<typeof GameMode>;
export type GameStateName = z.infer<typeof GameStateName>;
export type RoundSummary = z.infer<typeof RoundSummary>;

type Schema<T> = { safeParse(d: unknown): { success: true; data: T } | { success: false } };

/** Parse a raw WS payload. Returns null on oversize, bad JSON, or schema mismatch — never throws. */
export function parse<T>(schema: Schema<T>, raw: string): T | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return null; }
  const r = schema.safeParse(json);
  return r.success ? r.data : null;
}

export const msg = <T extends { type: string }>(m: T) => JSON.stringify({ v: PROTOCOL_VERSION, ...m });

/** Display names: max 16 chars, alphanumerics and spaces only (also what the coach prompt sees). */
export const sanitizeName = (s: string | undefined) =>
  (s ?? "").replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);

export const TIP_TEXT: Record<TipKey, string> = {
  elbow_in: "Elbow in!",
  bend_knees: "More knee bend",
  extend_arm: "Extend all the way up",
  hold_follow: "Hold that follow-through",
  set_angle: "Set your elbow at 90°",
};
