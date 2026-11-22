# Chat parity audit — partial, not a parity sign-off

Branch: `rune-parity-chat`. Only this worktree was edited. Source is the current
React implementation, not assumptions in the previous Rune README.

`fixed` means the listed defect was corrected; it does **not** certify pixel-identical
rendering of its entire surface. `matches` means the named source behavior was checked.
Outstanding work is explicitly marked `remaining` rather than falsely describing it as
impossible in Rune. The requested exhaustive zero-gap audit is **not complete**.

Checklist counts: **36 fixed, 12 matches, 30 remaining, 1 pinned-framework capture limitation**.

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

| Item                                  | Status           | Concrete gap / next action                                                                                                                                                   |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline file-link icon                 | remaining        | Pinned Markdown exposes external-link icons only, not local-link adornment. Needs a Rune-kit hook or a faithful custom inline renderer; click routing is fixed, icon is not. |
| Markdown paragraph/list/table metrics | remaining        | Rune-kit layout differs from Chromium. Table padding matches CSS declarations but row-height/wrapping pairs need successful seeded replies.                                  |
| HTML in Markdown                      | remaining        | React sanitizes and renders allowed HTML; Rune-kit is not an equivalent HTML renderer.                                                                                       |
| Response copy feedback                | remaining        | Copied/checkmark/error/2-second reset not yet equivalent.                                                                                                                    |
| User annotations/mentions             | remaining        | Message annotation chip/popover and sent mention pills not ported fully.                                                                                                     |
| Attachment interactions               | remaining        | Generic sent/draft file cards lack source download behavior; image failure/retry handling differs.                                                                           |
| Response selection/review comments    | remaining        | Text selection actions, comment creation and mark restoration still incomplete.                                                                                              |
| Jump pill shadow                      | remaining        | Elevated fill/border follow source; secondary-button shadow and exact hover pixels need completion.                                                                          |
| Chat toolbar/details                  | remaining        | Full session details content/aggregation and exact breadcrumb/popover geometry require further audit.                                                                        |
| Pending inbox/running dock            | remaining        | Accepted-message and blocking-work controls not source-equivalent.                                                                                                           |
| Context keyboard/popover              | remaining        | Context control is restored; hover/focus/outside-click semantics and anchoring need native runtime verification.                                                             |
| Slash/mention ordering                | remaining        | Rune fuzzy ranking/skills/commands ordering differs from web rank buckets and live file search.                                                                              |
| Undo attachments                      | remaining        | Existing action worker restores text only; must restore original attachment/mention context off-thread.                                                                      |
| Full fork dialog                      | remaining        | Web before-earlier-message choices and retained draft behavior not fully ported.                                                                                             |
| All question field types              | remaining        | Boolean/number/external/conditional fields, radio keyboard semantics, numeric shortcuts, custom-answer review labels and styling need completion.                            |
| Permission card                       | remaining        | Enable full access control and exact request layout/pending lifecycle still differ.                                                                                          |
| Files tree icons                      | remaining        | Still Rune-kit FileNode icons, not OpenCode theme file icons.                                                                                                                |
| Files tabs/tree                       | remaining        | Pinned/preview semantics, tab keyboard behavior, actual breadcrumbs, search/collapse controls, and exact selected styling not complete.                                      |
| File editor toolbar/selection         | remaining        | Open-in application discovery/menu and review comments absent; source editor lacks CodeMirror-equivalent gutter/selection behavior.                                          |
| Large-editor performance              | remaining        | 256 KiB editable regression covered; 2 MiB interactive latency not yet profiled.                                                                                             |
| Diff surface                          | remaining        | Review comments, source toolbar modes and exact line/gutter metrics need full pass.                                                                                          |
| Image viewer                          | remaining        | Zoom steps, anchored zoom, pan, metadata, download and annotations incomplete.                                                                                               |
| Rich file previews                    | remaining        | PDF/docx/video/HTML preview behavior incomplete. Markdown preview's relative-link base still needs source-directory handling.                                                |
| Subagent list/header                  | remaining        | Running/attention/status/model/header labels and pagination need exact parity pass. Reader rows now shared.                                                                  |
| Side-chat composer                    | remaining        | Attachments, own model picker, docks, slash restrictions and deletion missing/incomplete.                                                                                    |
| Canvas list/tabs                      | remaining        | Deletion confirmation, timestamps, per-chat persistence, annotations and exact tab controls incomplete.                                                                      |
| App canvas height                     | remaining        | Previous Apps page fixed-height container still present; not edited because parallel agent owns Apps.                                                                        |
| Browser                               | remaining        | Per-chat tabs, persistent/shared profiles, local HTML routing, downloads and browser context menus incomplete.                                                               |
| Terminal chrome                       | remaining        | Exact tab strip/toolbar styles, cwd connection status, resize geometry and empty-state content need completion.                                                              |
| Successful-response goldens           | remaining        | Original fixture cannot be regenerated while opencode/big-pickle returns provider.free-limit HTTP 429. No replacement model or fabricated transcript used.                   |
| Atomic native-child screenshots       | can't-do-in-Rune | Pinned headless Rune screenshot omits WK child views. Must separately snapshot/composite real WK output, explicitly not an atomic GPU/native frame.                          |

## Verification and images

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
