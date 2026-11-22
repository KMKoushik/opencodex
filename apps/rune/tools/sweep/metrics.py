"""Pillow-only metrics; no registration, cropping, masks or rescaling to hide differences."""
import json
import pathlib
import sys
from PIL import Image, ImageChops, ImageFilter, ImageStat

stem = pathlib.Path(sys.argv[1])
a = Image.open(str(stem) + '.electron.png').convert('RGB')
b = Image.open(str(stem) + '.rune.png').convert('RGB')
if a.size != b.size:
    raise ValueError(f'Unequal capture dimensions: {a.size} versus {b.size}')
diff = ImageChops.difference(a, b)
mean = sum(ImageStat.Stat(diff).mean) / 3
maximum = ImageChops.lighter(ImageChops.lighter(*diff.split()[:2]), diff.split()[2])
hist = maximum.histogram()
over = 100 * sum(hist[17:]) / (a.width * a.height)
# Blur radius 2 physical pixels = 1 logical px, then grayscale and downsample 2x.
# This deliberately tolerates glyph AA while retaining displaced edges/absent UI.
small = (a.width // 2, a.height // 2)
ga = a.filter(ImageFilter.GaussianBlur(2)).convert('L').resize(small, Image.Resampling.LANCZOS)
gb = b.filter(ImageFilter.GaussianBlur(2)).convert('L').resize(small, Image.Resampling.LANCZOS)
blur = ImageStat.Stat(ImageChops.difference(ga, gb)).mean[0]
heat = Image.merge('RGB', (maximum.point(lambda x: min(255, x * 4)), maximum.point(lambda x: min(255, max(0, x - 32) * 2)), maximum.point(lambda x: 0)))
heat.save(str(stem) + '.diff.png')
pair = Image.new('RGB', (a.width * 2, a.height))
pair.paste(a, (0, 0)); pair.paste(b, (a.width, 0)); pair.save(str(stem) + '.pair.png')
print(json.dumps({'meanRGB': round(mean, 4), 'over16': round(over, 4), 'blurMAE': round(blur, 4)}))
