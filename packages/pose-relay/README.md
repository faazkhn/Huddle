# pose-relay

**Phones as body-pose cameras for a big screen.** MediaPipe runs on the phone; only 33 keypoints per frame travel over a WebSocket room to your TV / big-screen app. No video leaves the phone.

Built for [Huddle](../../README.md), a Fire TV fitness party game.

```
📱 phone page ──pose frames (keypoints)──▶ relay room ──▶ 📺 screen app
             ◀──────── app state ─────────            ◀── state / events
```

## Server
```ts
import { createPoseRelay, HEARTBEAT_MS } from "pose-relay/server";
const json = (raw: string) => { try { const m = JSON.parse(raw); return typeof m?.type === "string" ? m : null; } catch { return null; } };
const relay = createPoseRelay({ baseUrl: "https://my.host", parseScreen: json, parsePhone: json, broadcastTypes: ["state"] });
setInterval(relay.tick, HEARTBEAT_MS);
// per WebSocket: const peer = relay.connect({ send, close }); ws.on("message", d => peer.message(String(d))); ws.on("close", peer.close);
```
Options: `maxPlayers` (4), `encode`, `roomInfo` / `playerInfo` (extra fields such as a QR code or player color), `onScreenMessage` (your app messages), `sanitizeName`.

### Protocol
| From | Message | Effect |
|---|---|---|
| screen | `{type:"tv_hello", code?}` | creates (or reclaims) a room → `{type:"room_created", code, joinUrl}` |
| phone | `{type:"join", code, name?, sessionToken?}` | → `{type:"joined", playerId, slot, sessionToken}`; screen gets `player_joined` |
| phone | `{type:"pose", t, lm}` (`lm` = `[x,y,visibility]*33`) or any other message | forwarded to the screen with `playerId` |
| screen | a `broadcastTypes` message | sent to all phones, replayed to late joiners |
| either | `ping` / `pong` | heartbeat; silent peers are dropped after 15 s |
| relay | `player_left {playerId, gone?}`, `error {code}` | disconnects, expired slots, `room_full`, `no_room`, `bad_message` |

## Phone
```ts
import { createPoseCamera } from "pose-relay/phone";
const cam = await createPoseCamera(videoElement, { facingMode: "user", wasmBase: "/wasm" });
requestAnimationFrame(function loop(t) { const lm = cam.read(t); if (lm) ws.send(JSON.stringify({ type: "pose", t: Date.now(), lm })); requestAnimationFrame(loop); });
```
Coordinates: `y` is normalized to image height; `x` uses the same units, centred at 0.5 and mirrored, so joint angles are true and a screen avatar moves like a mirror.

## Try it
```bash
node examples/minimal/server.ts          # Node 22.18+, needs `ws`
cloudflared tunnel --url http://localhost:8090   # phones need HTTPS for the camera
```
Open the server URL on the big screen, then the shown `…/r/CODE` link on a phone.

MIT licensed.
