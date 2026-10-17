"""Records the live demo: Vega Virtual Device (TV) + a phone page (Chrome app window), driven by D-pad key injection.
Writes demo/out/raw.mov (full-screen capture) and demo/out/markers.json (event times + window geometry).
Prereqs: relay running with a public PUBLIC_BASE_URL, VVD running, TV app built, `vega device start-port-forwarding -p 8080 -f false`.
Usage: python demo/record.py <relay-log-path>
"""
import json, pathlib, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
TV = str(ROOT / "tools/mac/tv.sh")
relay_log = pathlib.Path(sys.argv[1])

def sh(*a): return subprocess.run(a, capture_output=True, text=True).stdout
def vega(cmd): return subprocess.run(["bash", "-lc", f"source ~/vega/env && {cmd}"], capture_output=True, text=True).stdout
def key(k): subprocess.run([TV, "key", k])
def window(owner):
    for line in sh("swift", str(ROOT / "tools/mac/winid.swift")).splitlines():
        if owner in line:
            m = re.search(r"(-?\d+),(-?\d+) (\d+)x(\d+)", line)
            return dict(zip("xywh", map(int, m.groups())))

# Fresh TV app -> fresh room.
n_rooms = relay_log.read_text().count("room ")
vega("vega device terminate-app --appName com.huddle.tv.main; vega device launch-app --appName com.huddle.tv.main")
for _ in range(30):
    rooms = re.findall(r"room (\w{4}) -> (\S+)", relay_log.read_text())
    if len(rooms) > n_rooms: break
    time.sleep(0.5)
code, join_url = rooms[-1]
print("room", code, join_url)
subprocess.run(["osascript", "-e", 'tell application "System Events" to tell process "vega-virtual-device" to set position of window 1 to {20, 60}'])
subprocess.run(["osascript", "-e", 'tell application "System Events" to set frontmost of process "vega-virtual-device" to true'])

marks, t0 = {}, None
def mark(name):
    marks[name] = round(time.time() - t0, 3); print(f"{marks[name]:7.2f}s  {name}")

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        str(OUT / "chrome-profile"), channel="chrome", headless=False, no_viewport=True, ignore_default_args=["--enable-automation"],
        args=[f"--app={join_url}?sim=0.97", "--window-position=1010,100", "--window-size=400,800", "--hide-scrollbars"])
    time.sleep(3)
    page = next(pg for pg in ctx.pages if code in pg.url)
    page.evaluate("localStorage.clear()")
    page.reload(); time.sleep(2)
    chrome = window("Google Chrome")
    inner = page.evaluate("[window.innerWidth, window.innerHeight]")
    tv = window("vega-virtual-device")

    rec = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "avfoundation", "-framerate", "30", "-capture_cursor", "0",
                            "-pixel_format", "nv12", "-i", "2:none", "-c:v", "h264_videotoolbox", "-b:v", "30M", "-g", "30", str(OUT / "raw.mov")],
                           stdin=subprocess.PIPE)
    time.sleep(1.0)
    t0 = time.time(); mark("start")
    def wait_status(text):
        while text not in page.inner_text("#status"): time.sleep(0.2)
    time.sleep(4); mark("type_name")
    page.click("#name"); page.type("#name", "Sam", delay=200)
    time.sleep(0.8); page.click("button[type=submit]"); mark("joined")
    time.sleep(4); bots = subprocess.Popen(["node", str(ROOT / "tools/bots.ts"), code, "3"]); mark("bots")
    time.sleep(6); key("KEY_RIGHT"); mark("dpad"); time.sleep(1.5); key("KEY_LEFT"); time.sleep(1.5)
    key("KEY_ENTER"); mark("ft_start")
    wait_status("Round over"); mark("ft_results"); time.sleep(12)
    key("KEY_RIGHT"); time.sleep(0.8); key("KEY_ENTER"); mark("lobby"); time.sleep(2.5)
    key("KEY_RIGHT"); time.sleep(0.8); key("KEY_ENTER"); mark("bc_start")
    wait_status("Round over"); mark("bc_results"); time.sleep(10)
    key("KEY_RIGHT"); time.sleep(0.8); key("KEY_ENTER"); time.sleep(2)  # back to the lobby
    key("KEY_ENTER"); mark("ft2_start"); time.sleep(7)
    key("KEY_BACK"); mark("back_dialog"); time.sleep(2.5)
    key("KEY_RIGHT"); mark("quit_focus"); time.sleep(1.5); key("KEY_ENTER"); mark("quit"); time.sleep(2.5)
    key("KEY_MENU"); mark("menu_on"); time.sleep(6); key("KEY_MENU"); mark("menu_off"); time.sleep(1.5)
    page.goto("about:blank"); mark("phone_drop"); time.sleep(5)
    page.goto(f"{join_url}?sim=0.97"); time.sleep(1.5); page.click("#name"); page.type("#name", "Sam", delay=120); page.click("button[type=submit]"); mark("rejoin")
    time.sleep(5)
    rec.communicate(b"q"); mark("end")
    bots.terminate(); ctx.close()

(OUT / "markers.json").write_text(json.dumps({"marks": marks, "tv": tv, "chrome": chrome, "inner": inner, "code": code}, indent=2))
print(json.dumps({"tv": tv, "chrome": chrome, "inner": inner}))
