// Simulated phones for testing/demo without cameras. Each bot runs the same pipeline as the phone page
// (synthetic pose -> EMA smoothing -> scoring -> 15 fps pose stream + events) over a real WebSocket.
// Usage: node tools/bots.ts <ROOM> [count=3] [ws://localhost:8080/ws]
import WebSocket from "ws";
import { msg, parse, RelayToPhone } from "@huddle/protocol";
import { createRepCounter, createShotDetector, makeSmoother } from "@huddle/scoring";
import { mulberry32, simPlayer, toLandmarks } from "../fixtures/synth.ts";

const [code, count = "3", url = "ws://localhost:8080/ws"] = process.argv.slice(2);
if (!code) { console.error("usage: node tools/bots.ts <ROOM> [count] [wsUrl]"); process.exit(1); }

const ROSTER = [
  { name: "Dad", skill: 0.55, scale: 1.0 },
  { name: "Maya", skill: 0.9, scale: 0.78 }, // kid-sized
  { name: "Mom", skill: 0.7, scale: 0.95 },
  { name: "Leo", skill: 0.65, scale: 0.85 },
];

function bot(i: number) {
  const { name, skill, scale } = ROSTER[i];
  const ws = new WebSocket(url);
  const sim = simPlayer(skill, i + 1), smooth = makeSmoother(0.5), rnd = mulberry32(i + 99);
  let game: { state: string; mode: string | null; exercise?: string } = { state: "LOBBY", mode: null };
  let detect: ((lm: number[], t: number) => object | null) | null = null;
  let lastSend = 0, joined = false;

  ws.on("open", () => ws.send(msg({ type: "join", code, name })));
  ws.on("message", (d) => {
    const m = parse(RelayToPhone, d.toString());
    if (!m) return;
    if (m.type === "joined") { joined = true; console.log(`${name} joined as P${m.slot + 1}`); }
    if (m.type === "error") { console.log(`${name}: ${m.code}`); ws.close(); }
    if (m.type === "ping") ws.send(msg({ type: "pong", t: m.t }));
    if (m.type === "game_state" && `${m.state}${m.mode}${m.exercise}` !== `${game.state}${game.mode}${game.exercise}`) {
      game = m;
      detect = m.state !== "ROUND" ? null
        : m.mode === "free_throw" ? createShotDetector("right")
        : m.exercise ? ((c) => (lm: number[]) => c(lm))(createRepCounter(m.exercise)) : null;
    }
  });
  ws.on("close", () => console.log(`${name} disconnected`));

  setInterval(() => {
    if (!joined) return;
    const now = Date.now();
    // Stagger players across the screen slightly so they don't move in lockstep.
    const lm = smooth(toLandmarks(sim(game, now + i * 450), rnd, { scale, cy: 0.5 + (1 - scale) * 0.4 }));
    const e = detect?.(lm, now);
    if (e) ws.send(msg({ type: "event", event: e }));
    if (now - lastSend >= 66) { lastSend = now; ws.send(msg({ type: "pose", t: now, lm })); }
  }, 33);
}

for (let i = 0; i < Math.min(4, Number(count)); i++) setTimeout(() => bot(i), i * 1200);
