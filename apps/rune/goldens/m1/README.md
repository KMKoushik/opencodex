# Milestone 1 paired captures

Local, ignored PNGs at 1280×800 logical pixels, device scale 2 (2560×1600 files):

- `web-dark.png` / `rune-dark.png`
- `web-light.png` / `rune-light.png`
- `side-dark.png` / `side-light.png` — reduced side-by-side review sheets, web left, Rune right.

Both sides use the same isolated gateway on 4431, isolated OpenCode on 4901, one Git project,
and three completed real `opencode/big-pickle` replies. The web project was opened through the
`~/projects/my-app` field and exact **Open** button. No API responses, reply text, or theme tokens
were mocked. Its macOS `data-platform` style is enabled so titlebar spacing matches Electron;
native traffic lights are outside the browser/headless captures.

The expanded web oracle from the separate reference-capture change (`../SPEC.md`, `../computed.json`,
`../web/`) informed dimensions, typography, disabled controls and layout. Its different fixture and
browser-only titlebar state are not misrepresented as these paired captures' data.

Recreate using `../../tools/isolated.sh`, `../../tools/compare.mjs`, and the screenshot commands in
`../../README.md`. Temp fixture data and services are removed after validation; PNGs stay here
locally, while only this README is committed.

## Final observations

Whole-image mean absolute RGB difference (Pillow `ImageChops.difference`, average across
all pixels and three channels, 0–255 scale): **dark 1.1305**, **light 1.2677**. Both pairs
are 2560×1600. This background-dominated metric is not a claim of exact typography or
interaction parity; inspect the review sheets too. Remaining visible differences include
glyph rasterization, shadow edges and minor icon/control geometry.

Seven warmed perf-binary headless dark captures reported a median `headless_ms` of
**57.04 ms** (range 51.09–60.05), including gateway snapshot loading (median 36.23 ms).
Median first-frame CPU was **3.79 ms**, readback **13.15 ms**. These are Rune's internal
headless intervals, not exec-to-presented-window startup or PNG encoding time.

The 20,000-thread optimized runtime test mounted **30 rows**, first CPU frame **6.31 ms**
(one observed test run). Three bare native launches received their first worker snapshots
at **454.5, 182.9, 177.4 ms** (median **182.9 ms**). The same process received live root
thread creation and rename; its temporary thread was deleted afterwards.

Native first-content markers remained absent: the host exposed no on-screen window and
Rune skipped subsequent frames on both Metal and wgpu. The 20-second smoke interval had
zero drawn frames, but this is **not** evidence of unobstructed idle performance. Actual
visible-window startup, live painted updates, and idle CPU require an interactive Mac.
