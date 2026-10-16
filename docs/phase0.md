# Phase 0 — spike report

Environment: macOS 26.6 (Apple Silicon), Node 26, Vega SDK 0.24.12112, Vega CLI 1.4.4, RN for Vega 0.83, Vega Virtual Device (TV, aarch64).

| # | Spike | Result |
|---|---|---|
| 1 | Install Vega SDK, hello-world on the **Vega Virtual Device** | ✅ `curl … get_vvm.sh \| bash` (run with `NONINTERACTIVE=true`), `vega project generate -t helloWorld`, `npm run build:debug`, `vega virtual-device start`, `vega run-app build/aarch64-debug/*.vpkg`. ~10 min. |
| 2a | `WebSocket` from the Vega RN runtime | ✅ Standard global works. The VVD reaches a host server via `vega device start-port-forwarding -p 8080 -f false` → `ws://localhost:8080`. |
| 2b | `react-native-svg` | ✅ `@amazon-devices/react-native-svg` (resolved by `vega project install`). Avatars + QR render at 15 fps × 4 players. |
| 2c | Play an MP3 | ✅ `AudioPlayer` from `@amazon-devices/react-native-w3cmedia` **after** adding the media `[[wants.service]]` entries to `manifest.toml`. Must be an `https://` URL the device can reach directly — reverse-forwarded `localhost` fails with `MediaError 4`. |
| 2d | D-pad + Back | ✅ Focusable `Pressable` + `hasTVPreferredFocus`; `BackHandler` from `@amazon-devices/react-native-kepler`; `useTVEventHandler` for Menu. Automated with `inputd-cli button_press KEY_*` on the device. |
| 3 | MediaPipe PoseLandmarker in a Vite page over an HTTPS tunnel | ✅ 55 fps (desktop Chrome, GPU delegate) through a `cloudflared` quick tunnel. ⚠️ Not yet measured on physical iOS Safari / Android Chrome phones. |
| 4 | Bedrock + Polly JSON summary → MP3 | ⚠️ Implemented (`services/relay/src/coach.ts`) but not run — no AWS credentials in the build environment. Fallback path verified. |

## [VERIFY] items, resolved
- **Vega apps listening on a socket:** not needed — the TV is a WebSocket client of the relay.
- **SDK install / CLI commands:** see table; README documents the exact commands.
- **`react-native-svg`:** available as `@amazon-devices/react-native-svg`.
- **Audio playback:** W3C Media `AudioPlayer`, URL mode, MP3 — works with the manifest services above.
- **`WebSocket` global:** works.
- **App Runner WebSockets:** **not supported** → deploy the relay container on EC2/Lightsail with Caddy (or ECS + ALB).

## Plan changes
- Layout is authored at 1920×1080 and scaled to the device's logical size (the VVD reports 960×540).
- Coach audio URLs always use the public HTTPS base URL.
- Added a pose simulator (`fixtures/synth.ts`) used for fixtures, `tools/bots.ts`, and the phone's `?sim=1` mode so the whole loop can be tested without people in front of cameras.
