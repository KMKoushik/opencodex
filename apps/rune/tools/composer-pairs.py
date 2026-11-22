"""Assemble paired captures. Run from repo root; requires Pillow."""

import os
from pathlib import Path

from PIL import Image, ImageDraw

folder = Path("apps/rune/goldens/composer")
version = os.environ.get("OCR_CAPTURE_VERSION", "v7")
for web in folder.glob(f"web-*-{version}.png"):
    rune = web.with_name(web.name.replace("web-", "rune-", 1))
    with Image.open(web) as left, Image.open(rune) as right:
        left.thumbnail((1280, 1000))
        right.thumbnail((1280, 1000))
        pair = Image.new(
            "RGB", (left.width + right.width, max(left.height, right.height) + 28), "#777777"
        )
        pair.paste(left, (0, 28))
        pair.paste(right, (left.width, 28))
        draw = ImageDraw.Draw(pair)
        draw.text((10, 8), "Web", fill="white")
        draw.text((left.width + 10, 8), "Rune", fill="white")
        pair.save(web.with_name(web.name.replace("web-", "pair-", 1)))
