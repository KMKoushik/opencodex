"""Create fresh-name, worst-first review sheets (Electron left, Rune right)."""
import json
import pathlib
import time
from PIL import Image, ImageDraw

out = pathlib.Path(__file__).resolve().parents[2] / 'goldens/sweep'
rows = json.loads((out / 'results.json').read_text())
worst = {}
for row in rows:
    if not row.get('reason') and row.get('blurMAE', -1) > worst.get(row['state'], {}).get('blurMAE', -1):
        worst[row['state']] = row
rows = sorted(worst.values(), key=lambda row: -row['blurMAE'])
nonce = time.time_ns()
for batch in range((len(rows) + 3) // 4):
    sheet = Image.new('RGB', (1920, 4 * 624), '#303030')
    draw = ImageDraw.Draw(sheet)
    for i, row in enumerate(rows[batch * 4:batch * 4 + 4]):
        suffix = '' if row['size'] == '1280x800' else '-' + row['size']
        stem = row.get('stem', f"{row['state']}-{row['theme']}{suffix}")
        draw.text((8, i * 624 + 4), f"{batch*4+i+1}. {stem} | blur {row['blurMAE']} | ELECTRON LEFT / RUNE RIGHT", fill='white')
        image = Image.open(out / (stem + '.pair.png')).convert('RGB')
        image.thumbnail((1920,600), Image.Resampling.LANCZOS)
        sheet.paste(image, (0, i * 624 + 24))
    path = out / f'review-{nonce}-{batch+1:02}.png'
    sheet.save(path)
    print(path)
