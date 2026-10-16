import { useEffect, useReducer, useRef, useState } from 'react';
import { msg, parse, RelayToTv, type RelayToTv as In, type TvToRelay } from '@huddle/protocol';
import { RELAY_URL } from './config';

// Poses arrive at up to 60 msg/s (4 phones x 15 fps). They go into this store instead of React state;
// avatars poll it at 15 fps so pose traffic never re-renders the whole app.
const poses = new Map<string, number[]>();
const latency = new Map<string, number[]>();
let clockOffset = 0; // relay clock - TV clock

export function usePose(id: string | null) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const i = setInterval(force, 66);
    return () => clearInterval(i);
  }, []);
  return id ? poses.get(id) : undefined;
}

/** p50/p95 pose latency (phone capture -> TV receive, relay-clock corrected) per player. */
export function latencyStats() {
  const out: Record<string, { p50: number; p95: number; n: number }> = {};
  latency.forEach((xs, id) => {
    const s = [...xs].sort((a, b) => a - b);
    out[id] = { p50: s[Math.floor(s.length * 0.5)] ?? 0, p95: s[Math.floor(s.length * 0.95)] ?? 0, n: s.length };
  });
  return out;
}

export type Net = { connected: boolean; room: Extract<In, { type: 'room_created' }> | null; send: (m: TvToRelay | Omit<TvToRelay, 'v'>) => void };

/** Connects to the relay, keeps the room across reconnects, and hands non-pose messages to `onMessage`. */
export function useRelay(onMessage: (m: In) => void): Net {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<Net['room']>(null);
  const ws = useRef<WebSocket | null>(null);
  const code = useRef<string | undefined>(undefined);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    let closed = false, retry: ReturnType<typeof setTimeout>, ping: ReturnType<typeof setInterval>;
    const open = () => {
      const s = new WebSocket(RELAY_URL);
      ws.current = s;
      s.onopen = () => {
        setConnected(true);
        s.send(msg({ type: 'tv_hello', code: code.current }));
        const sync = () => s.send(msg({ type: 'ping', t: Date.now() }));
        sync();
        ping = setInterval(sync, 5000);
      };
      s.onmessage = (ev) => {
        const m = parse(RelayToTv, String(ev.data));
        if (!m) return;
        if (m.type === 'pose') {
          poses.set(m.playerId, m.lm);
          const xs = latency.get(m.playerId) ?? [];
          xs.push(Date.now() + clockOffset - m.t);
          if (xs.length > 100) xs.shift();
          latency.set(m.playerId, xs);
        } else if (m.type === 'ping') s.send(msg({ type: 'pong', t: m.t }));
        else if (m.type === 'pong') { if (m.t && m.now) clockOffset = m.now - (m.t + (Date.now() - m.t) / 2); }
        else {
          if (m.type === 'room_created') { code.current = m.code; setRoom(m); }
          if (m.type === 'player_left') { poses.delete(m.playerId); latency.delete(m.playerId); }
          handler.current(m);
        }
      };
      s.onclose = () => {
        clearInterval(ping);
        setConnected(false);
        if (!closed) retry = setTimeout(open, 2000);
      };
      s.onerror = () => s.close();
    };
    open();
    return () => { closed = true; clearTimeout(retry); ws.current?.close(); };
  }, []);

  return {
    connected, room,
    send: (m) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(msg(m as TvToRelay)); },
  };
}
