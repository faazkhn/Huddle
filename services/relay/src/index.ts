import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { MAX_MESSAGE_BYTES } from "@huddle/protocol";
import { createRelay, HEARTBEAT_MS } from "./relay.ts";
import { createCoach } from "./coach.ts";

const PORT = Number(process.env.PORT || 8080);
const BASE = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const STATIC = process.env.PHONE_DIST || fileURLToPath(new URL("../../../apps/phone/dist", import.meta.url));
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm", ".task": "application/octet-stream" };

const coach = createCoach(process.env, BASE);
const relay = createRelay({ baseUrl: BASE, coach });
setInterval(relay.tick, HEARTBEAT_MS);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  if (url.pathname === "/healthz") return void res.end("ok");
  const audio = url.pathname.match(/^\/audio\/([\w-]+)\.mp3$/);
  if (audio) {
    const a = coach.audio.get(audio[1]);
    if (!a) return void res.writeHead(404).end();
    return void res.writeHead(200, { "content-type": "audio/mpeg", "cache-control": "no-store" }).end(a.buf);
  }
  // Phone web page: /r/CODE serves the SPA; everything else is a static file from the phone build.
  const rel = /^\/r\/[A-Z0-9]{4}\/?$/i.test(url.pathname) || url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = normalize(join(STATIC, rel));
  if (!file.startsWith(STATIC)) return void res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MESSAGE_BYTES });
wss.on("connection", (ws) => {
  const peer = relay.connect({ send: (d) => ws.readyState === ws.OPEN && ws.send(d), close: () => ws.terminate() });
  ws.on("message", (data, isBinary) => { if (!isBinary) peer.message(data.toString()); });
  ws.on("close", peer.close);
  ws.on("error", () => ws.terminate());
});

server.listen(PORT, () => console.log(`relay on :${PORT} — join URLs use ${BASE}`));
