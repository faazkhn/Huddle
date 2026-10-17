# Generates demo/out/vo/<scene>.mp3 + <scene>.words.json (word timings) with edge-tts. Usage: python tts.py
import asyncio, json, pathlib, edge_tts
here = pathlib.Path(__file__).parent
cfg = json.loads((here / "voiceover.json").read_text())
out = here / "out" / "vo"; out.mkdir(parents=True, exist_ok=True)

async def scene(name, text):
    c = edge_tts.Communicate(text, cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"], boundary="WordBoundary")
    words, audio = [], bytearray()
    async for ch in c.stream():
        if ch["type"] == "audio": audio += ch["data"]
        elif ch["type"] == "WordBoundary": words.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    (out / f"{name}.mp3").write_bytes(audio)
    (out / f"{name}.words.json").write_text(json.dumps(words))

async def main():
    for k, v in cfg["scenes"].items(): await scene(k, v)
asyncio.run(main())
