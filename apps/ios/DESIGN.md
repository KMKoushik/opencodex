# Designing iPhone screens

The iPhone app matches the desktop app 1:1 in look, wording and behaviour, adapted only where a
phone needs it (touch targets, sheets instead of side panels, one column).

## Colors and themes

Never use system colors (`.blue`, `.secondary`, `Color(.systemBackground)`) for app chrome. Read
the active theme from the environment; token names are the desktop's CSS variables from
`apps/web/src/styles/tokens.css`, without the `--`:

```swift
@Environment(\.palette) private var palette

palette.color("surface")         // SwiftUI Color
palette.ui("text-secondary")     // UIColor, for UIKit
palette.gradient("composer")     // linear-gradient tokens
palette.shadows("card-shadow")   // box-shadow layers
```

`Core/Theme/themes.json` holds every desktop theme's derived tokens, exported by
`scripts/export-themes.ts` (run `bunx tsx apps/ios/scripts/export-themes.ts` from the repo root
after theme changes on the desktop). Settings → Appearance picks light and dark themes, as on the
desktop.

Common mappings: page `surface`, sidebar and secondary panes `surface-under`, cards and menus
`elevated`, text `text` / `text-secondary` / `text-tertiary`, hairlines `border`, pressed rows
`hover`, selected rows `selected`, primary buttons `primary` / `on-primary` (with
`primary-glaze`), user bubbles `bubble`, code `code-bg`, status `error` / `success` / `warning`,
project avatars `project-*` with `on-project`.

## Brand

`BrandIcon` is the calico in the theme's coat (Debug builds show the Dev coat, like the desktop's
development build). `Wordmark` is "opencodex" with "open" in `wordmark-muted`.

## Matching the desktop

- Find the desktop component first (`apps/web/src/features/...`) and copy its wording, states,
  order and spacing ratios. The CSS next to each component has the sizes and colors.
- Look at the desktop running against the same test gateway: the dev web UI is at
  `http://127.0.0.1:5173` (`bun run --cwd apps/web dev`, proxying to the gateway on `:4310`).
  `/tmp/ocref/ref.mjs` shows how to screenshot it with Playwright, including a 390×844 phone
  viewport. Compare your screen with it side by side before calling it done.
- Use SF Symbols that match the desktop's Hugeicons in meaning and weight; keep them light.
- Keep 44pt touch targets and Dynamic Type; the desktop's 32px rows become 44pt rows.

## Performance

Nothing per token outside the streaming cell. No per-row timers or tasks; tick once per list.
Coalesce refetches (250–400 ms) and refetch after `EventHub.onReconnect`.
