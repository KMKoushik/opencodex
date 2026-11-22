"""Capture native pages against an isolated gateway and pair with the web oracle.

Run from apps/rune after cargo build --release. Pillow is needed for the pairs.
OCR_PAGES_GATEWAY and OCR_PAGES_PROJECT select the disposable fixture.
"""
import os
import subprocess
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root / "goldens/pages"
out.mkdir(exist_ok=True)
env = {
    **os.environ,
    "OPENCODEX_GATEWAY": os.environ.get("OCR_PAGES_GATEWAY", "http://127.0.0.1:4481"),
    "OPENCODEX_DATA_DIR": "/tmp/ocr-pages/native",
    "OPENCODEX_BENCH_PROJECT": os.environ.get(
        "OCR_PAGES_PROJECT", "/private/tmp/ocr-pages/proj/atlas-api"
    ),
}
states = [
    "settings-general", "settings-appearance", "settings-shortcuts",
    "settings-projects", "settings-usage", "settings-remote",
    "tasks-empty", "apps-empty", "thread-search-open", "thread-context-menu",
    "project-open-dialog", "project-actions-open", "project-edit-open",
    "app-menu-open", "sidebar-hidden", "sidebar-focus-view", "connection-offline",
]
version = os.environ.get("OCR_PAGES_VERSION", "final")
for theme in ["dark", "light"]:
    for size in ["1280x800", "1600x1000"]:
        for state in states:
            target = out / f"{state}-{theme}-{size}-{version}.png"
            subprocess.run([
                str(root / "target/release/opencodex"), "--page", state,
                "--screenshot", str(target), "--size", size, "--scale", "2",
                "--theme", theme,
            ], env=env, cwd=root, check=True, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL)
            reference = "settings-remote-access" if state == "settings-remote" else state
            web = root / f"goldens/web/{reference}-{theme}-{size}.png"
            if not web.exists():
                continue
            left, right = Image.open(web), Image.open(target)
            pair = Image.new("RGB", (left.width + right.width, max(left.height, right.height)))
            pair.paste(left, (0, 0))
            pair.paste(right, (left.width, 0))
            pair.save(out / f"pair-{state}-{theme}-{size}-{version}.png")
print(f"Saved {len(states) * 4} native captures and available reference pairs to {out}")
