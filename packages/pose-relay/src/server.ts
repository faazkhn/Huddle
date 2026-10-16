/**
 * pose-relay server: rooms that connect one big screen (TV) with up to N phones streaming body-pose keypoints.
 * Transport-agnostic — call `connect()` per socket and `tick()` every HEARTBEAT_MS. See ../README.md.
 */
export interface Conn { send(data: string): void; close(): void }

export type Player = { id: string; token: string; name: string; slot: number; conn: Conn | null; lostAt: number };
export type Room = { code: string; tv: Conn | null; tvLostAt: number; players: Map<string, Player>; lastState: string | null; data: Record<string, unknown> };

export const HEARTBEAT_MS = 5_000;
export const PEER_TIMEOUT_MS = 15_000;
export const REJOIN_MS = 60_000;
export const ROOM_TTL_MS = 5 * 60_000;
export const MAX_MSG_PER_SEC = 40;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

type Msg = { type: string; [k: string]: unknown };

export type PoseRelayOpts = {
  /** Public origin phones open; join URLs are `${baseUrl}/r/${code}`. */
  baseUrl: string;
  maxPlayers?: number;
  /** Parse + validate an inbound message. Return null to drop it. */
  parseScreen: (raw: string) => Msg | null;
  parsePhone: (raw: string) => Msg | null;
  /** Serialize an outbound message (e.g. add a protocol version). */
  encode?: (m: Msg) => string;
  /** Extra fields for room_created / player_joined / joined (e.g. a QR matrix, a player color). */
  roomInfo?: (room: Room, joinUrl: string) => Record<string, unknown>;
  playerInfo?: (p: Player) => Record<string, unknown>;
  /** Screen messages of these types are broadcast to all phones and replayed to late joiners. */
  broadcastTypes?: string[];
  /** Any other screen message (after validation) lands here. */
  onScreenMessage?: (m: Msg, room: Room, reply: (m: Msg) => void) => void;
  sanitizeName?: (name: string) => string;
  now?: () => number;
  random?: () => number;
  log?: (...a: unknown[]) => void;
};

export function createPoseRelay(o: PoseRelayOpts) {
  const { baseUrl, maxPlayers = 4, now = Date.now, random = Math.random, log = console.warn } = o;
  const encode = o.encode ?? JSON.stringify;
  const rooms = new Map<string, Room>();
  type Peer = { conn: Conn; lastSeen: number; windowStart: number; count: number; room?: Room; player?: Player; isTv?: boolean };
  const peers = new Set<Peer>();

  const newCode = () => {
    for (;;) {
      const c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join("");
      if (!rooms.has(c)) return c;
    }
  };
  const token = () => Array.from({ length: 24 }, () => Math.floor(random() * 36).toString(36)).join("");
  const toPhones = (room: Room, data: string) => { for (const p of room.players.values()) p.conn?.send(data); };
  const joinedMsg = (p: Player) => encode({ type: "player_joined", playerId: p.id, name: p.name, slot: p.slot, ...o.playerInfo?.(p) });

  function onTv(peer: Peer, raw: string) {
    const m = o.parseScreen(raw);
    if (!m) return log("pose-relay: dropped bad screen message", raw.slice(0, 120));
    if (m.type === "ping") return peer.conn.send(encode({ type: "pong", t: m.t, now: now() }));
    if (m.type === "pong") return;
    if (m.type === "tv_hello") {
      // A screen that reconnects with its code gets its room (and players) back.
      let room = typeof m.code === "string" ? rooms.get(m.code) : undefined;
      if (!room) { room = { code: newCode(), tv: null, tvLostAt: 0, players: new Map(), lastState: null, data: {} }; rooms.set(room.code, room); }
      if (room.tv && room.tv !== peer.conn) room.tv.close();
      room.tv = peer.conn; peer.room = room; peer.isTv = true;
      const joinUrl = `${baseUrl}/r/${room.code}`;
      peer.conn.send(encode({ type: "room_created", code: room.code, joinUrl, ...o.roomInfo?.(room, joinUrl) }));
      for (const p of room.players.values()) if (p.conn) peer.conn.send(joinedMsg(p));
      return;
    }
    const room = peer.room;
    if (!room || room.tv !== peer.conn) return;
    if (o.broadcastTypes?.includes(m.type)) { room.lastState = encode(m); return toPhones(room, room.lastState); }
    o.onScreenMessage?.(m, room, (r) => peer.conn.send(encode(r)));
  }

  function onPhone(peer: Peer, raw: string) {
    const m = o.parsePhone(raw);
    if (!m) { log("pose-relay: dropped bad phone message", raw.slice(0, 120)); return peer.conn.send(encode({ type: "error", code: "bad_message" })); }
    if (m.type === "ping") return peer.conn.send(encode({ type: "pong", t: m.t, now: now() }));
    if (m.type === "pong") return;
    if (m.type === "join") {
      const room = rooms.get(String(m.code).toUpperCase());
      if (!room) return peer.conn.send(encode({ type: "error", code: "no_room" }));
      let p = m.sessionToken ? [...room.players.values()].find((x) => x.token === m.sessionToken) : undefined;
      if (p) {
        if (p.conn && p.conn !== peer.conn) p.conn.close();
      } else {
        const used = new Set([...room.players.values()].map((x) => x.slot));
        if (used.size >= maxPlayers) return peer.conn.send(encode({ type: "error", code: "room_full" }));
        let slot = 0;
        while (used.has(slot)) slot++;
        const name = (o.sanitizeName ?? ((s) => s.slice(0, 16)))(String(m.name ?? ""));
        p = { id: `p${slot + 1}-${token().slice(0, 6)}`, token: token(), name: name || `Player ${slot + 1}`, slot, conn: null, lostAt: 0 };
        room.players.set(p.id, p);
      }
      p.conn = peer.conn; peer.room = room; peer.player = p;
      peer.conn.send(encode({ type: "joined", playerId: p.id, slot: p.slot, sessionToken: p.token, ...o.playerInfo?.(p) }));
      if (room.lastState) peer.conn.send(room.lastState);
      room.tv?.send(joinedMsg(p));
      return;
    }
    const { room, player } = peer;
    if (!room || !player) return;
    // Everything else a phone sends (pose frames, app events) goes to the screen, tagged with the player.
    room.tv?.send(encode({ ...m, playerId: player.id, ...(m.type === "pose" ? { rt: now() } : {}) }));
  }

  return {
    rooms,
    connect(conn: Conn) {
      const peer: Peer = { conn, lastSeen: now(), windowStart: now(), count: 0 };
      peers.add(peer);
      return {
        message(raw: string) {
          const t = now();
          peer.lastSeen = t;
          if (t - peer.windowStart >= 1000) { peer.windowStart = t; peer.count = 0; }
          if (++peer.count > MAX_MSG_PER_SEC) return; // rate limit: silently drop
          // The first message decides the role; a screen always opens with tv_hello.
          if (peer.isTv || (!peer.player && raw.includes('"tv_hello"'))) onTv(peer, raw);
          else onPhone(peer, raw);
        },
        close() {
          peers.delete(peer);
          const { room, player } = peer;
          if (!room) return;
          if (peer.isTv && room.tv === conn) { room.tv = null; room.tvLostAt = now(); }
          if (player && player.conn === conn) { player.conn = null; player.lostAt = now(); room.tv?.send(encode({ type: "player_left", playerId: player.id })); }
        },
      };
    },
    /** Call every HEARTBEAT_MS: pings peers, drops silent ones, expires players and screen-less rooms. */
    tick() {
      const t = now();
      for (const p of peers) {
        if (t - p.lastSeen > PEER_TIMEOUT_MS) p.conn.close();
        else p.conn.send(encode({ type: "ping", t }));
      }
      for (const room of rooms.values()) {
        for (const p of room.players.values()) {
          if (p.conn || t - p.lostAt <= REJOIN_MS) continue;
          room.players.delete(p.id);
          room.tv?.send(encode({ type: "player_left", playerId: p.id, gone: true }));
        }
        if (!room.tv && t - room.tvLostAt > ROOM_TTL_MS) {
          toPhones(room, encode({ type: "error", code: "no_room" }));
          rooms.delete(room.code);
        }
      }
    },
  };
}
