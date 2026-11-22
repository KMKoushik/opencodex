# Final transcript / native-child parity follow-up

Worktree/branch: `opencodex-rune-fx-last` / `rune-fx-last`.
Real Electron main/preload, isolated OpenCode **4988**, gateway **4518**,
`/tmp/ocr-fx-last`, fixed sweep clock, 1280×800 at scale 2, both themes.
No model calls, user-service access, redraw loops, eager transcript mounting,
post-capture pixel masks, alignment corrections or classification overrides.

The fresh 14-pair baseline was captured at `e136ff1`, source fingerprint
`b23848494e332ea16cc1285aa3462d158e3bb48b2867ee660fa22a4d7a36dec5`.
Final code is `37c5919`, source fingerprint
`7edf84f6cfc6a0d785ec41833d9ed6bf12440404a2219209fd844134efd3adef`.

## Changes and direct observations

- Read-only subagent timelines now include the same 44px history row as the
  editable reader. It is virtual scroll content, not an external spacer.
  Their status/permission footer is passed explicitly into the scroller:
  wrapping it for floating controls must not turn caller-supplied scroll
  content into a fixed bottom dock. A direct sweep geometry guard verifies
  both the history height and the status position, because moving a small
  label by hundreds of pixels can still pass whole-window MAE thresholds.
- Follow state stops on reading gestures/disclosures, not merely because
  measuring, pagination or a programmatic assignment moved the viewport.
  Entering the 40px end band resumes following. Running/streaming does not gate
  the pill. Main and side timelines use the real constant 32px linear alpha
  mask on the scroll surface, leaving the floating controls unmasked;
  read-only subagent timelines do not acquire this `.chat`-specific mask.
- Narrow controls preserve Chromium's independently shrinking `.select`
  wrapper and its overflowing 18px trigger padding box, while thinking keeps
  its intrinsic width. Workbench checkboxes retain the 13px native glyph
  centered inside their 28px input and the full-height inset input ring.
- The workbench max-width must use the workspace **content** box, excluding
  the shell's 0.5px separator. Before, the native side reader started at x=577
  with width 659; Electron starts at x=577.5 with width 658.5. Fixing that
  ownership also restores the main column's 276px content width and the
  composer's actual inset, rather than offsetting individual rows or glyphs.
- Canvas screenshots now export the actual opaque gateway runtime in an
  offscreen WKWebView and composite its `takeSnapshot` PNG at the Rune layout
  rectangle. Child PNG and placement/scale JSON accompany each capture.
  Hidden WebKit views suspend `requestAnimationFrame`: export waits for load
  and font readiness, then lets `takeSnapshot` provide the paint fence. The
  bounded one-shot AppKit wait is not an application redraw loop. Original
  child pixels remain available for auditing the composition.

### Row rounding: measured evidence, not a new offset

The supplied branch already places long-history bottom answer rows at
**65, 217, 369, 521px**, exactly matching fresh Electron DOM measurements.
Find-long has those same tops. Both before and after retain the native
22.75px text line boxes and 38.75px user bubbles. Chromium reports fractional
66.75px / 84.75px row contents inside LegendList's **67px / 85px virtual
slots**. The older Tier-two 66.75/218.25/... observation predates the integrated
whole-slot fix and does not reproduce on this branch.

Replacing those slots with fractional accumulation would introduce a 20px
drift over 40 turns. No such regression or artificial compensating scroll
offset was introduced; the bottom and Find-long baseline measurements are
retained rather than claiming an improvement that was not needed.

### Capture fidelity

The sweep used to pause the follow-pill entrance permanently at its initial
zero-opacity frame, even when the web mounted the control after a reading
gesture. That animation is now explicitly sampled at 0.7s, like Rune's capture
clock. Long-history **top** setup includes a genuine blank-viewport reading
press after priming, corresponding to Electron's initial reading wheel
gesture, without changing the requested scroll fraction. The middle-history
measurement pass reaches the end and resumes following before its purely
programmatic midpoint assignment; it must not receive that extra reading
gesture. Markdown's purely programmatic top/middle assignments likewise do
not stop following.

The historical two unscored states were **one canvas and `chat-streaming`**,
not two canvases. Canvas is now measurable. Importing unfinished text does not
create a native active run; streaming is not replaced with a completed
transcript or given a fabricated pixel score under the no-model-call rule.

## Open-time performance

Seven alternating process-cold before/after pairs of optimized release binaries
against the same real 40-turn session, using
`--profile-chat ses_parity_4 --probe-ms 400` and the app's `OPENCODEX_HEADLESS`
markers. Every sample is retained. The before binary
is the supplied branch, captured before editing; both binaries use the same
canonical fixture directory. The marker ends at first laid-out rows and
excludes GPU upload/presentation; no display-latency claim is made for a locked
or covered window.

| Metric                        |          Before |           After |
| ----------------------------- | --------------: | --------------: |
| Median first rows             |        51.227ms |        50.170ms |
| First-rows range              | 49.095–52.347ms | 47.574–61.554ms |
| Median per-run p95 CPU commit |         7.172ms |         6.411ms |
| Mounted rows at first rows    |              31 |              31 |
| Messages loaded at first rows |              50 |              50 |

The initial projection remains 33 rows. No eager full-history acquisition or
additional offscreen text shaping was added to normal conversation opening.

An earlier seven-pair smoke at `89aed06` measured 47.841→47.202ms median first
rows (5.057→5.144ms median per-run p95). Its raw samples are retained separately,
not pooled with the final-code measurements above or silently discarded.

## Final sweep and validation

The final complete run contains **69 states / 138 attempts**, with **136 scored
pairs over 68 states** meeting both provisional thresholds in both themes.
Every scored pair has unchanged before/after gateway digests and the final
source fingerprint above. There are no capture errors other than the two
explicitly unsupported `chat-streaming` attempts. The shared `REPORT.md` was
regenerated from this complete run, not a focused-state subset.

Worst blurred MAE across dark/light at 1280×800 (lower is better):

| State                 |   Before |  After | After RGB |
| --------------------- | -------: | -----: | --------: |
| subagent-conversation |   0.9989 | 0.3289 |    0.6141 |
| chat-markdown-top     |   0.6011 | 0.4919 |    1.0225 |
| chat-markdown-middle  |   0.5608 | 0.4845 |    1.0164 |
| chat-long-bottom      |   0.2772 | 0.2772 |    0.5513 |
| find-long-open        |   0.2893 | 0.2893 |    0.5656 |
| side-chat-new†        |   0.6062 | 0.6057 |    1.0619 |
| panel-side-chat       |   0.6000 | 0.3779 |    0.9192 |
| panel-canvas          | unscored | 0.2765 |    0.5911 |

† The final real new-fork operation returned empty history, and **both clients
show its introduction**, rather than the populated inherited-history variant
in the initial baseline. This remains an honest same-data pair, but is not a
like-for-like inherited-transcript before/after measurement. The intro retains
pre-existing locale-time formatting and plugin-install-hint differences; its
below-threshold score is **not** a claim that those strings are equivalent.
Earlier populated-fork capture logs after the checkbox/geometry fixes record
0.3797 worst blur; those logs are retained separately, not substituted
for this final complete-run result. Existing-panel Markdown/checklist captures
continue to exercise the populated side reader in both themes.

Fresh-name pairs were inspected for the requested header, Markdown, long-history,
side-reader and native-canvas changes, as well as diff/file/terminal regressions.
The direct geometry audit confirms the subagent status at
`[593.5,304,626.5,20]` in **both** clients/themes, with its 44px history header.
Long-bottom and Find-long retain matching answer tops 65/217/369/521px.
Original native canvas snapshots are nonblank, match their recorded pixel
dimensions and are composited at the actual layout rect in both themes.
These are visual/geometry checks, not a full interaction or atomic-presentation
sign-off; numerical classifications elsewhere remain explicitly provisional.

- `cargo build --release --workspace`: passed (existing warnings only).
- `cargo test --workspace`: passed, **119 tests**, six existing doctests ignored.
- `bun check`: passed (types, lint, gateway tests, web and desktop builds).
- `bun format:check`: passed.
- Ownership-checked cleanup and an independent actual-environment/CWD audit
  found **no remaining fixture processes**, including Electron/helpers/PTYs.
  Ports **4988/4518** have no listeners and `/tmp/ocr-fx-last` no longer exists.
  No user OpenCode service or data was accessed; no other worktree was changed.
- Commits remain local on `rune-fx-last`; nothing pushed.
