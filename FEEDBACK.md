# Product feedback

## Vega SDK + Vega CLI
- **Used for:** project generation, dependency resolution (`vega project install`), builds (`npm run build:debug`), installing/launching (`vega run-app`), port forwarding, device shell.
- **Worked well:** One-line install; `vega project install` picking OS-compatible versions; clear `--help` on every subcommand; builds produce all three architectures in one go.
- **Needs work:** `project generate -o` writes into the target dir rather than a subfolder; the non-interactive install flag is undocumented; host↔device networking (reverse port forwarding) and key injection (`inputd-cli`) aren't surfaced in the docs.
- **Onboarding:** ~10 minutes from zero to hello-world on the VVD on Apple Silicon. Rosetta + a list of GNU tools via Homebrew are prerequisites.
- **Build with it again?** Yes.

## Vega Virtual Device
- **Used for:** all TV development, D-pad testing via `inputd-cli`, and recording the demo video.
- **Worked well:** Fast boot, stable for hours, `vega device run-cmd` makes debugging easy, reverse port forwarding just works.
- **Needs work:** It reports a 960×540 logical screen at 1080p display-res, which made a 1080p layout render at 2× (see friction log). A CLI screen-record and `send-key` command would make automated UI testing and demo capture much easier.
- **Build with it again?** Yes.

## React Native for Vega (RN 0.83)
- **Used for:** the whole TV app — focusable `Pressable`s, `useTVEventHandler` (Menu key), `BackHandler`, `Animated`, `WebSocket`, `@amazon-devices/react-native-svg` for avatars and the QR code, `@amazon-devices/react-native-w3cmedia` `AudioPlayer` for coach audio.
- **Worked well:** It's just React Native — shared TypeScript packages (zod schemas, scoring, ranking) bundled through Metro from our monorepo with only `watchFolders`/`extraNodeModules` config. D-pad focus worked with no custom code.
- **Needs work:** Kepler/Vega naming is mixed; audio-only playback isn't in the main media guide; a missing manifest service or an unreachable URL both surface only as `MediaError 4` with an empty message (details only in the device log); no guidance on logical resolution for 10-foot layouts.
- **Build with it again?** Yes — the best part of the platform for web/RN developers.

## Blender (character art)
- **Used for:** modeling the four player characters and rendering 3D-shaded body-part sprites headless (`blender -b -P`), rigged to pose landmarks in the TV app.
- **Worked well:** fully scriptable; EEVEE renders 36 sprites in seconds.

## Amazon Bedrock
- **Used for:** the end-of-round AI coach: Converse API, Claude model ID from `BEDROCK_MODEL_ID`, structured scores in, ≤ 40-word commentator line out, 4 s timeout with a template fallback.
- **Worked well:** The Converse API keeps the code model-agnostic (one `ConverseCommand`).
- **Needs work:** We could not exercise it live during the build window (no credentials in the build environment), so the caption fallback carried the demo.
- **Build with it again?** Yes.

## Amazon Polly
- **Used for:** voicing coach lines (neural voice, MP3, served to the TV from the relay for 5 minutes) and five Boot Camp callouts synthesized once at startup.
- **Needs work:** Same as Bedrock — implemented, not exercised live here.
- **Build with it again?** Yes; neural voices fit a sports-commentator persona well.

## AWS hosting (App Runner → EC2/Lightsail)
- **Used for:** hosting the relay container.
- **Needs work:** App Runner lacks WebSocket support, so a real-time app needs EC2/Lightsail + Caddy or ECS + ALB.

## MediaPipe Tasks Vision (PoseLandmarker)
- **Used for:** 33-landmark pose on phones in the browser (lite model, GPU delegate with CPU fallback). Measured 55 fps in desktop Chrome with GPU.
- **Worked well:** Runs fully on-device, which is the core of Huddle's privacy story.

## Feature requests
| What | Why | Urgency |
|---|---|---|
| A camera-less "companion device" API on Fire TV (pair phones/tablets as input + sensors, with a system QR pairing flow) | Every second-screen game rebuilds rooms, QR join, and relays; a platform flow would make it one call and work offline on the LAN | important |
| Let Vega apps host a local WebSocket/HTTP server, with documented LAN discovery | Phones could connect directly to the TV on home Wi-Fi: lower latency, no cloud relay to run | important |
| `vega device key` / `vega device screenrecord` | Automated UI tests and demo capture without reverse-engineering `inputd-cli` | nice-to-have |
| Document/align VVD logical resolution with real devices | 10-foot layouts render at the wrong scale otherwise | important |
| WebSocket support in AWS App Runner | Simplest TLS host for real-time apps | nice-to-have |
