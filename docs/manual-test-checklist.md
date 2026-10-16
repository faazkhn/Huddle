# Manual test checklist (UI + device glue)

Run on the Vega Virtual Device with `tools/mac/tv.sh key KEY_*` for remote input. ✅ = verified during the build (2026-10-16); ⬜ = needs physical hardware.

## TV (Vega Virtual Device)
- ✅ Launch → lobby shows QR + 4-letter code within ~2 s; QR decodes to `https://<relay>/r/<CODE>` (checked with OpenCV).
- ✅ 4 players join → 4 live Blender-rendered characters (own look, color, number) with "P# · Name" labels (color is never the only identifier).
- ✅ D-pad Left/Right moves focus between game cards with a large focus ring; Select starts a 3-2-1 countdown.
- ✅ Select with no players → caption "Scan the QR code with a phone to join first!"
- ✅ Free Throw: per-lane score, tip, 5 shot dots, ball arc (in if ≥ 70), "Swish!" callout caption; ends when all have 5 shots → results.
- ✅ Boot Camp: 3 × 40 s with 10 s "up next" rests and a demo pictogram, live rep counters, "Ten seconds left" + "Rest up" callouts → results.
- ✅ Results: ranked cards, highlight stat, coach caption, Play again / Change game via D-pad.
- ✅ Back during a round → "Quit this round?" dialog (Keep playing focused); Back on results → lobby.
- ✅ Menu toggles the latency overlay (p50 27 ms / p95 30 ms through a public tunnel).
- ✅ Phone disconnect → slot greys out "Reconnecting…"; after 60 s the slot frees and a new player takes it.
- ✅ Relay restart → TV reconnects automatically and gets a new room.
- ✅ Coach MP3 plays through W3C Media `AudioPlayer` (device log: `canplay` → `ended`).
- ⬜ Real Fire TV device.

## Phone page
- ✅ `/r/CODE` pre-fills the code; join → stage screen with color, "P# · Name", status, connection dot.
- ✅ Camera path in Chrome (fake camera) over HTTPS: MediaPipe runs (55 fps GPU), calibration shows "Step back…".
- ✅ `?sim=1` → "All set", skeleton overlay, shot/rep feedback, state text follows the TV.
- ✅ 5th player → "This room is full".
- ✅ Reload → same slot via session token.
- ✅ Hide/show preview toggle.
- ⬜ iOS Safari 16+ and Android Chrome on real phones; ≥ 20 fps on an iPhone 12 / Pixel 6 class device.
- ⬜ Camera-denied flow on a real phone (message path exists in `apps/phone/src/main.ts`).
- ⬜ Real recordings via `?record=1` replacing the synthetic fixtures.
