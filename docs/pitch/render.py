# Renders deck.html to docs/Huddle-Pitch-Deck.pdf (needs: pip install playwright).
from pathlib import Path
from playwright.sync_api import sync_playwright

here = Path(__file__).resolve().parent
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto((here / "deck.html").as_uri())
    page.pdf(path=str(here.parent / "Huddle-Pitch-Deck.pdf"), width="1920px", height="1080px", print_background=True)
    browser.close()
