# Open Source mini challenge — `pose-relay`

- **Repo URL:** https://github.com/faazkhn/Huddle
- **Contribution URL:** https://github.com/faazkhn/Huddle/tree/main/packages/pose-relay (MIT, own [LICENSE](../packages/pose-relay/LICENSE))
- **GitHub username:** faazkhn

## What
`pose-relay` turns the phones people already own into body-pose cameras for a big screen. A phone opens a web page, runs Google MediaPipe Pose on-device, and streams 33 keypoints (never video) to a TV/big-screen app through tiny WebSocket rooms with QR-code joining.

## How
- **Server** (`createPoseRelay`): transport-agnostic room manager — 4-letter codes without ambiguous characters, join with session tokens (rejoin within 60 s keeps your slot), heartbeats, per-connection rate limits, pluggable validation, screen→phones state broadcast, and a hook for app messages. ~170 lines, no dependencies.
- **Phone** (`createPoseCamera`): getUserMedia + MediaPipe PoseLandmarker (GPU with CPU fallback) → mirrored, aspect-corrected keypoint arrays ready for angle math.
- **Example:** `examples/minimal` — a server plus two HTML pages; open the screen page, scan with a phone, see your skeleton.

## Why it matters
Fire TV and most smart TVs have no camera, which locks them out of motion games, fitness feedback and physical therapy. Every household has 2–4 cameras in their pockets. `pose-relay` gives any Fire TV / React Native / web big-screen app multi-player motion sensing in an afternoon, privately — Huddle is built on it.
