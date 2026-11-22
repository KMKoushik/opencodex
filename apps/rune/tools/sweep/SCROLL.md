# Transcript scroll geometry

Measured against real Electron/CDP with isolated OpenCode 4985 and gateway 4515.
No user service, model calls, redraw loops, eager history mounting, pixel masks,
or hand-tuned scroll offsets.

## What 50% means

`web.mjs` first visits the start of the long history until pagination reports
“Beginning of conversation”, then makes a bounded, overlapping scroll pass to
measure the complete fixture before assigning
`scrollTop = (scrollHeight - clientHeight) * 0.5`. `reach()` waits another 400ms
before capture. `--at 0.7` is Rune's virtual capture clock, not a scroll fraction.
Rune's `--scroll middle` requests the same fraction of its scrollable extent.

The web does **not** mount the entire transcript. `timeline.tsx` uses LegendList
with a 100px initial estimate and 500px draw distance. The pinned LegendList
3.6.0 `updateItemSize()` rounds measured row sizes with `Math.round`, learns an
average of known sizes, and uses that average (floored to eighths) for unvisited
rows. Markdown boxes themselves remain fractional. Thus the fixture's 66.75px
user and 84.75px answer occupy 67px and 85px in the virtual list.

Rune previously retained 100px estimates and fractional row placement and asked
for its midpoint before visiting the beginning. The fix learns the estimate from
mounted rows, uses Rune's existing `whole_rows()` layout policy, and primes the
beginning before issuing a fractional request. Normal end-opening remains lazy.
History-fetch completion drives priming; there is no timer or per-frame fetch
loop. Scroll-only layout notifications call `live_only()` when the estimate
hasn't changed. The measurement cache resets on width/font changes, updates
existing keys in place, and holds at most 1,024 entries per open conversation.

`scroll-measure.mjs [WxH]` reuses a seeded `--keep-env` environment and records
real Electron rectangles and explicit scroll assignments. Before the full
measurement pass, its 1280×800 priming heights were 2940, 5103, 6166, then 6158px;
it assigned 2770px for a 618px viewport. That model happened to put the visible
rows at the correct midpoint at this size, but not at 1600×1000: the two
virtualizers' different overscan windows left an 8.25px placement difference.

The finite sweep-only pass removes this reference ambiguity instead of adding an
app offset or trying to reproduce LegendList's particular sampling history.
The fully measured fixture is 6176px (44px header + 40 × (67px user + 85px
answer) + 52px footer). At 1280×800 its midpoint offset is 2779px and Turn 19
starts at y=41px; at 1600×1000 the offset is 2679px and that row starts at y=141px.
Normal app opening never performs this scroll pass. Rune still builds only
virtual windows, retaining its measured rows and learned estimates.

## Open-time performance

Seven paired, alternating process-cold `--profile perf` runs of the existing
`--profile-chat` harness against the same real 40-turn session. The
`OPENCODEX_HEADLESS first_rows_ms` marker measures session selection through
HTTP/SSE reduction and first laid-out rows; it excludes GPU upload/presentation.
No presentation marker is fabricated for a locked/covered window.

| Metric                              |          Before |            After |
| ----------------------------------- | --------------: | ---------------: |
| Median first rows                   |        60.794ms |         60.092ms |
| First-rows range, all runs retained | 47.801–76.098ms | 48.270–105.958ms |
| Median per-run p95 CPU commit       |         8.215ms |          8.047ms |
| Mounted rows at first rows          |              31 |               31 |
| Messages loaded at first rows       |              50 |               50 |

The initial page has 33 projected rows in both versions. No eager full-history
pagination or text shaping was added to normal end-opening. These measurements
show no median open-time regression, not a hardware display-latency guarantee.

## Validation

Worst blurred MAE across dark/light at 1280×800 (lower is better):

| State                | Before |  After |
| -------------------- | -----: | -----: |
| chat-long-middle     | 4.2332 | 0.3743 |
| chat-long-top        | 0.6129 | 0.3471 |
| chat-long-bottom     | 0.7462 | 0.2764 |
| chat-markdown-middle | 0.9286 | 0.7926 |
| side-chat-new        | 4.0950 | 0.9583 |
| panel-side-chat      | 4.0887 | 0.9520 |

The extra 1600×1000 run scores 0.2599 for long-middle, 0.9698 for new side
chat and 0.9687 for the existing side panel (worst dark/light). Before adding
the finite full-measurement pass, the wider midpoint still scored 2.3812 from
the 8.25px reference-estimate difference; the wider side state scored 2.2802
before applying the centered 768px content/composer limit. The 1280px midpoint's
visible coordinates and metrics are unchanged by the additional priming pass.

Before is the starting revision's same-data sweep; the original perf binary
was additionally recaptured against this fixture for long-middle and reproduced
3.8296 dark / 4.2332 light exactly. Every after pair's gateway snapshot stayed
unchanged. Fresh-name pairs were visually inspected. Long-middle now differs
only in rasterization and the independently different follow-pill/fade behavior;
the side states retain checkbox painting and narrow main-composer differences.
The shared 69-state `REPORT.md` is not replaced with this six-state subset.

One focused regression checks measured-size rounding, same-key updates, rewrap
and font invalidation, and the cache bound. Release workspace build, workspace
tests, `bun check`, and `bun format:check` pass. The same-data sweep verifies
long top/middle/bottom, middle Markdown and both side-chat states in both themes
at both sizes: 24 stable pairs. The isolated processes were ownership-checked and
stopped, and the temporary fixture was removed. See the workbench parity notes
for the footer and composer rectangle investigation.
