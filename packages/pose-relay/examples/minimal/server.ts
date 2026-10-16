// Minimal pose-relay server: serves screen.html + phone.html and relays keypoints. Run: node server.ts (Node 22.18+)
// Phones need HTTPS for the camera — expose it with e.g. `cloudflared tunnel --url http://localhost:8090`.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { WebSocketServer } from "ws";
import { createPoseRelay, HEARTBEAT_MS } from "../../src/server.ts";

const json = (raw: string) => { try { const m = JSON.parse(raw); return m && typeof m.type === "string" ? m : null; } catch { return null; } };
const relay = createPoseRelay({ baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8090", parseScreen: json, parsePhone: json });
setInterval(relay.tick, HEARTBEAT_MS);

const page = (f: string) => readFileSync(new URL(f, import.meta.url));
const server = createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(req.url?.startsWith("/r/") ? page("phone.html") : page("screen.html"));
});
new WebSocketServer({ server, path: "/ws", maxPayload: 16_384 }).on("connection", (ws) => {
  const peer = relay.connect({ send: (d) => ws.send(d), close: () => ws.terminate() });
  ws.on("message", (d) => peer.message(d.toString()));
  ws.on("close", peer.close);
});
server.listen(8090, () => console.log("open http://localhost:8090 on the big screen"));
