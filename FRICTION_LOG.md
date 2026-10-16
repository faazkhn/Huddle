# Friction log

Everything below happened while building Huddle on macOS 26 (Apple Silicon), Node 26, Vega SDK 0.24.12112 / Vega CLI 1.4.4.

### Vega Virtual Device reports a 960×540 logical screen, so a 1080p layout renders at 2×
- **Tool/SDK:** Vega Virtual Device 0.24.12112, React Native for Vega 0.83
- **Task attempted:** Lay out a 10-foot UI on a 1920×1080 canvas (5% safe area, 28 px minimum text) as Fire TV design guidance suggests.
- **Steps taken:** Built the lobby with absolute sizes for 1080p, ran it on the VVD started with `--display-res 1920,1080`.
- **Expected:** Layout fills a 1920×1080 screen.
- **Actual:** Everything rendered at twice the size and overflowed; `useWindowDimensions()` reports 960×540 (the window is 1920 physical pixels on a Retina Mac). Nothing in the "Build an app" or design docs says which logical resolution to target.
- **Severity:** major
- **Workaround:** Author at 1920×1080 and wrap the app in a view scaled by `min(width/1920, height/1080)` (`apps/tv/src/App.tsx`).
- **Suggestion (actionable):** Document the logical resolution/density for the VVD and each Fire TV device class, and make the VVD report the same logical size as a real 1080p Fire TV (or ship a `useTvScale()` helper in the template).
- **Date:** 2026-10-16

### `vega project generate -o <dir>` writes into `<dir>` instead of creating `<dir>/<name>`
- **Tool/SDK:** Vega CLI 1.4.4
- **Task attempted:** Generate a TV app inside a monorepo at `apps/tv`.
- **Steps taken:** `vega project generate -t helloWorld -n huddletv -o apps`
- **Expected:** `apps/huddletv/…` (the `-n` name as the folder, like most generators).
- **Actual:** The template files were spread directly into `apps/` next to the existing `phone/` app.
- **Severity:** minor
- **Workaround:** Moved the files into `apps/tv`.
- **Suggestion (actionable):** Create `<outputDir>/<name>` (or refuse a non-empty output directory) and say which one happens in `--help`.
- **Date:** 2026-10-16

### Non-interactive SDK install is possible but undocumented, and floods logs
- **Tool/SDK:** `get_vvm.sh` installer
- **Task attempted:** Install Vega Developer Tools from a script/CI shell (no TTY).
- **Steps taken:** Read the 1,900-line installer to find `NONINTERACTIVE=true`; ran `NONINTERACTIVE=true bash get_vvm.sh > log`.
- **Expected:** A documented `--yes`/non-interactive flag and concise output.
- **Actual:** Worked, but the flag is only discoverable in the script source, and the progress bars wrote a 2.5 MB log of carriage-return frames.
- **Severity:** papercut
- **Workaround:** Read the script; `tail -c` the log.
- **Suggestion (actionable):** Document `NONINTERACTIVE=true` on the install page and disable progress bars when stdout isn't a TTY.
- **Date:** 2026-10-16

### Reaching a dev server on the host from the VVD needs reverse port forwarding — not mentioned in networking/app docs
- **Tool/SDK:** Vega CLI `vega device`, Vega Virtual Device
- **Task attempted:** Connect the TV app's WebSocket to a relay running on the Mac.
- **Steps taken:** Looked for the host's address from inside the VVD; eventually found `vega device start-port-forwarding -p 8080 -f false` in `--help`.
- **Expected:** A doc note like Android's `10.0.2.2` / `adb reverse` guidance.
- **Actual:** Worked well once found (`curl` from `vega device run-cmd` confirmed it).
- **Severity:** minor
- **Workaround:** Reverse-forward the port; the app uses `ws://localhost:8080/ws`.
- **Suggestion (actionable):** Add a "talking to a local server from the VVD" section to the networking docs and to the hello-world template README.
- **Date:** 2026-10-16

### Audio-only playback with W3C Media isn't shown in the main media-player guide
- **Tool/SDK:** `@amazon-devices/react-native-w3cmedia` 2.3.2
- **Task attempted:** Play a short MP3 (Polly coach line) with no video surface.
- **Steps taken:** Read the "W3C Media API in React Native for Vega" guide — it only shows `VideoPlayer` + `KeplerVideoView`.
- **Expected:** An audio-only URL-mode snippet.
- **Actual:** Found `AudioPlayer` (`new AudioPlayer(); await initialize(); src = url; play()`) only in the package README inside `node_modules`.
- **Severity:** minor
- **Workaround:** Followed the package README.
- **Suggestion (actionable):** Add an "Audio-only (MP3 URL)" example to the guide, including whether any manifest privilege is needed.
- **Date:** 2026-10-16

### No first-class way to send remote keys or screen-record the VVD from the CLI
- **Tool/SDK:** Vega CLI, Vega Virtual Device
- **Task attempted:** Automate D-pad testing and record the demo video.
- **Steps taken:** Listed `/usr/bin` on the device via `vega device run-cmd` and found `inputd-cli button_press KEY_ENTER`; recorded the VVD window with macOS screen capture.
- **Expected:** Something like `vega device send-key select` and `vega device screenrecord`.
- **Actual:** `inputd-cli` works well (short/long press, text, touch) but is undocumented from the host side; no screen recording command.
- **Severity:** minor
- **Workaround:** `tools/mac/tv.sh` wraps `inputd-cli` and `screencapture -l <VVD window>`.
- **Suggestion (actionable):** Expose `vega device key <name>` and `vega device screenrecord`, and document `inputd-cli` for test automation.
- **Date:** 2026-10-16

### "Kepler" and "Vega" names are mixed across packages and config
- **Tool/SDK:** React Native for Vega template
- **Task attempted:** Understand which package does what.
- **Actual:** CLI is `vega`, but packages are `@amazon-devices/react-native-kepler`, `kepler-cli-platform`, `KeplerVideoView`, a `kepler` key in `package.json`, and `useKeplerBackHandler` in docs vs `BackHandler` in types.
- **Severity:** papercut
- **Suggestion (actionable):** Add a one-paragraph "Kepler = Vega" note to the template README until the rename lands.
- **Date:** 2026-10-16

### W3C Media playback fails with a bare `MediaError 4` when manifest services are missing — or when the URL is a forwarded `localhost`
- **Tool/SDK:** `@amazon-devices/react-native-w3cmedia` 2.3.2 `AudioPlayer`, Vega Virtual Device
- **Task attempted:** Play the coach's MP3 from the relay.
- **Steps taken:** (1) `AudioPlayer.initialize()` → `src = url` → `play()` with the template manifest. (2) Added the `[[wants.service]]` entries from "Media Player Setup". (3) Tried `http://localhost:8080/x.mp3` (reverse-forwarded, the same path the app's WebSocket uses) and then the public `https://` tunnel URL.
- **Expected:** Playback, or a JS error saying what's missing.
- **Actual:** (1) `play()` resolved but the device log showed `Binder: Unable connect to 'com.amazon.audio.control'` / `playersession.service` and `makeMediaError: code= 4 msg =` — nothing reached JS beyond code 4. (2) Fixed the binder errors, but the forwarded-localhost URL still failed with code 4 and the server never saw a request: the media pipeline apparently fetches from a different network context than the app. (3) The HTTPS URL played (`canplay` → `ended`).
- **Severity:** major
- **Workaround:** Added the media services to `manifest.toml`; coach audio is always served from the public HTTPS base URL.
- **Suggestion (actionable):** Put a non-empty message on MediaError (e.g. "missing service com.amazon.audio.control in manifest" / "network fetch failed"), add the services to templates when `react-native-w3cmedia` is installed via `vega project install`, and document that media URLs can't use reverse-forwarded localhost ports.
- **Date:** 2026-10-16

### Every build warns `build_number is 0`
- **Tool/SDK:** `react-native build-vega` / `vega vtbuild`
- **Actual:** The fresh template prints the warning 3× per build (once per architecture).
- **Severity:** papercut
- **Suggestion (actionable):** Put `build_number = 1` in the template's `manifest.toml`.
- **Date:** 2026-10-16

### AWS App Runner can't host the relay (no WebSockets)
- **Tool/SDK:** AWS App Runner
- **Task attempted:** Pick the simplest managed-TLS container host for a WebSocket relay (our PRD's first choice).
- **Actual:** App Runner still doesn't support WebSocket connections ([re:Post](https://repost.aws/questions/QU0jOAcOoTQqigUj6B9oGDxg/websockets-on-apprunner)).
- **Severity:** major (for this architecture)
- **Workaround:** Same Docker image on EC2/Lightsail with Caddy for TLS, or ECS + ALB.
- **Suggestion (actionable):** WebSocket support in App Runner, or a prominent "not supported" line in its docs/console.
- **Date:** 2026-10-16

### What went smoothly (for balance)
- `vega project install <pkg>` resolved OS-compatible versions of `react-native-svg` and `w3cmedia` and printed the device features they need — very helpful.
- The hello-world template built and ran on the VVD on the first try; the VVD booted in under a minute.
- Standard `WebSocket`, `react-native-svg`, `Animated` and `BackHandler` all behaved exactly like React Native elsewhere.
