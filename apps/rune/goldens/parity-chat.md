# Chat parity audit — partial, not a parity sign-off

Branch: `rune-parity-chat`. Only this worktree was edited. Source is the current
React implementation, not assumptions in the previous Rune README.

`fixed` means the listed defect was corrected; it does **not** certify pixel-identical
rendering of its entire surface. `matches` means the named source behavior was checked.
Outstanding work is explicitly marked `remaining` rather than falsely describing it as
impossible in Rune. The requested exhaustive zero-gap audit is **not complete**.

Merged inherited rows: **57 fixed, 14 matches, 10 remaining, 2 native/capture exceptions**.
These counts describe individual inherited audit rows, not whole-screen parity.

## Integration continuation (`rune-port`)

- Native updater: implemented explicit GitHub check/download/restart, bounded archive,
  SHA-256 and designated-certificate verification, private sidecar stdio/phone API.
  Signed release-to-release installation is not yet verified; ad-hoc disable/IPC is.
- Apps canvas: real shared `oc-webview` host retained through all page merges.
- Find: renderer receives row identity; current Markdown and user-text occurrences
  use distinct highlights, with stable per-occurrence scroll keys.
- Composer: consumed input/IME/paste breaks shortcut sequences; draft image/file/DOCX
  click routes use worker preparation. Full native interaction matrix remains unverified.
- Clipboard: `oc-native` now writes directly to NSPasteboard and returns the actual
  AppKit BOOL. This supersedes the older JXA evidence below. Explicit copy actions
  share this boundary; project copy feedback waits for write acknowledgement.
- DOCX: chat and Files share one module, embedded worker, sanitizer, DOM-find client,
  generator and license copies in `src/docx`.
- HTML in Markdown: **remaining**; native sanitizer-allowlist rendering is not implemented.
- Inline code/link 1pt line-box and icon geometry: **remaining**, not a private-API excuse.
- Remaining panel ring/history/footer, side picker/context/docks, canvas bridge-to-draft
  and timestamp, and browser menu/download/relaunch interactions: **remaining**.

The 69-state review is recorded in `final/README.md`; it is not a 1:1 sign-off.

## Corrected defects

| Item                              | Status | Source / correction                                                                                                                                                  |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary file links               | fixed  | `file-link.ts`: relative, absolute, localhost file URLs, percent-decoding, encoded traversal, fragments, forbidden NUL/backslash/remote hosts; route into Files.     |
| Cross-directory document identity | fixed  | Preserve directory in requests, tabs, refresh, save and save acknowledgements; equal basenames cannot overwrite one another.                                         |
| Safe external link schemes        | fixed  | `markdown-url.ts`: permitted mail/IRC/XMPP links reach the system rather than silently doing nothing.                                                                |
| Code-fence copy controls          | fixed  | `stream-text.tsx` has default pre/code nodes, not the invented Rune per-fence copy button. Removed it. There is no language toolbar in this web version.             |
| Markdown task checkboxes          | fixed  | `remark-gfm` checkboxes are read-only; Rune task toggling is disabled.                                                                                               |
| User attachment ordering          | fixed  | `user-prompt.tsx`: own bubble precedes attached files. Empty text does not render an empty bubble.                                                                   |
| User attachment cards             | fixed  | Attachment icon, filename fallback and PDF/extension/File secondary label replace folder-only cards.                                                                 |
| User font preference              | fixed  | Sent bubbles honor chat font size and 1.625 line height rather than hard-coded 14.                                                                                   |
| Activity active label             | fixed  | `activity.tsx` has no inserted spinner between Working and its summary.                                                                                              |
| Generic/question tool icons       | fixed  | Use File01, including Question, not invented folder/list icons. Empty Question target stays empty.                                                                   |
| Edit tool icon                    | fixed  | FileEdit, not the composer pencil icon.                                                                                                                              |
| Skill usage                       | fixed  | Layers icon; Used skill / Loading skill / Failed to load skill; name from input or skill_content; errors and pending ellipsis.                                       |
| Non-text tool output              | fixed  | `File output (mime)` rather than missing MIME.                                                                                                                       |
| Expanded task-tool content        | fixed  | Remove invented Open subagent conversation action; React ToolDetails does not include it.                                                                            |
| Shell message                     | fixed  | Actual disclosure and Output truncated by OpenCode notice instead of always-expanded output.                                                                         |
| Assistant retry status            | fixed  | `Retrying: …` was previously silently dropped.                                                                                                                       |
| Compaction/switch notes           | fixed  | Exact Compacting context… / Compaction failed / Context compacted / Agent / Model / Directory strings, not raw enum names.                                           |
| Revert boundary notice            | fixed  | Remove invented Conversation undone status; source already filters at the revert boundary.                                                                           |
| History text                      | fixed  | Retry loading history; empty label while more history exists (no invented Load earlier messages button). Short headless captures confirm the final history boundary. |
| Failed/interrupted run footer     | fixed  | Retain SessionInfo outcome and render source failed-run fallback / Stopped status.                                                                                   |
| Jump arrow                        | fixed  | ArrowDown02 rather than the chevron.                                                                                                                                 |
| Reader transcript                 | fixed  | Side/subagent readers share actual message/work/tool/error rendering and independent disclosures, not generic placeholders.                                          |
| Reader images and elapsed labels  | fixed  | Worker-only image loading, memo invalidation, shared preview and visible-only elapsed ticking.                                                                       |
| Draft attachment strip            | fixed  | Horizontal scrolling, Attachment01 icon, secondary surface and B/ceil-KB/one-decimal-MB size formatting.                                                             |
| Thinking labels/narrow width      | fixed  | Capitalize variant IDs like variantLabel; omit disabled long text below 300 points instead of overlapping the model trigger.                                         |
| Permission trigger                | fixed  | Remove invented two-option permission menu. Default goes directly to confirmation; Full access restores default directly; pending is disabled.                       |
| Context usage                     | fixed  | Restore composer ring and Context window popover, token totals and limits from latest response, threshold colors and unavailable strings.                            |
| Workbench rail                    | fixed  | Surface background, selected ceramic glaze/shadow; Terminal before Browser; actual Globe02 browser icon.                                                             |
| File editing ceiling              | fixed  | Remove 128 KiB refusal. Text remains editable through the web's 2 MiB ceiling, with the 8-dirty-file constraint and source error strings.                            |
| File editor default/save          | fixed  | Text opens directly in source editor; stays editable after save; icon save control is present while clean and disabled appropriately.                                |
| File editor discard/Markdown      | fixed  | Add discard confirmation and source/preview controls. The confirmation's current placement is not yet the web modal geometry.                                        |
| File tree visibility              | fixed  | Toolbar Show/Hide file tree action; comparison labels Uncommitted / Base branch.                                                                                     |
| Terminal glyph sizing             | fixed  | Menlo 13, matching web terminal configuration, instead of the application's SF Mono slot. Cursor and IME use the same family; disable invented blinking.             |
| Terminal tabs                     | fixed  | CommandLine icon, per-project ordinal, Exited status and actual icon add control; creation pending disables add.                                                     |
| Question collapse                 | fixed  | Exact Expand/Collapse question labels, up/down glyph, collapsed summary, Continue reopens rather than submits.                                                       |
| Question Back/choices             | fixed  | Review Back returns to last question, Back hidden while collapsed, option number hints and conditional topic string.                                                 |

## Source behavior checked

| Item                           | Status  | Evidence                                                                                                                                       |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Work elapsed strings           | matches | `turn-header.tsx`, `elapsed.ts`; same rounding and nonzero units.                                                                              |
| Work grouping                  | matches | Existing projector follows `timeline-model.ts`; existing turn/projection test retained.                                                        |
| Nested activity virtualization | matches | Greater than 30 entries; 360-point bounded scroller, short groups natural height.                                                              |
| Tool title/status labels       | matches | Read, Run, Question, raw tool name; Running… / Preparing… and completed/error icons.                                                           |
| Markdown syntax colors         | matches | Current React StreamText does not run a syntax highlighter. Native code fences remain monochrome.                                              |
| Math/Mermaid plugins           | matches | Current StreamText has remark-gfm and sanitized HTML only, not math or Mermaid rendering plugins.                                              |
| User hover edit/undo/fork      | matches | Current Message/UserPrompt contains no such controls. Do not invent them. Fork is a thread-action dialog and selection uses ResponseSelection. |
| Slash command descriptions     | matches | Local command catalog strings match `slash-commands.ts`. Ordering/filter parity remains below.                                                 |
| Draft acknowledgement          | matches | Captured revisions only; existing regression test retained.                                                                                    |
| Attachment processing boundary | matches | Bytes/base64/thumbnail/file work remains on workers, not typing handlers.                                                                      |
| Terminal ownership             | matches | Drawer dismissal detaches, tab close deletes PTY, externally owned OpenCode remains running.                                                   |
| Canvas sandbox                 | matches | Gateway runtime frame remains opaque allow-scripts iframe; not a privileged guest.                                                             |

## Outstanding — not hidden as framework impossibility

| Item                                  | Status           | Concrete gap / next action                                                                                                                                                                                                     |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inline file-link icon                 | fixed            | Verified source icons before local links (not external URLs) in fresh goldens/pc-transcript-final/pair-chat-markdown-*.png pairs, both sizes/appearances.                                                                      |
| Markdown paragraph/list/table metrics | remaining        | Adapter's private exact_lines and inline-icon baseline cannot express CSS's extra 1pt code line box or -2px icon alignment from chat. No global fudge. pc-transcript3/pair-transcript-*-review2.png.                           |
| HTML in Markdown                      | remaining        | Actual 5.0.2 policy checked (u/mark unwrap; script strips). Native HTML5 tree renderer remains unimplemented, not impossible. Authored fixture: pc-transcript3/pair-html-*-review2.png.                                        |
| Response copy feedback                | fixed            | Actual macOS AppKit BOOL via worker JXA/stdin; no readback. objc2 needs forbidden Cargo.toml edit; unsafe FFI forbidden. Pending/failure/2s success retained; headless/non-macOS fallback remains.                             |
| User annotations/mentions             | fixed            | Validated UTF-16 own-text/annotations, chip/popover and sent mention pills; overlay paints after rows. Scripted both themes/sizes: goldens/pc-transcript-final/pair-context-*-annotations-final.png.                           |
| Attachment interactions               | remaining        | Sent DOCX modal + web Mammoth worker/DOMPurify ported. pc-transcript3/pair-docx-*-review2.png omits WK children. Draft click handlers live in composer/mod.rs:572-638, outside allowed src/chat edits.                         |
| Response selection/review comments    | remaining        | Exact retained native node/ranges avoid first-quote matches. DOM UTF-16 offsets/underline need adapter source-map/decoration APIs; public SelectedText has only selected pieces. Existing editor geometry not exact.           |
| Jump pill shadow                      | fixed            | Reverified elevated fill/heavy border, ArrowDown02, chip shadow and hover in goldens/pc-transcript-final/ pairs. This verifies fill/shadow, not the separate source CSS appearance delay.                                      |
| Chat toolbar/details                  | remaining        | Fixed panel/scroller/8pt padding: pc-transcript3/pair-details-*-review2.png. Scoped resource/descendant SSE coalesces 100ms; usage patches cached totals (no HTTP). Expanded-resource interaction parity unverified. No claim. |
| Pending inbox/running dock            | remaining        | Lists/tabs/attention/output/stop implemented. Shared worker shell invalidation (5-second fallback) and profile disclosure remain out of scope. Pairs: `composer-matrix/pair-{background,shell-output}-*-replay-final.png`.     |
| Context keyboard/popover              | fixed            | Immediate hover, inside/outside/blank clicks, focused pointer leave, Tab/Escape/re-entry tested; no modal trap. Pairs: `composer-matrix/pair-context-*-replay-final2.png`.                                                     |
| Slash/mention ordering                | fixed            | Web rank buckets/deduplication, home exclusions, skill/file/recent-chat limits, 80 ms deferred live file requests, icons and height. Pairs: `goldens/composer/pair-*-pc-composer-final2.png`.                                  |
| Undo attachments                      | fixed            | Worker decodes/validates attachments, prepares thumbnails and restores file/chat/skill mentions before applying undo. Captured revisions protect newer drafts/navigation.                                                      |
| Full fork dialog                      | fixed            | `/fork`: captured draft, latest/before choices, earlier history, wrapping arrows/Home/End, errors, pending and close. Newer drafts survive. Native thread-menu routing is outside composer ownership.                          |
| All question field types              | can't-do-in-Rune | No pinned host date/datetime widget or Chromium validity bubble. GPU calendar, local ISO and inline errors substitute; not native parity. Pairs: `composer-matrix/pair-*-replay-final{,2}.png`.                                |
| Question lifecycle                    | fixed            | Real V2 replay: every field, single/multi/custom, invalid, conditional, review/back/edit. Keyboard/focus/width/style corrected. Pairs: `composer-matrix/pair-*-replay-final{,2}.png`.                                          |
| Permission card                       | fixed            | Margins/styles/pending/dialog/errors corrected; real once/always/reject/full outcomes. Pairs: `composer-matrix/pair-permission-*-replay-{final,after}.png`; pending delays recorded HTTP replies.                              |
| Recorded composer request replay      | fixed            | Native V2-authored requests; actual gateway HTTP/SSE, not model output (free model: 429). Tools: `composer-{fixture,decisions,replay,matrix}.mjs`. Archive: `composer-matrix/recorded-requests.tar.gz`.                        |
| Composer fixture isolation            | matches          | `/tmp/ocr-pc-composer2`; OpenCode 4972, gateway 4502, record 4503, replay 4542. Both themes/sizes, scale 2; scripted input. Whole-window/font differences remain; no pixel-identical sign-off.                                 |
| Latest composer verification          | matches          | Release build, 56 Rust unit tests, `bun check`, `bun format:check` pass. Fresh final output/full-access pairs: `composer-matrix/pair-{shell-output,permission-full}-*-replay-final3.png`; residual metrics differ.             |
| Files tree icons                      | fixed            | Uses pinned `rune-theme-opencode::tree_icons::file` rather than generic Rune-kit FileNode glyphs.                                                                                                                              |
| Files tabs/tree                       | fixed            | Breadcrumbs, search/collapse/resize, hierarchical changes/statuses, keyboard/ancestor navigation, pin/preview/close interactions. Real-gateway pairs and tab regression checked; see src/workbench/VERIFICATION.md.            |
| File editor toolbar/selection         | fixed            | Virtual no-wrap source rows with native active-line input/IME, cross-line selection/paste/undo and inline cards after the end line. Viewport-width cards map across preceding edits. See src/workbench/VERIFICATION.md.        |
| Large-editor performance              | fixed            | 2 MiB TypeScript, syntax enabled, 20 native replacement keys: CPU-frame p50 3.935 ms, p95/max 6.465 ms; excludes GPU/OS input. Virtual source rows, worker lexer; actual replacement bytes asserted.                           |
| Diff surface                          | fixed            | MIT diff vendored at 7286a3c5; configurable web metrics, one unified number column and lazy full-context expansion including unknown trailing ranges. Worker parsing/pairing/highlighting, selection and inline cards kept.    |
| Image viewer                          | fixed            | Measured viewport; anchored wheel/pinch/button/double-click zoom; drag-pan; keyboard/download; point comments. Native runtime checks fit/scroll/click coordinates. React has point, not rectangular annotations.               |
| Rich file previews                    | fixed            | Unprivileged WK PDF/video; bounded Mammoth worker, DOMPurify, CSS and DOM find (Chrome/WK smoke passed). HTML stays source; Markdown uses source-parent link base. Native control/capture limits are documented.               |
| Subagent list/header                  | remaining        | Provider logo, ring, segmented badges/filter keys and intrinsic rows corrected; populated authored pairs in `panels-final/*review5.png`. Ring rotation, attention/history interactions and footer placement still differ.      |
| Side-chat composer                    | remaining        | Fresh commands/skills; fork-bounded undo restores bytes/mentions off-thread with revision protection. Model search/thinking/status corrected. Grouped picker, context indicator and exact docks still differ.                  |
| Canvas list/tabs                      | remaining        | Delete hover/focus, tab overflow/close and viewport capture corrected. Populated pairs: `panels-final/*review5.png`; native shared overlay Attach passes. Canvas bridge-to-draft and locale parity remain unverified.          |
| App canvas height                     | fixed            | Explicit user-requested exception to Apps ownership: native app host grows to available height, replacing fixed 360-point container.                                                                                           |
| Browser                               | remaining        | Opaque per-guest origins and canonical resources block file/symlink escapes; retained annotation world fixes lost globals. Native local/annotation/history/popup pass; menus, download-save and relaunch checks remain.        |
| Terminal chrome                       | fixed            | Header/tabs/splitter/pending and capture grid/focus corrected. Scripted resize, real PTY 93×17/Unicode/reopen/close pass; zero idle frames. Four pairs inspected: `panels-final/pair-terminal-*-review5.png`.                  |
| Successful-response goldens           | fixed            | Reusable explicitly authored UI transcripts imported through isolated V2 API, not represented as model replies/recordings. 40 fresh scale-2 web/Rune pairs captured; no further model calls required.                          |
| Atomic native-child screenshots       | can't-do-in-Rune | Pinned headless Rune screenshot omits WK child views. Must separately snapshot/composite real WK output, explicitly not an atomic GPU/native frame.                                                                            |

## Verification and images

### Current continuation pass

`tools/parity-fixture.ts` imports explicitly authored Markdown, tools and long-history
UI fixtures into the isolated V2 service. The three bounded live attempts still
returned quota failures. The imported fixture is intentionally not attributed to a
model or a cloud recording. Existing fixture data is reused for subsequent captures.

Fresh web-left/Rune-right pairs: `goldens/chat-pass4/pair-*.png` (40 pairs,
dark/light, 1280×800 and 1600×1000, scale 2). Read representative pairs:

- `goldens/chat-pass4/pair-chat-markdown-top-dark-1280x800.png`
- `goldens/chat-pass4/pair-chat-markdown-bottom-light-1280x800.png`
- `goldens/chat-pass4/pair-tools-details-dark-1600x1000.png`
- `goldens/chat-pass4/pair-chat-markdown-bottom-light-1600x1000.png`

Those captures include the Markdown adapter and initial review/file-tab changes,
but predate the later task-bullet, copy feedback, inline diff editor, image controls,
deletion and retained-tab changes. They are **not** evidence for those later controls.
The pairs expose remaining wrapping/spacing differences; no pixel-parity claim.

Later fresh pairs: `goldens/chat-pass6/pair-*.png` (40 combinations) and
`goldens/workbench-pass2/pair-*.png` (24 combinations). Read the light 1280 Markdown
bottom and dark 1600 Markdown top pairs from `chat-pass6`, plus
`workbench-pass2/pair-files-dark-1280x800-pass2.png` and
`workbench-pass2/pair-changes-light-1600x1000-pass2.png`. These confirm that task
bullets now render and the workbench controls are present; they still expose
source-editor gutter, diff header/mode location and spacing gaps. The subsequent
source/preview selected-fill correction and removal of the non-source toolbar
Comment button are source-checked changes, not present in these captures.

Latest workbench pairs: `goldens/workbench-pass4/pair-*.png` (24 combinations),
after the selected-fill/removal changes and a runtime-discovered scroller fix:
the active tab is now intrinsic width (134 points), not stretched across the header
(569 points). Read `pair-files-dark-1280x800-pass4.png`; gutter and editor parity
remain open, not hidden by this correction.

Release build, workspace tests (including all 30 upstream adapter tests and the
annotation UTF-16/optional-field regression), root `bun check`, and canonical
architecture checks passed during this pass. Final release build, all 47 Rust unit
tests, root `bun check` and `bun format:check` passed. The additional all-features
workspace test run passed as well. The source and images still do not satisfy the
zero-remaining acceptance criterion; 25 items are deliberately left open.

Both isolated processes were stopped after verifying their fixture environment.
Ports 4495/4965 have no listeners and `/tmp/ocr-parity-chat` was removed. Imported
payloads, projected transcripts, quota attempts and check logs are preserved locally
in ignored `goldens/parity-pass-evidence.tar.gz`; no user service or storage was touched.

### Earlier pass (historical)

Isolated fixture: `/tmp/ocr-parity-chat`, OpenCode 4965, gateway 4495. User's service
49374 and data directory were not accessed. Seed script executed all prompts but the
provider rejected replies with HTTP 429. Renamed only isolated fixture threads to
stable descriptive titles so the existing capture script can target them.
Both fixture processes were stopped after checking their actual isolated HOME environment;
the temporary fixture was deleted. Paired images remain in this worktree.

Composer pairs (web left / Rune right), dark/light at both sizes, scale 2:
`goldens/composer/pair-*-parity-chat-final.png` (8 states × 4 combinations).
Chat pairs: `goldens/chat-review/pair-*-parity-final-review.png` (10 states × 4).
Those chat pairs contain **actual quota failures, not the original successful golden
content**. This distinction must remain in any handoff or completion report.

Reviewed representative pairs:

- `goldens/composer/pair-attachment-dark-1280x800-parity-chat-final.png`
- `goldens/composer/pair-model-light-1600x1000-parity-chat-final.png`
- `goldens/chat-review/pair-chat-markdown-bottom-dark-1280x800-parity-final-review.png`

Last reviewed captures after the history-boundary, context and failure-footer fixes:

- `goldens/chat-review/pair-chat-failure-dark-1280x800-last-review.png`
- `goldens/chat-review/pair-chat-failure-light-1600x1000-last-review.png`

Validation: release workspace build and all 16 Rust tests passed; root `bun check`
passed. Generated screenshot-tree JSON was formatted before the final root
`bun format:check`. Two targeted permanent regression tests were added: service
file-link resolution and directory-safe save identity / 256 KiB editability.

Images are local/ignored. Earlier pairs can precede later source-only fixes; see final
handoff for the last reviewed capture names. No redraw loop was introduced.
