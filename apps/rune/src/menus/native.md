# Native menu oracle

Source: installed `apps/desktop/node_modules/electron/package.json` **44.4.5**;
Electron tag `v44.4.5`, `lib/browser/default-menu.ts` and
`lib/browser/api/menu-item-roles.ts`. Desktop `main/index.ts` sets the app name
but installs no menu. Packaged name is OpenCodex; development name is OpenCodex Dev.
Below, `—` is a separator and a missing shortcut means none.

- **OpenCodex**: About OpenCodex; —; Services (system submenu); —;
  Hide OpenCodex ⌘H; Hide Others ⌥⌘H; Show All; —; Quit OpenCodex ⌘Q.
- **File**: Close Window ⌘W.
- **Edit**: Undo ⌘Z; Redo ⇧⌘Z; —; Cut ⌘X; Copy ⌘C; Paste ⌘V;
  Paste and Match Style ⌥⇧⌘V; Delete; Select All ⌘A; —;
  **Substitutions** (Show Substitutions; —; Smart Quotes; Smart Dashes;
  Text Replacement); **Speech** (Start Speaking; Stop Speaking).
- **View**: Reload ⌘R; Force Reload ⇧⌘R; Toggle Developer Tools ⌥⌘I;
  —; Actual Size ⌘0; Zoom In ⌘+; Zoom Out ⌘−; —;
  Toggle Full Screen ⌃⌘F.
- **Window**: Minimize ⌘M; Zoom; —; Bring All to Front.

The native AppKit adapter installs this hierarchy after Rune creates its native
responder. A temporary executable inspected every actual NSMenu/NSMenuItem and
key equivalent, including nested menus, without relying on WindowServer pixels.
The source is the packaged app oracle; Rune currently has no development-name flag.

## Boundaries, not a whole-feature parity claim

- Reload, Force Reload, Developer Tools and document zoom require a Chromium
  WebContents. Rune's native GPU scene has neither a DOM/cache nor Chromium
  DevTools. These six menu items retain their labels/shortcuts but have no action
  (AppKit disables them). Full screen, window roles and standard editor responder
  roles use AppKit selectors. No fake reload, zoom or developer tools is substituted.
- Rune only forwards its eight standard editor/window responder selectors. Its
  public API has no paste-as-plain-text, Delete, substitutions or speech responder
  registration. AppKit-owned fields can handle these additional selectors; native
  Rune editors cannot yet. These are framework integration gaps, not disabled
  application features presented as matching.
- `runtime/input/field_menu.rs` in pinned Rune already uses a native NSMenu for
  spelling suggestions/Learn Spelling and Cut/Copy/Paste. Task title/notes/new-task
  fields now opt into NSSpellChecker. The built-in menu omits Undo/Redo and macOS
  Select All, and supplies no extension hook for Electron's lookup/search group.
  Exact application-wide text menu parity requires an upstream field-menu hook or
  a custom editor adapter, including pointer-to-word selection and clipboard flags.
- Apps Code adds Electron's selected-text Look Up / Search with Google / Copy
  group. Google encoding follows URLSearchParams; Copy keeps whitespace. Look Up
  calls NSView's `showDefinitionForAttributedString:atPoint:`. Its actual system
  popover is not visually verified while this host is locked.
- Link/image/file menus in transcript/workbench and embedded web content remain
  their owning integrations' responsibility. They were not silently replaced by
  the selected-text menu. Electron `links.ts` uses Copy image, then Open link and
  Copy link; embedded browser tabs additionally use their own browser menu.
