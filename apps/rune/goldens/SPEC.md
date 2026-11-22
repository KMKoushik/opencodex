# Web UI golden reference

## Scope and units

Reference: the production `apps/web/dist` served by the isolated gateway, Chrome on macOS,
1280×800 and 1600×1000 CSS pixels, device scale factor 2. PNG dimensions are twice those
viewport dimensions. All measurements below are **CSS px**, not bitmap pixels.
`computed.json` contains actual bounding rectangles, computed typography, colors, shadows,
outlines, transitions and root custom properties for each captured state. Its `screens[].key`
maps directly to a PNG basename; `failures` records attempted states that did not resolve.
The `sources` map additionally embeds every web CSS file verbatim (including hover,
pressed, focus, responsive and reduced-motion rules), plus the icon identifiers used
by each TSX component. This supplies exact declarations for controls beyond the sampled
DOM selectors. CSS declarations and measured used values are intentionally distinct.
These are browser goldens, not Electron titlebar captures. Electron adds native traffic-light
spacing and `data-platform` rules; do not infer that spacing from these browser images.

The default theme follows the OS media query. Capture uses fresh browser contexts with
`colorScheme: dark/light`; it does not replace theme colors. `features/theme/use-theme.ts`
loads `opencodex:theme`; `theme.ts` derives semantic tokens from `presets.ts`. The runtime
tokens in the JSON are authoritative; `tokens.css` dark literals are only first-paint fallbacks.
System sans is `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`; monospace is
`ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`.
Use macOS system fonts for matching, not a bundled visually similar substitute.

## Shell, sidebar and home

Sources: `styles/{tokens,globals}.css`, `features/sidebar/*`, `features/projects/project-list.tsx`,
`features/sessions/session-row.{tsx,css}`, `features/chat/{chat-view,starters}.tsx`.

- Root: border-box throughout; body margin 0, font 14/21, normal weight, antialiased;
  grid height 100dvh. Sidebar + flexible content column.
- Sidebar default **300**, minimum **200**, maximum `min(480, viewport width − 360)`.
  `SidebarResize` manipulates a CSS variable during drag without rerendering transcripts;
  double-click resets 300. Keyboard arrows change 32; Home/End select min/max.
- Sidebar and underlying shell use `--surface-under`; main uses `--surface` and a
  **0.5px** left border `--border`. Toolbar/header height **40**, padding **0 20** in main
  and **0 8** in sidebar, main border-bottom **1px --border**, gap 8.
  In these Chrome captures the measured main toolbar begins at x=301 after the 300px
  sidebar; match the recorded used geometry when comparing to these browser PNGs.
- Toolbar title 13px/500. Project label `--text-secondary`; separator `--text-tertiary`.
- Sidebar content padding 0 10 10; identity row height 44, bottom margin 4, left padding 8.
  Header icon buttons 28 square; brand identity icon buttons 28 square.
- Sidebar overrides `--row-height:32px`; project and session text 13px/400. Project rows
  gap 8, padding 0 8. Folder icon 16 square, radius 4. Session text left inset 32;
  session-list bottom padding 14 and row gap 1. Title fades over the last 24px rather
  than ellipsizing. Selected entry uses selected token, hover uses hover token.
- Project heading hover replaces folder with chevron and reveals new-chat button;
  focus-within also reveals the action. Unread dot 6px accent. Running ring 10px,
  border 1.5, `spin 900ms linear infinite`.
- Main home/chat width cap **768**; inner horizontal padding **24**, hence normal
  composer/transcript content width **720** before workspace panels constrain it.
- Hero art 176 square; bottom margin 4. Hero headline 30px/600, line height 37.5,
  letter spacing −0.6. Subtitle 14.5, top margin 10, secondary text. Hero padding-bottom 28. Four starter columns, gap 12. Art comes from `features/brand` and `assets`, not a
  font glyph; preserve the source artwork.
- Sidebar-hidden state collapses the first grid column and exposes the toolbar toggle.
  Browser small-screen overlay rules start at 720px; these desktop goldens do not exercise them.

## Composer, selectors and attachments

Sources: `features/chat/composer.tsx`, `styles/globals.css`, `features/chat/{model-picker,
slash-commands,permission-control}.css`, `components/ui/select.tsx`.

- Composer area padding **12 24 12**, max width 768; composer padding **14 10 10 14**,
  radius **18**, background `--composer` gradient, `--composer-shadow`.
- Textarea font 14px/21, padding 2, minimum height **52**, maximum **240**, field-sizing
  content, no manual resize or border, transparent background. Placeholder tertiary.
  Text input has no own focus outline; wrapper adds a 1px heavy-border focus ring.
- Footer flex gap 8, margin-top 8; control subgroup gap 4, font 12.5. Model and thinking
  triggers height 30, inline padding 8; model shrink floor 96, max trigger width 240.
- Draft text and focus captured separately. Attachment strip gap 8, bottom padding 12,
  horizontal scrolling. Attachment card width 220, padding 6, radius 12, border 1;
  thumbnail/icon 44 square, radius 6; filename font 12. Transcript file card 240×76,
  padding 10 12, radius 10, 14px name and 12px secondary type. Image preview 96×76.
- Model picker width `min(400, 100vw − 64)`, 8px gap to anchor, radius 12, border 1
  heavy, elevated surface and shadow. Search row min-height 44, inline padding 14,
  input font 13. Provider heading/option height 36, margin-inline 6, radius 6; option
  padding-left 34, frequent models 8; provider logo 18 square. Selected/hover use
  semantic selection tokens. The menu flips above the composer when needed.
- Slash commands are the command menu supported by this UI: undo, redo, side, fork,
  new, compact, rename, export, plus native commands/skills. A standalone Cmd+K
  command palette is not implemented in the command catalog.
- Mention menu queries project files/skills. Empty results are genuine empty states.
  The gateway always sends with the build agent; no independent agent picker exists
  in this version's composer.

## Transcript, markdown, thoughts and tools

Sources: `features/chat/chat-view.tsx`, `features/chat/activity-tray.css`,
`features/chat/{disclosure,markdown-table,turn-header}.tsx`, `features/timeline/*`,
`styles/globals.css` (chat, markdown, disclosure and activity sections).

- Chat is a min-height:0 flex column. Scrollers use overflow-y:auto and explicitly
  disable browser overflow anchoring. Timeline owns windowing/position restoration;
  preserve its actual ordering and sticky-footer behavior rather than reversing DOM
  messages to resemble another chat product. Long-chat captures include 40 scripted turns.
- Transcript max-width 768, padding 32 24 8 and gap 24. Chat font **14**, line-height
  **22.75** (1.625); code font **13**. User messages align to the trailing edge.
- Markdown uses real headings, lists, tables and fenced code; copy controls are hover
  actions. Syntax colors are runtime `--syntax-*` tokens, not hard-coded language colors.
  `computed.json` records the rendered `pre`, `table`, `h1`, `h2`, `.markdown` and bubbles.
- User bubble maximum `min(70%,456px)`, padding 8 12, radius 16, user-message token;
  assistant message gap 14 and weight 400. Markdown sibling margin-top 16; headings
  margin-top 24, weight 600, line-height 1.4. At the default font: h1 24.5/34.3,
  h2 21/29.4, h3 17.5/24.5, h4 14/19.6. First child has no top margin. Lists indent
  24, sibling list items margin-top 6. Code fence padding 14 16, radius 10, border 1,
  surface-under background and horizontal scrolling. Inline code padding 1 5, radius
  5, code-bg token. Table cells padding 10 12, bottom border 1; header weight 600 and
  heavy-border separator. Links weight 500, underline offset 3; quotes inset 16 with
  heavy 2px left border and secondary text.
- Completed tool groups are collapsed under “Worked for …”; expanded rows show tool
  names, targets, output, and thoughts. Thoughts are independent disclosures with a
  collapsed preview. Skill/search/edit icons tint `--activity-skill/search/edit`.
- Streaming changes the send action into Stop and adds running status in the sidebar.
  Capture starts a real model request and interrupts it after the screenshot. This
  moment is timing-dependent; it is a structural golden, not deterministic output text.
- Error text uses `--error`; status/elapsed text 12px tertiary. A failed action is not
  represented as a fabricated successful transcript.

## Question and permission UI

Sources: `features/chat/{question-dock.css,question-dock.tsx,requests.tsx}`.

Question dock: surface, heavy 1px border, radius 18, overflow hidden, base font 13.
Header padding 8 14, gap 10, font 12 secondary. Body padding 4 10 12, max-height
`min(480,55dvh)`, overflow-y auto with overscroll contain. Question heading 14/21,
weight 500, margin 0 8 12. Choices gap 3, minimum row height 40, padding 10, radius 8,
gap 10. Radio/checkbox 15px with 2px top margin. Selected and focused choices use
`--selected`; descriptions 12px secondary; keyboard badges 11px/20px sans.
Permission requests are native pending gateway requests; full-access toggle is separate
from a request card. An external-directory read is attempted by the fixture to provoke
a request, but model/runtime policy can allow it. Do not confuse that toggle with a
captured permission dialog.

## Workspace: changes, files, terminal, canvas, side chat, subagents

Sources: `features/workbench/*`, `features/workspace/workspace-view.tsx`,
`features/{terminal,canvas,side-chat,subagents}/*`.

- Workbench flex-none column, min-width **340**, max-width `calc(100% − 320px)`,
  border-left 1px border token, surface background, base font 12. Expanded workbench
  absolutely fills workspace except the **44px rail**; underlying chat hidden.
- Workbench header height 40, padding 0 8 0 0, gap 8, bottom border 1. Heading left
  padding 12. Subtoolbar padding 5 10. Workbench input/select height 28, padding 0 9,
  radius 8; field uses inset heavy ring, select uses chip gradient/border/shadow.
- Rail width **44**, padding 0 4 6, gap 4, border-left 1. Buttons **36×36**, radius 10,
  tertiary idle; selected uses text + glaze + glaze-shadow, hover uses text + hover.
  Badges min-width/height 13, radius 7, font 9/600, 1px surface outline.
- Changes has Uncommitted/Base branch controls and a file tree. Clicking a file opens
  a preview; double-click keeps a document tab. Diff uses additions/deletions semantic
  colors. Files uses the same document/tab system with code editor and file previews.
- Terminal drawer uses native gateway PTYs, not fake output. Its CSS lives separately
  in `terminal-drawer.css` and `terminal.css`; focus and text sizing follow that panel.
- Canvas list is empty until an agent creates a real canvas. Empty copy and delete
  actions belong to `canvas-panel.tsx`. Browser/HTML canvas rendering is distinct from
  Rune text rendering and requires the platform webview.
- Side chat shares chat font, timeline and composer. Horizontal insets **16**, intro
  padding 24 16; intro heading 14/500, bottom margin 8, secondary copy. Tabs and new
  side-chat action occupy panel header. Status dots 6px; active uses accent, attention
  warning. Subagent list opens a read-only child conversation in the same panel.
- New-chat workspace picker selects Local/New worktree; branch picker appears for a
  new worktree. Existing sessions show folder/branch in Session details. The settings
  Projects page exposes project/worktree management; it is not a standalone root page.

## Find, context menus and feedback

Sources: `features/find/find.css`, `features/chat/timeline-find.tsx`,
`features/sessions/session-actions-menu.tsx`, `components/ui/*`.

Find bar **340×38** max width `100% − 24`, padding 0 4 0 12, gap 2, radius 10,
heavy 1px border, elevated/shadow. Input 13; count 12 tabular numbers; action buttons
26 square. Floating container top 10, sides 12, z-index 20; it does not push transcript
layout. Empty match count error-colored. Escape closes the bar.

Thread context menu includes pin, done, unread, mute, export Markdown/JSON. Thread
actions toolbar opens the same capabilities. App-brand menu provides Projects,
Appearance, Shortcuts and Usage. App menu minimum width 180, padding 4, radius 9,
margin-top 6, heavy border/shadow. Items padding 6 10, radius 5, font 13.
Thread search results height 80, padding 8 10, gap 4, radius 8; metadata 11px,
excerpt 12px. Disabled buttons opacity .45. Toasts depend on a real triggering action;
the screenshot inventory should not claim one unless an actual toast was observed.

## Settings (all six pages)

Sources: `features/settings/*`, `features/theme/appearance-settings.tsx`,
`features/{projects,shortcuts,usage,remote}/*` and settings sections in globals.css.

Shared page max-width **720**, margin auto, padding **24 24 64**, flex gap 16.
Heading **20px/26px, 600**, margin-bottom 8. Group radius 12, border 1, elevated
background. Row **min-height 52**, padding **10 16**, gap 16, separators 1px border.
Label 13, description 12 secondary, vertical label gap 2. Control gap 8, margin-left
auto, flex-shrink 0. Group heading 13/600. Chat typography preview padding 16.

- General: general app preferences and plugin settings; controls use shared select,
  switch, input and button primitives. Plugin sections are part of this page.
- Appearance: mode, dark/light preset/theme controls, previews and chat font sizing.
  Preserve semantic derivation, gradients, borders and selected swatches.
- Shortcuts: grouped command list, chord badges and platform-specific labels.
- Projects: project selection/configuration, instructions, icon/color and worktree
  controls. This page has its own width/layout overrides; consult computed rectangles.
- Usage: provider-specific usage/status and unavailable-provider state. An unconfigured
  account must display its real empty status, not invented usage data.
- Remote access: host-side connection/status and management controls. Native host
  operations and setup dependencies may be unavailable in a browser-only isolated run.

## Tasks and Apps

Sources: `features/tasks/tasks.css`, `features/apps/apps.css`.

Tasks page max-width 1440, padding 24 24 32, gap 18. Heading 20/26/600, summary
13px tertiary with tabular numerals. Project filter width 200. Four board columns
`repeat(4,minmax(232px,1fr))`, gap 12; each min-height 160, padding 8, gap 6, radius
14, border 1, surface-under background. Bucket tint Today warning, Week project-blue,
Someday project-purple, Done success. Empty board is a first-class captured state.
Apps displays the real installed-app list/empty surface; none are installed by this
fixture. Do not draw a canvas list in place of the Apps page.

## Colors, interaction and animation

Primary semantic roles: surface/surface-under/elevated/control; text/text-secondary/
text-tertiary; border/border-heavy; hover/selected; primary/on-primary; accent/accent-soft/
accent-text; error/success/warning; glaze/chip/composer and corresponding shadow tokens.
Never substitute fallback hex values for runtime theme output. Both modes' exact
resolved colors and gradients are in every capture's `tokens` and computed styles.

Global timings: fast **120ms**, medium **200ms**, slow **240ms**; ease-out
**cubic-bezier(.23,1,.32,1)**. Status appears in 150ms after a 1s delay; spinner is
900ms linear. Hover effects are gated by `(hover:hover)`; touch rules enlarge targets
and must not leak into these fine-pointer desktop captures. Focus generally uses
component backgrounds/rings rather than browser default outlines. Preserve pressed,
selected and disabled states separately. Scrollbars use `styles/scrollbars.css`;
menus contain overscroll, text/code panes scroll independently, composer remains docked.

Shared button default height 32, padding 0 14, gap 6, radius 8, font 13/500. Small
button height 28, padding 0 10, font 12. Icon button 28 square, radius 7. Primary uses
primary-glaze/primary-shadow, on-primary ink and weight 600; secondary uses chip,
chip-shadow and inset chip-border. Ghost uses transparent background and secondary
ink. Background/color/scale transitions use fast/ease-out. Segmented control has
padding/gap 2, radius 9 and well/well-shadow; selected thumb radius 7 and glaze.

## Icons and shortcuts

UI icons are `HugeiconsIcon` from `@hugeicons/react`, paths from
`@hugeicons/core-free-icons`, normally 14/16/18 according to component. Do not replace
with emoji or a different icon family. Source maps: settings General Settings02Icon,
Appearance PaintBoardIcon, Shortcuts KeyboardIcon, Projects Folder01Icon, Usage
DashboardSpeed01Icon, Remote Globe02Icon. Workspace picker uses Folder01Icon,
FolderGit2Icon, GitBranchIcon, Search01Icon, Tick02Icon, ArrowDown01Icon. Other exact
icon imports are colocated in `sidebar.tsx`, `session-row.tsx`, `workbench-rail.tsx`,
`composer.tsx`, `requests.tsx`, `question-dock.tsx`, `subagents-panel.tsx`.

Canonical keyboard catalog: `features/shortcuts/commands.ts`. macOS: Cmd+1…9 focused/
pinned thread; Cmd+I workspace; Cmd+J terminal; Cmd+B sidebar; Cmd+N or Cmd+Option+N
new chat; Cmd+O project; Cmd+Shift+D tasks; Cmd+, settings; Cmd+/ shortcuts; Cmd+F find;
Cmd+Shift+L composer; Cmd+Shift+K thread navigation; Cmd+Shift+M model; Cmd+Shift+E
thinking; Ctrl+T cycle thinking; Ctrl+B background running work; Escape twice stops.
Non-Mac uses Control as Mod, with Ctrl+Shift+B for background. Enter sends composer,
Shift+Enter inserts newline; menu arrows/Enter/Escape navigate and dismiss.

## Reproducibility limitations

Model-generated wording, elapsed labels, streamed output, timestamps, session IDs and
server-selected titles vary. Reuse a seeded environment for image comparisons; do not
expect a fresh free-model run to reproduce text byte-for-byte. Capture never mocks
model responses. Offline capture intentionally aborts browser API requests only.
No real user service or data is accessed. See README and the machine-readable failure
inventory for reachable-state coverage; absent states are not represented as goldens.

### Measured baseline (both desktop widths)

1. Sidebar width 300; resizing range 200–480 at these viewport sizes.
2. Toolbar height 40; main toolbar x=301.
3. Body font 14px/21px; system sans.
4. Sidebar thread row 280×32 inside 10px side insets; text 13px/19.5px.
5. Thread/composer-area width cap 768.
6. Empty composer body 720×118, radius 18.
7. Empty textarea 696×52, font 14px/21px, maximum height 240.
8. Composer padding top/right/bottom/left 14/10/10/14; footer gap and top margin 8.
9. Settings page width cap 720; standard row minimum 52, padding 10/16.
10. Workbench rail width 44; rail buttons 36×36 with 10px radius.
