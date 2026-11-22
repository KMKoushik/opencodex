"""Zoom diagnostic crops only; whole-window scores never use these images.

Usage: python3 alignment-crops.py <capture-stem> <fresh-output-prefix>
Always use a fresh prefix before inspection (the image reader caches paths).
"""
import json
import math
import sys
from PIL import Image

stem, output = sys.argv[1:]
data = json.load(open(stem + '.alignment.json'))
left = Image.open(stem + '.electron.png').convert('RGB')
right = Image.open(stem + '.rune.png').convert('RGB')
viewport = json.load(open(stem + '.tree.json'))['viewport']
scale = left.width / viewport[0]
targets = {
    'title': 'Markdown parity fixture',
    'brand-chevron': 'OpenCodex menu',
    'segment': 'Uncommitted',
    'edit': 'Edit file',
    'open-in': 'Open in…',
    'context': 'Context usage unavailable',
    'project-search': 'Search projects or enter a folder path…',
    'project-directory': '~/projects/my-app',
}
for name, text in targets.items():
    pair = next((p for p in data['pairs'] if p['name'] == text and
                 (name != 'brand-chevron' or p['rune'].get('icon') == 'down')), None)
    if pair is None:
        continue
    a, b = pair['electron']['rect'], pair['rune']['rect']
    if name == 'context':
        b = a  # older inspectors did not expose the painted ring's border node
    # Include neighboring strokes and line boxes without changing either origin.
    rect = (math.floor((min(a[0], b[0])-12)*scale),
            math.floor((min(a[1], b[1])-8)*scale),
            math.ceil((max(a[0]+a[2], b[0]+b[2])+12)*scale),
            math.ceil((max(a[1]+a[3], b[1]+b[3])+8)*scale))
    a, b = left.crop(rect), right.crop(rect)
    crop = Image.new('RGB', (a.width*2+2, a.height), '#808080')
    crop.paste(a, (0, 0))
    crop.paste(b, (a.width+2, 0))
    path = output + '-' + name + '.png'
    crop.resize((crop.width*3, crop.height*3), Image.Resampling.NEAREST).save(path)
    print(path)
