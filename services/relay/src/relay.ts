import QRCode from "qrcode";
import { createPoseRelay, type Conn } from "pose-relay/server";
import { msg, parse, PhoneToRelay, PLAYER_COLORS, MAX_PLAYERS, sanitizeName, TvToRelay, type RoundSummary } from "@huddle/protocol";

export { HEARTBEAT_MS, PEER_TIMEOUT_MS, REJOIN_MS, ROOM_TTL_MS, MAX_MSG_PER_SEC } from "pose-relay/server";
export type { Conn };

export interface Coach {
  line(summary: RoundSummary): Promise<{ text: string; audioUrl?: string }>;
  callout(key: string): string | undefined;
}

export const COACH_INTERVAL_MS = 10_000;

export type RelayOpts = { baseUrl: string; coach: Coach; now?: () => number; random?: () => number; log?: (...a: unknown[]) => void };

/** Huddle's relay = generic pose-relay rooms + Huddle protocol validation, player colors, QR codes and the AI coach. */
export function createRelay({ baseUrl, coach, now = Date.now, random, log = console.warn }: RelayOpts) {
  return createPoseRelay({
    baseUrl, now, random, log, maxPlayers: MAX_PLAYERS,
    parseScreen: (raw) => parse(TvToRelay, raw),
    parsePhone: (raw) => parse(PhoneToRelay, raw),
    encode: (m) => msg(m),
    sanitizeName,
    playerInfo: (p) => ({ color: PLAYER_COLORS[p.slot] }),
    roomInfo: (room, joinUrl) => {
      console.log(`room ${room.code} -> ${joinUrl}`);
      const { modules } = QRCode.create(joinUrl, { errorCorrectionLevel: "M" });
      return { qr: { size: modules.size, bits: Array.from(modules.data, (b) => (b ? "1" : "0")).join("") } };
    },
    broadcastTypes: ["game_state"],
    onScreenMessage(m, room, reply) {
      if (m.type === "callout") return reply({ type: "coach_line", text: m.text, audioUrl: coach.callout(String(m.key)) });
      if (m.type !== "round_summary") return;
      const last = (room.data.lastCoachAt as number | undefined) ?? -Infinity;
      if (now() - last < COACH_INTERVAL_MS) return; // max 1 coach call per room per 10 s
      room.data.lastCoachAt = now();
      coach.line(m as unknown as RoundSummary).then((line) => room.tv?.send(msg({ type: "coach_line", ...line })), (e) => log("coach failed", e));
    },
  });
}
