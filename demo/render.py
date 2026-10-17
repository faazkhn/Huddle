"""Edits the demo video from out/raw.mov (see record.py) + out/vo (see tts.py).
Builds out/timeline.js, renders editor.html frame by frame in Chrome, mixes the voiceover, and writes
out/huddle-demo.mp4 + out/huddle-demo.srt.  Usage: python demo/render.py [--preview SECONDS] [--from SECONDS]"""
import json, os, pathlib, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
FPS = 30
M = json.loads((OUT / "markers.json").read_text())
mk, tvw, cw, inner = M["marks"], M["tv"], M["chrome"], M["inner"]
VO = json.loads((HERE / "voiceover.json").read_text())["scenes"]


def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout)


def words(name):
    """edge-tts word boundaries with punctuation restored from the script."""
    ws = json.loads((OUT / "vo" / f"{name}.words.json").read_text())
    tokens, j = VO[name].split(), 0
    norm = lambda s: re.sub(r"[^\w'-]", "", s).lower()
    for w in ws:
        for k in range(j, min(j + 3, len(tokens))):
            if norm(tokens[k]).startswith(norm(w["w"])[:3]):
                w["w"], j = tokens[k], k + 1
                break
    return ws


# Crop rectangles in capture pixels (Retina 2x). VVD title bar = 28 pt; Chrome app title bar = window h - inner h.
S = 2
tv_crop = (tvw["w"] * S, (tvw["h"] - 28) * S, tvw["x"] * S, (tvw["y"] + 28) * S)
bar = cw["h"] - inner[1]
ph_crop = (inner[0] * S, (inner[1] - 40) * S, cw["x"] * S, (cw["y"] + bar) * S)  # trim the bottom: Dock tooltips can appear there

m = mk
# TV-space (1920x1080) callout targets, measured from the recording.
QR, CODE, SLOTS, CARDS = (352, 280), (352, 612), (1240, 300), (560, 952)
FT_SCORE, FT_TIP, FT_HOOP = (304, 708), (304, 776), (1180, 248)
RES_FIRST, RES_COACH = (300, 300), (960, 620)
BC_REPS, LAT, RECON = (308, 812), (1560, 108), (800, 668)


def C(text, at, xy, dx, dy, until=None):
    c = {"text": text, "at": at, "x": xy[0], "y": xy[1], "dx": dx, "dy": dy}
    if until is not None: c["until"] = until
    return c


PLAN = [
    dict(name="cold", kind="live", layout="full", clips=[(m["ft_start"] + 6, None)], section="Huddle", sectionSub="A motion party game for Fire TV, built on Vega OS"),
    dict(name="problem", kind="graphic"),
    dict(name="setup1", kind="live", layout="full", clips=[(m["start"] + 0.3, None)], section="How it works", sectionSub="Step 1 · Launch Huddle on Fire TV",
         callouts=[C("Scan the QR code", "qr", QR, 260, -60), C("…or type the room code", "four-letter", CODE, 300, 40)]),
    dict(name="setup2", kind="live", layout="split", clips=[(m["type_name"] - 1.2, None)], step=["2", "Scan & join", "A web page opens — no app to install, no account"]),
    dict(name="setup3", kind="live", layout="phone", clips=[(m["joined"] + 0.3, None)]),
    dict(name="setup4", kind="live", layout="full", clips=[(m["bots"] - 0.4, None)], section="How it works", sectionSub="Step 4 · Up to four players, then pick a game",
         callouts=[C("Own character, color & number", "character", SLOTS, 120, -150, "host"), C("Pick a game with the remote", "remote", CARDS, 520, -40)],
         keys=[{"at": m["dpad"] - m["bots"] + 0.4, "len": 1.5, "key": "▶", "text": "D-pad"}, {"at": m["dpad"] - m["bots"] + 1.9, "len": 3, "key": "◀", "text": "D-pad"}]),
    dict(name="ft1", kind="live", layout="full", clips=[(m["ft_start"] - 0.2, None)], section="Free Throw", sectionSub="5 shots each · everyone shoots at once",
         callouts=[C("Live form score · 0–100", "scores", FT_SCORE, 300, -60)]),
    dict(name="ft2", kind="live", layout="panel", clips=[(m["ft_start"] + 9, None)],
         callouts=[C("Instant coaching tip", "tip", FT_TIP, 260, 80), C("≥ 70 — swish!", "seventy", FT_HOOP, 120, -110)]),
    dict(name="results", kind="live", layout="full", clips=[(m["ft_results"] - 0.1, None)], section="Results + AI coach", sectionSub="Amazon Bedrock writes it · Amazon Polly voices it", note="Coach shown: built-in fallback line (this recording ran without AWS credentials)",
         callouts=[C("Ranked — ties share a place", "ranks", RES_FIRST, 360, 230, "coach"), C("AI coach: winner + one tip", "coach", RES_COACH, 260, 150)]),
    dict(name="bc1", kind="live", layout="full", clips=[(m["bc_start"] - 0.2, 5.6), (m["bc_start"] + 44.5, None)], section="Family Boot Camp", sectionSub="3 × 40 s · squats, jumping jacks, high knees"),
    dict(name="bc2", kind="live", layout="panel", clips=[(m["bc_start"] + 21, 4.4), (m["bc_start"] + 65, 4.4), (m["bc_start"] + 118, 4.0), (m["bc_results"] + 0.3, None)],
         callouts=[C("Live rep counter", "counted", BC_REPS, 360, 40, "good")]),
    dict(name="remote", kind="live", layout="full", clips=[(m["back_dialog"] - 0.3, 4.0), (m["menu_on"] - 0.2, 3.3), (m["phone_drop"] - 0.1, 2.6), (m["rejoin"] + 0.1, None)],
         section="Built for the remote"),
    dict(name="arch", kind="graphic"),
    dict(name="oss", kind="graphic"),
    dict(name="outro", kind="graphic"),
]

scenes, t = [], 0.0
for p in PLAN:
    name = p["name"]
    lead = 0.4 if name == "cold" else 0.25
    d = lead + dur(OUT / "vo" / f"{name}.mp3") + 0.35 + (1.4 if name == "outro" else 0)
    sc = {**p, "start": round(t, 3), "dur": round(d, 3), "voStart": lead, "words": words(name)}
    clips, at = [], 0.0
    for i, (src, length) in enumerate(p.get("clips", [])):
        length = length if length is not None else d - at
        clips.append({"id": f"{name}{i}", "src": round(src, 3), "at": round(at, 3), "len": round(length, 3)})
        at += length
    sc["clips"] = clips
    scenes.append(sc)
    t += d
scenes[-1]["last"] = True
total = t

# Remote scene: key chips + callouts timed to its montage clips.
remote = next(s for s in scenes if s["name"] == "remote")
rc = remote["clips"]
remote["keys"] = [
    {"at": rc[0]["at"] + 0.4, "len": rc[1]["at"] - rc[0]["at"] - 0.4, "key": "↩", "text": "Back — asks before quitting"},
    {"at": rc[1]["at"] + 0.3, "len": rc[1]["len"] - 0.3, "key": "☰", "text": "Menu — live latency overlay"},
    {"at": rc[2]["at"] + 0.1, "len": rc[2]["len"], "key": "📱", "text": "Phone drops out — slot waits"},
    {"at": rc[3]["at"] + 0.2, "len": 99, "key": "📱", "text": "Rejoin — right back in"},
]
remote["callouts"] = [C("p50 / p95 latency per player", rc[1]["at"] + 0.6, LAT, -120, 200, rc[2]["at"]),
                      C("Reconnecting… (60 s)", rc[2]["at"] + 0.9, RECON, 300, 120, rc[3]["at"])]
print(f"total {total:.1f}s")
assert total < 180, "demo must stay under 3 minutes"

# Extract live clips as JPEG frames (TV + phone crops).
for sc in scenes:
    for c in sc["clips"]:
        d = OUT / "frames" / c["id"]
        n = int(c["len"] * FPS) + 2
        if not (d / f"tv_{n - 2:05d}.jpg").exists():
            d.mkdir(parents=True, exist_ok=True)
            for f in d.glob("*.jpg"): f.unlink()
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(max(0, c["src"])), "-t", str(c["len"] + 0.1), "-i", str(OUT / "raw.mov"),
                            "-filter_complex", f"[0]fps={FPS},split[a][b];[a]crop={':'.join(map(str, tv_crop))}[tv];[b]crop={':'.join(map(str, ph_crop))},scale=800:-2[ph]",
                            "-map", "[tv]", "-q:v", "2", str(d / "tv_%05d.jpg"), "-map", "[ph]", "-q:v", "2", str(d / "ph_%05d.jpg")], check=True)
        c["frames"] = len(list(d.glob("tv_*.jpg")))

(OUT / "timeline.js").write_text("window.TIMELINE = " + json.dumps({"fps": FPS, "scenes": scenes, "phoneAspect": ph_crop[0] / ph_crop[1], "repo": os.environ.get("REPO_URL")}) + ";")


# Captions (.srt) from the word timings: short lines, broken at punctuation.
def ts(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


cues = []
for sc in scenes:
    cur = []
    base = sc["start"] + sc["voStart"]
    for i, w in enumerate(sc["words"]):
        cur.append(w)
        if re.search(r"[.,!?:;]$", w["w"]) or len(cur) >= 7 or i == len(sc["words"]) - 1:
            cues.append((base + cur[0]["t"], base + cur[-1]["t"] + cur[-1]["d"] + 0.15, " ".join(x["w"] for x in cur)))
            cur = []
(OUT / "huddle-demo.srt").write_text("\n".join(f"{i + 1}\n{ts(a)} --> {ts(b)}\n{txt}\n" for i, (a, b, txt) in enumerate(cues)))

# Audio: voiceover only (no music), normalized for YouTube.
inputs, filters = [], []
for i, sc in enumerate(scenes):
    inputs += ["-i", str(OUT / "vo" / f"{sc['name']}.mp3")]
    ms = int((sc["start"] + sc["voStart"]) * 1000)
    filters.append(f"[{i}]aresample=48000,adelay={ms}|{ms},apad[v{i}]")
filters.append("".join(f"[v{i}]" for i in range(len(scenes))) + f"amix=inputs={len(scenes)}:normalize=0,atrim=0:{total},loudnorm=I=-16:TP=-1.5:LRA=11[a]")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[a]", "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k", str(OUT / "audio.m4a")], check=True)

preview = float(sys.argv[sys.argv.index("--preview") + 1]) if "--preview" in sys.argv else None
start = float(sys.argv[sys.argv.index("--from") + 1]) if "--from" in sys.argv else 0.0
frames = int((preview or total - start) * FPS)
target = OUT / ("preview.mp4" if preview else "huddle-demo.mp4")
enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
                        "-ss", str(start), "-i", str(OUT / "audio.m4a"), "-map", "0:v", "-map", "1:a", "-shortest",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(target)], stdin=subprocess.PIPE)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    pg.goto((HERE / "editor.html").as_uri())
    t0 = time.time()
    for f in range(frames):
        pg.evaluate(f"render({start + f / FPS})")
        enc.stdin.write(pg.screenshot(type="jpeg", quality=93))
        if f % 600 == 0: print(f"frame {f}/{frames}  {time.time() - t0:.0f}s", flush=True)
    b.close()
enc.stdin.close(); enc.wait()
print("done", target)
