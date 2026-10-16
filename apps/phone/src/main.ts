import { createPoseCamera, type PoseCamera } from "pose-relay/phone";
import { msg, parse, RelayToPhone, TIP_TEXT, type Exercise, type GameEvent, type RelayToPhone as In } from "@huddle/protocol";
import { BONES, createRepCounter, createShotDetector, fullBodyVisible, makeSmoother, puppet, type Hand, type Landmarks, type PuppetMeta } from "@huddle/scoring";
import avatarMeta from "../public/avatar/parts.json" with { type: "json" };
import { simPlayer, toLandmarks } from "../../../fixtures/synth.ts";

const SEND_EVERY_MS = 1000 / 15; // P4: 15 fps pose stream
const q = new URLSearchParams(location.search);
const DEBUG = q.has("debug"), RECORD = q.has("record"), SIM = q.has("sim");
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string) => document.querySelectorAll<HTMLElement>(".screen").forEach((s) => (s.hidden = s.id !== id));
const fail = (text: string) => { $("errorText").textContent = text; show("error"); };

// ---- Join form (room code from /r/CODE) ----
const codeIn = $<HTMLInputElement>("code"), nameIn = $<HTMLInputElement>("name");
codeIn.value = location.pathname.match(/\/r\/([A-Za-z0-9]{4})/)?.[1]?.toUpperCase() ?? "";
nameIn.value = localStorage.getItem("huddle:name") ?? "";
if (codeIn.value) nameIn.focus();

$("joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  const code = String(f.get("code")).toUpperCase(), name = String(f.get("name") ?? "").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 16);
  localStorage.setItem("huddle:name", name);
  hand = f.get("hand") as Hand;
  try {
    if (!SIM) await startCamera(f.get("cam") as string);
  } catch (err) {
    const n = (err as DOMException).name;
    return fail(n === "NotAllowedError" ? "Camera access was blocked. Allow camera for this site in your browser settings, then try again."
      : !window.isSecureContext ? "This page must be opened over https:// to use the camera."
      : "We couldn't start your camera. Close other apps using it, or try the other camera.");
  }
  show("stage");
  connect(code, name);
  loop();
});

// ---- Camera + pose model ----
const video = $<HTMLVideoElement>("video"), canvas = $<HTMLCanvasElement>("overlay"), ctx = canvas.getContext("2d")!;
let camera: PoseCamera | null = null;

async function startCamera(facingMode: string) {
  camera = await createPoseCamera(video, { facingMode: facingMode as "user" | "environment", wasmBase: "/wasm" });
  video.classList.toggle("mirror", facingMode === "user");
}

// ---- Connection to the relay ----
let ws: WebSocket | null = null, connected = false, clockOffset = 0;
let me: { playerId: string; color: string; slot: number } | null = null;
let game: { state: string; mode: string | null; exercise?: Exercise; round: number } = { state: "", mode: null, round: 0 };

function connect(code: string, name: string) {
  const tokenKey = `huddle:token:${code}`;
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => {
    ws!.send(msg({ type: "join", code, name: name || undefined, sessionToken: localStorage.getItem(tokenKey) ?? undefined }));
    syncClock();
  };
  ws.onmessage = (ev) => {
    const m = parse(RelayToPhone, String(ev.data));
    if (m) onMessage(m, tokenKey);
  };
  ws.onclose = () => { setConnected(false); setTimeout(() => connect(code, name), 2000); }; // R4: rejoin with the stored token
}

function onMessage(m: In, tokenKey: string) {
  if (m.type === "joined") {
    me = m; setConnected(true);
    localStorage.setItem(tokenKey, m.sessionToken);
    $("swatch").style.background = m.color;
    $("who").textContent = `P${m.slot + 1} · ${nameIn.value || `Player ${m.slot + 1}`}`;
  } else if (m.type === "ping") ws?.send(msg({ type: "pong", t: m.t }));
  else if (m.type === "pong" && m.t && m.now) clockOffset = m.now - (m.t + (Date.now() - m.t) / 2);
  else if (m.type === "error") {
    if (m.code === "room_full") { ws!.onclose = null; fail("This room is full (4 players max). Wait for the next game!"); }
    if (m.code === "no_room") { ws!.onclose = null; fail("No room with that code. Check the code on the TV."); }
  } else if (m.type === "game_state") onGameState(m);
}

function syncClock() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(msg({ type: "ping", t: Date.now() }));
  setTimeout(syncClock, 5000);
}

function setConnected(on: boolean) {
  connected = on;
  $("dot").classList.toggle("on", on);
  $("dot").setAttribute("aria-label", on ? "connected" : "reconnecting");
}

// ---- Game state -> detectors ----
let hand: Hand = "right";
let detectShot: ReturnType<typeof createShotDetector> | null = null;
let countRep: ReturnType<typeof createRepCounter> | null = null;
let reps = 0;
const LABEL: Record<string, string> = { free_throw: "Free Throw", boot_camp: "Boot Camp", squat: "Squats", jumping_jack: "Jumping jacks", high_knees: "High knees" };

function onGameState(m: Extract<In, { type: "game_state" }>) {
  const changed = m.state !== game.state || m.exercise !== game.exercise || m.mode !== game.mode;
  game = m;
  if (!changed) return;
  detectShot = m.state === "ROUND" && m.mode === "free_throw" ? createShotDetector(hand) : null;
  countRep = m.state === "ROUND" && m.mode === "boot_camp" && m.exercise ? createRepCounter(m.exercise) : null;
  reps = 0;
  $("feedback").textContent = "";
  $("status").textContent =
    m.state === "LOBBY" ? "In the lobby — the host picks a game" :
    m.state === "COUNTDOWN" ? `Get ready: ${LABEL[m.mode ?? ""] ?? ""}!` :
    m.state === "ROUND" ? (m.mode === "boot_camp" ? `Go! ${LABEL[m.exercise ?? ""] ?? ""}` : "Shoot! 5 free throws") : "Round over — look at the TV!";
}

function onEvent(e: GameEvent) {
  ws?.send(msg({ type: "event", event: e }));
  if (e.kind === "shot") $("feedback").textContent = `Shot: ${e.score} — ${e.score >= 90 ? "Perfect form!" : TIP_TEXT[e.tip]}`;
  else $("feedback").textContent = `${++reps} reps${e.quality === "good" ? " ✓" : " (go deeper!)"}`;
}

// ---- Frame loop: pose -> smoothing -> scoring -> stream ----
const smooth = makeSmoother(0.5);
// ?sim=<0..1> sets the simulated player's form quality (default random).
const sim = SIM ? simPlayer(Number(q.get("sim")) || 0.6 + Math.random() * 0.35, Math.floor(Math.random() * 1000)) : null;
const simRnd = Math.random;
const recording: { t: number; lm: Landmarks }[] = [];
let lastSend = 0, lastSimFrame = -1, fullSince = 0, calibrated = false, frames = 0, fpsAt = performance.now(), fps = 0, recOn = false;

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  let raw: Landmarks | null = null;
  if (sim) {
    if (now - lastSimFrame < 33) return;
    lastSimFrame = now;
    raw = toLandmarks(sim(game, now), simRnd);
  } else {
    const r = camera?.read(now);
    if (r === undefined) return; // no new video frame yet
    raw = r;
  }
  frames++;
  if (now - fpsAt > 1000) { fps = frames; frames = 0; fpsAt = now; if (DEBUG) $("debug").textContent = `${fps} fps · offset ${Math.round(clockOffset)} ms · ${SIM ? "sim" : "camera"}`; }
  draw(raw);
  if (!raw) return calibrate(false, now);
  if (recOn) recording.push({ t: Math.round(now), lm: raw });
  const lm = smooth(raw);
  calibrate(fullBodyVisible(lm), now);

  const e = game.state === "ROUND" ? (detectShot?.(lm, now) ?? countRep?.(lm) ?? null) : null;
  if (e) onEvent(e);
  if (connected && now - lastSend >= SEND_EVERY_MS) {
    lastSend = now;
    // P6: only landmark numbers are ever sent — never image data.
    ws!.send(msg({ type: "pose", t: Math.round(Date.now() + clockOffset), lm }));
  }
}

function calibrate(full: boolean, now: number) {
  fullSince = full ? fullSince || now : 0;
  const ok = full && now - fullSince > 1000; // P3: all key joints visible for 1 s
  if (ok === calibrated) return;
  calibrated = ok;
  const el = $("calib");
  el.classList.toggle("ok", ok);
  el.textContent = ok ? "✓ All set! You're on the TV." : "Step back until your whole body is in frame";
}

function draw(lm: Landmarks | null) {
  if ($("preview").classList.contains("off")) return;
  const w = (canvas.width = canvas.clientWidth), h = (canvas.height = canvas.clientHeight);
  ctx.clearRect(0, 0, w, h);
  if (sim) { ctx.fillStyle = "#151c38"; ctx.fillRect(0, 0, w, h); }
  if (!lm) return;
  if (sim) return drawPuppet(lm, w, h);
  // Undo the image-height x units for drawing on the (mirrored, cover-fitted) preview.
  const ar = camera?.aspect() ?? 1;
  const X = sim ? (x: number) => (x - 0.5) * h + w / 2 : (x: number) => ((x - 0.5) / ar + 0.5) * w, Y = (y: number) => y * h;
  ctx.strokeStyle = me?.color ?? "#fff"; ctx.lineWidth = 6; ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    ctx.beginPath(); ctx.moveTo(X(lm[a * 3]), Y(lm[a * 3 + 1])); ctx.lineTo(X(lm[b * 3]), Y(lm[b * 3 + 1])); ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(X(lm[0]), Y(lm[1]), 14, 0, Math.PI * 2); ctx.fill();
}

// Sim mode shows the player's own Blender-rendered character (same rig as the TV).
const sprites = new Map<string, HTMLImageElement>();
function drawPuppet(lm: Landmarks, w: number, h: number) {
  const slot = (me?.slot ?? 0) + 1;
  for (const p of puppet(lm, avatarMeta as PuppetMeta)) {
    const src = `/avatar/p${slot}_${p.part}.png`;
    let img = sprites.get(src);
    if (!img) { img = new Image(); img.src = src; sprites.set(src, img); }
    if (!img.complete) continue;
    ctx.save();
    ctx.translate((p.cx - 0.5) * h + w / 2, p.cy * h);
    ctx.rotate(p.angle);
    ctx.drawImage(img, (-p.w * h) / 2, (-p.h * h) / 2, p.w * h, p.h * h);
    ctx.restore();
  }
}

// ---- Controls ----
$("togglePreview").addEventListener("click", (e) => {
  const off = $("preview").classList.toggle("off");
  (e.target as HTMLButtonElement).textContent = off ? "Show preview" : "Hide preview";
});
if (DEBUG) $("debug").hidden = false;
if (RECORD) {
  // ?record=1: capture a landmark sequence for scoring fixtures (downloads JSON, nothing is uploaded).
  const btn = $<HTMLButtonElement>("record");
  btn.hidden = false;
  btn.onclick = () => {
    recOn = !recOn;
    btn.textContent = recOn ? "■ Stop & save" : "● Record";
    if (recOn) { recording.length = 0; return; }
    const blob = new Blob([JSON.stringify({ meta: { source: "phone", ua: navigator.userAgent, hand }, frames: recording })], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `huddle-recording-${Date.now()}.json` });
    a.click();
  };
}
