# Electron / Rune alignment

All positions are logical points, Rune minus Electron. Thresholds: |x| > 1, |baseline / icon center y| > 0.5. Native baselines are read from Rune’s already-shaped text layout, not inferred from element height. Electron baselines use a zero-height baseline strut inserted only after the screenshot. Vector geometry, font size/weight, system-versus-monospace family and colors are compared independently of whole-image MAE. Colors use premultiplied RGBA with a one-byte tolerance, avoiding translucent CSS canvas quantization artifacts. No pixel realignment or masks.

The measurement-only build copies the pinned Rune checkout into the isolated sweep directory and adds inspector fields; it does not modify the dependency checkout, app lockfile, layout or painter. Missing matches are explicit coverage gaps, never passes.

**136 screens; 7996 matched items; 0 flagged pairs; 316 unmatched Electron / 1018 unmatched Rune items.**

## home-empty-dark

55 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## sidebar-hidden-dark

28 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 552.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 492.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 445.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 553.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 383.98, 650.85, 14.00, 14.00
- Rune text: master at 403.98, 648.48, 41.57, 18.75

## sidebar-project-collapsed-dark

50 matched; 0 flagged; 1 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: New chat in atlas-api at 247.00, 307.00, 14.00, 14.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## sidebar-row-hover-dark

55 matched; 0 flagged; 2 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Caching parity fixture at 309.00, 341.00, 121.59, 14.00
- Electron text: 1 min ago at 309.00, 363.00, 55.74, 14.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## sidebar-focus-view-dark

67 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## app-menu-open-dark

59 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## thread-search-open-dark

72 matched; 0 flagged; 0 Electron / 7 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75
- Rune icon: search at 452.00, 218.00, 16.00, 16.00

## composer-focused-dark

55 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## composer-text-dark

55 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## composer-attachment-dark

58 matched; 0 flagged; 1 Electron / 7 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: Remove notes.txt at 636.25, 519.84, 14.00, 14.00
- Rune icon: raster image at 702.25, 8.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 188.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 235.65, 388.69, 21.75
- Rune text: × at 648.39, 516.35, 8.86, 21.00
- Rune icon: Choose model at 703.60, 635.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 685.85, 14.00, 14.00
- Rune text: master at 553.98, 683.48, 41.57, 18.75

## composer-slash-dark

69 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## composer-mention-dark

81 matched; 0 flagged; 1 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: svg at 447.25, 504.34, 16.00, 16.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## model-picker-open-dark

82 matched; 0 flagged; 2 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: Big Pickle, OpenCode at 1063.60, 259.84, 16.00, 16.00
- Electron icon: Big Pickle, OpenCode at 1063.60, 367.84, 16.00, 16.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75
- Rune icon: Big Pickle at 709.60, 258.85, 18.00, 18.00
- Rune text: ✓ at 1068.41, 258.10, 11.19, 19.50
- Rune icon: OpenCode at 709.60, 294.85, 18.00, 18.00
- Rune text: ✓ at 1068.41, 366.10, 11.19, 19.50

## model-picker-filtered-dark

65 matched; 0 flagged; 1 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: Big Pickle, OpenCode at 1063.60, 513.84, 16.00, 16.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75
- Rune icon: OpenCode at 709.60, 476.85, 18.00, 18.00
- Rune text: ✓ at 1068.41, 512.10, 11.19, 19.50

## project-actions-open-dark

39 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## project-edit-open-dark

42 matched; 0 flagged; 6 Electron / 13 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: Gray icon at 441.00, 537.25, 36.00, 36.00
- Electron control: Blue icon at 481.00, 537.25, 36.00, 36.00
- Electron control: Green icon at 521.00, 537.25, 36.00, 36.00
- Electron control: Orange icon at 561.00, 537.25, 36.00, 36.00
- Electron control: Pink icon at 601.00, 537.25, 36.00, 36.00
- Electron control: Purple icon at 641.00, 537.25, 36.00, 36.00
- Rune text: Project name at 441.00, 184.75, 398.00, 19.50
- Rune text: A at 456.34, 281.25, 17.32, 26.00
- Rune text: Images are cropped to a square. at 501.00, 302.25, 338.00, 18.00
- Rune text: Website or icon URL at 441.00, 340.25, 398.00, 19.50
- Rune text: Favicon uses the site's /favicon.ico. URL icons need an internet connection. at 441.00, 453.75, 398.00, 36.00
- Rune text: Icon color at 441.00, 509.75, 398.00, 19.50
- Rune text: A at 454.53, 548.75, 8.94, 13.00
- Rune text: A at 494.53, 548.75, 8.94, 13.00
- Rune text: A at 534.53, 548.75, 8.94, 13.00
- Rune text: A at 574.53, 548.75, 8.94, 13.00
- Rune text: A at 614.53, 548.75, 8.94, 13.00
- Rune text: A at 654.53, 548.75, 8.94, 13.00
- Rune text: /private/tmp/ocr-fx-align/proj/atlas-api at 441.00, 593.25, 398.00, 18.00

## project-copy-feedback-dark

34 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## worktree-picker-open-dark

62 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## worktree-new-selected-dark

57 matched; 0 flagged; 1 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Frommaster at 605.13, 650.47, 75.52, 14.50
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune text: From master at 605.13, 648.48, 75.52, 18.75

## worktrees-empty-dark

35 matched; 0 flagged; 0 Electron / 2 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Chats started in a new worktree get their own checkout. Removing one deletes it from disk; Git refuses if it has uncommitted changes, and it at 441.00, 388.00, 398.00, 54.00
- Rune text: No worktrees yet. Choose “New worktree” below a new chat. at 441.00, 442.00, 398.00, 18.00

## chat-markdown-top-dark

67 matched; 0 flagged; 1 Electron / 22 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 646.70, 13.00, 13.00
- Rune text: Explain this project with headings, lists, a table and code. at 735.60, 84.00, 392.65, 38.75
- Rune text: Project overview at 408.25, 151.00, 720.00, 34.30
- Rune text: The source lives in src/index.ts , with a README and local report. External links, such as at 408.25, 201.30, 720.00, 23.75
- Rune icon: Conversation at 532.09, 206.80, 13.00, 13.00
- Rune icon: Conversation at 703.02, 206.80, 13.00, 13.00
- Rune icon: Conversation at 809.35, 206.80, 13.00, 13.00
- Rune text: OpenCode, have no file icon. at 408.25, 225.05, 720.00, 22.75
- Rune text: Modules at 408.25, 271.80, 720.00, 29.40
- Rune text: 1. at 408.25, 317.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 317.20, 696.00, 22.75
- Rune text: 2. at 408.25, 345.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 345.95, 696.00, 22.75
- Rune text: 3. at 408.25, 374.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 374.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 604.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 649.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 643.20, 679.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: src/index.ts at 549.10, 201.30, 105.02, 23.00
- Rune text: README at 721.08, 201.30, 58.07, 23.00
- Rune text: local report at 827.76, 201.30, 75.83, 23.00
- Rune text: OpenCode at 408.25, 225.05, 70.34, 23.00

## chat-markdown-middle-dark

66 matched; 0 flagged; 2 Electron / 24 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 516.70, 13.00, 13.00
- Electron control: input at 432.25, 545.45, 13.00, 13.00
- Rune text: Project overview at 408.25, 21.00, 720.00, 34.30
- Rune text: The source lives in src/index.ts , with a README and local report. External links, such as at 408.25, 71.30, 720.00, 23.75
- Rune icon: Conversation at 532.09, 76.80, 13.00, 13.00
- Rune icon: Conversation at 703.02, 76.80, 13.00, 13.00
- Rune icon: Conversation at 809.35, 76.80, 13.00, 13.00
- Rune text: OpenCode, have no file icon. at 408.25, 95.05, 720.00, 22.75
- Rune text: Modules at 408.25, 141.80, 720.00, 29.40
- Rune text: 1. at 408.25, 187.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 187.20, 696.00, 22.75
- Rune text: 2. at 408.25, 215.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 215.95, 696.00, 22.75
- Rune text: 3. at 408.25, 244.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 244.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 474.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 519.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 513.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 541.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 595.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 649.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: src/index.ts at 549.10, 71.30, 105.02, 23.00
- Rune text: README at 721.08, 71.30, 58.07, 23.00
- Rune text: local report at 827.76, 71.30, 75.83, 23.00
- Rune text: OpenCode at 408.25, 95.05, 70.34, 23.00

## chat-markdown-bottom-dark

66 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-long-top-dark

57 matched; 0 flagged; 0 Electron / 9 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Turn 1: give a testing tip. at 946.70, 84.00, 181.55, 38.75
- Rune text: Testing tip 1: exercise the boundary before the happy path. at 408.25, 151.00, 720.00, 22.75
- Rune text: Turn 2: give a testing tip. at 944.73, 236.00, 183.52, 38.75
- Rune text: Testing tip 2: exercise the boundary before the happy path. at 408.25, 303.00, 720.00, 22.75
- Rune text: Turn 3: give a testing tip. at 944.41, 388.00, 183.84, 38.75
- Rune text: Testing tip 3: exercise the boundary before the happy path. at 408.25, 455.00, 720.00, 22.75
- Rune text: Turn 4: give a testing tip. at 944.18, 540.00, 184.07, 38.75
- Rune text: Testing tip 4: exercise the boundary before the happy path. at 408.25, 607.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-long-middle-dark

54 matched; 0 flagged; 0 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Turn 19: give a testing tip. at 937.93, 41.00, 190.32, 38.75
- Rune text: Testing tip 19: exercise the boundary before the happy path. at 408.25, 108.00, 720.00, 22.75
- Rune text: Turn 20: give a testing tip. at 936.07, 193.00, 192.18, 38.75
- Rune text: Testing tip 20: exercise the boundary before the happy path. at 408.25, 260.00, 720.00, 22.75
- Rune text: Turn 21: give a testing tip. at 938.39, 345.00, 189.86, 38.75
- Rune text: Testing tip 21: exercise the boundary before the happy path. at 408.25, 412.00, 720.00, 22.75
- Rune text: Turn 22: give a testing tip. at 936.44, 497.00, 191.81, 38.75
- Rune text: Testing tip 22: exercise the boundary before the happy path. at 408.25, 564.00, 720.00, 22.75
- Rune text: Turn 23: give a testing tip. at 936.11, 649.00, 192.14, 38.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-long-bottom-dark

54 matched; 0 flagged; 0 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Testing tip 37: exercise the boundary before the happy path. at 408.25, 65.00, 720.00, 22.75
- Rune text: Turn 38: give a testing tip. at 935.62, 150.00, 192.63, 38.75
- Rune text: Testing tip 38: exercise the boundary before the happy path. at 408.25, 217.00, 720.00, 22.75
- Rune text: Turn 39: give a testing tip. at 935.65, 302.00, 192.60, 38.75
- Rune text: Testing tip 39: exercise the boundary before the happy path. at 408.25, 369.00, 720.00, 22.75
- Rune text: Turn 40: give a testing tip. at 935.51, 454.00, 192.74, 38.75
- Rune text: Testing tip 40: exercise the boundary before the happy path. at 408.25, 521.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-tools-bottom-dark

57 matched; 0 flagged; 0 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Added multiply alongside the existing add function. at 408.25, 187.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 192.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 187.00, 53.00, 23.00

## chat-question-bottom-dark

61 matched; 0 flagged; 4 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 429.25, 533.02, 15.00, 15.00
- Electron control: input at 429.25, 594.01, 15.00, 15.00
- Electron control: input at 429.25, 655.00, 15.00, 15.00
- Electron control: input at 429.25, 698.00, 15.00, 15.00
- Rune text: Ask which deployment target I want. at 870.20, 84.00, 258.05, 38.75

## chat-architecture-bottom-dark

66 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-subagent-bottom-dark

55 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 978.61, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 408.25, 151.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-checklist-bottom-dark

55 matched; 0 flagged; 2 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 154.50, 13.00, 13.00
- Electron control: input at 432.25, 183.25, 13.00, 13.00
- Rune text: Write a release checklist. at 942.98, 84.00, 185.27, 38.75
- Rune icon: Tests at 434.69, 156.94, 8.13, 8.13
- Rune text: Tests at 449.25, 151.00, 679.00, 22.75
- Rune text: Release at 449.25, 179.75, 679.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-external-read-bottom-dark

66 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## tools-expanded-dark

58 matched; 0 flagged; 2 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Jump to latest at 736.90, 629.00, 82.70, 14.00
- Electron icon: svg at 716.90, 629.00, 14.00, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Added multiply alongside the existing add function. at 408.25, 227.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 232.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 227.00, 53.00, 23.00

## tool-rows-expanded-dark

76 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Used skill: at 452.25, 388.59, 61.50, 14.00
- Electron text: review at 513.75, 388.59, 36.75, 14.00
- Electron text: Jump to latest at 736.90, 629.00, 82.70, 14.00
- Electron icon: svg at 716.90, 629.00, 14.00, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Used skill: review at 452.25, 386.60, 98.25, 18.00
- Rune text: Added multiply alongside the existing add function. at 408.25, 428.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 433.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 428.00, 53.00, 23.00

## thoughts-expanded-dark

76 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Used skill: at 452.25, 388.59, 61.50, 14.00
- Electron text: review at 513.75, 388.59, 36.75, 14.00
- Electron text: Jump to latest at 736.90, 629.00, 82.70, 14.00
- Electron icon: svg at 716.90, 629.00, 14.00, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Used skill: review at 452.25, 386.60, 98.25, 18.00
- Rune text: Added multiply alongside the existing add function. at 408.25, 428.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 433.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 428.00, 53.00, 23.00

## question-selected-dark

61 matched; 0 flagged; 4 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 429.25, 533.02, 15.00, 15.00
- Electron control: input at 429.25, 594.01, 15.00, 15.00
- Electron control: input at 429.25, 655.00, 15.00, 15.00
- Electron control: input at 429.25, 698.00, 15.00, 15.00
- Rune text: Ask which deployment target I want. at 870.20, 84.00, 258.05, 38.75

## question-review-dark

55 matched; 0 flagged; 0 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Ask which deployment target I want. at 870.20, 84.00, 258.05, 38.75

## thread-actions-open-dark

72 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## thread-context-menu-dark

72 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## session-details-open-dark

94 matched; 0 flagged; 5 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Release dashboard at 957.00, 316.00, 107.73, 14.00
- Electron text: No MCP servers configured. at 949.00, 348.00, 159.06, 14.00
- Electron icon: svg at 1191.00, 317.00, 12.00, 12.00
- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## find-markdown-open-dark

70 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## find-long-open-dark

58 matched; 0 flagged; 0 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Testing tip 37: exercise the boundary before the happy path. at 408.25, 65.00, 720.00, 22.75
- Rune text: Turn 38: give a testing tip. at 935.62, 150.00, 192.63, 38.75
- Rune text: Testing tip 38: exercise the boundary before the happy path. at 408.25, 217.00, 720.00, 22.75
- Rune text: Turn 39: give a testing tip. at 935.65, 302.00, 192.60, 38.75
- Rune text: Testing tip 39: exercise the boundary before the happy path. at 408.25, 369.00, 720.00, 22.75
- Rune text: Turn 40: give a testing tip. at 935.51, 454.00, 192.74, 38.75
- Rune text: Testing tip 40: exercise the boundary before the happy path. at 408.25, 521.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## panel-terminal-dark

59 matched; 0 flagged; 3 Electron / 47 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Terminal1 at 341.50, 533.13, 59.00, 14.50
- Electron control: input at 432.25, 106.70, 13.00, 13.00
- Electron control: input at 432.25, 135.45, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 426.25, 64.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 109.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 103.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 131.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 185.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 239.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 472.00, 18.00, 18.00
- Rune text: Terminal 1 at 341.50, 531.13, 58.99, 18.75
- Rune text: k at 310.50, 597.50, 7.83, 13.00
- Rune text: o at 318.50, 597.50, 7.83, 13.00
- Rune text: u at 326.50, 597.50, 7.83, 13.00
- Rune text: s at 334.50, 597.50, 7.83, 13.00
- Rune text: h at 342.50, 597.50, 7.83, 13.00
- Rune text: i at 350.50, 597.50, 7.83, 13.00
- Rune text: k at 358.50, 597.50, 7.83, 13.00
- Rune text: @ at 366.50, 597.50, 7.83, 13.00
- Rune text: K at 374.50, 597.50, 7.83, 13.00
- Rune text: o at 382.50, 597.50, 7.83, 13.00
- Rune text: u at 390.50, 597.50, 7.83, 13.00
- Rune text: s at 398.50, 597.50, 7.83, 13.00
- Rune text: h at 406.50, 597.50, 7.83, 13.00
- Rune text: i at 414.50, 597.50, 7.83, 13.00
- Rune text: k at 422.50, 597.50, 7.83, 13.00
- Rune text: s at 430.50, 597.50, 7.83, 13.00
- Rune text: - at 438.50, 597.50, 7.83, 13.00
- Rune text: M at 446.50, 597.50, 7.83, 13.00
- Rune text: a at 454.50, 597.50, 7.83, 13.00
- Rune text: c at 462.50, 597.50, 7.83, 13.00
- Rune text: B at 470.50, 597.50, 7.83, 13.00
- Rune text: o at 478.50, 597.50, 7.83, 13.00
- Rune text: o at 486.50, 597.50, 7.83, 13.00
- Rune text: k at 494.50, 597.50, 7.83, 13.00
- Rune text: - at 502.50, 597.50, 7.83, 13.00
- Rune text: P at 510.50, 597.50, 7.83, 13.00
- Rune text: r at 518.50, 597.50, 7.83, 13.00
- Rune text: o at 526.50, 597.50, 7.83, 13.00
- Rune text: a at 542.50, 597.50, 7.83, 13.00
- Rune text: t at 550.50, 597.50, 7.83, 13.00
- Rune text: l at 558.50, 597.50, 7.83, 13.00
- Rune text: a at 566.50, 597.50, 7.83, 13.00
- Rune text: s at 574.50, 597.50, 7.83, 13.00
- Rune text: - at 582.50, 597.50, 7.83, 13.00
- Rune text: a at 590.50, 597.50, 7.83, 13.00
- Rune text: p at 598.50, 597.50, 7.83, 13.00
- Rune text: i at 606.50, 597.50, 7.83, 13.00
- Rune text: % at 622.50, 597.50, 7.83, 13.00
- Rune text: raster image at 638.50, 597.50, 7.83, 13.00

## panel-canvas-dark

68 matched; 0 flagged; 2 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00

## panel-side-chat-dark

75 matched; 0 flagged; 8 Electron / 11 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chat1 at 618.50, 12.13, 64.09, 14.50
- Electron text: It knows the main chat up to at 593.50, 95.00, 181.69, 16.50
- Electron text: 00:56 at 778.98, 95.00, 38.36, 16.50
- Electron text: . Questions here don’t interrupt the main chat. Edits ask for approval first. at 817.34, 95.00, 381.34, 16.50
- Electron text: To let side chats check the main chat’s latest progress, install the live context plugin in Settings → General. at 593.50, 145.00, 603.61, 14.00
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: Context usage unavailable at 852.88, 751.00, 20.00, 20.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: Side chat 1 at 618.50, 10.13, 64.09, 18.75
- Rune text: It knows the main chat up to 12:56 AM. Questions here don’t interrupt the main chat. Edits ask for approval first. at 593.50, 93.00, 626.50, 42.00
- Rune icon: Model at 891.88, 752.00, 18.00, 18.00

## side-chat-new-dark

77 matched; 0 flagged; 9 Electron / 12 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chat1 at 618.50, 12.13, 64.09, 14.50
- Electron text: Side chat2 at 747.59, 12.13, 65.84, 14.50
- Electron text: It knows the main chat up to at 593.50, 95.00, 181.69, 16.50
- Electron text: 01:56 at 778.98, 95.00, 36.04, 16.50
- Electron text: . Questions here don’t interrupt the main chat. Edits ask for approval first. at 815.02, 95.00, 381.34, 16.50
- Electron text: To let side chats check the main chat’s latest progress, install the live context plugin in Settings → General. at 593.50, 145.00, 603.61, 14.00
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: Context usage unavailable at 852.88, 751.00, 20.00, 20.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: Side chat 1 at 618.50, 10.13, 64.09, 18.75
- Rune text: Side chat 2 at 747.59, 10.13, 65.84, 18.75
- Rune text: It knows the main chat up to 1:56 AM. Questions here don’t interrupt the main chat. Edits ask for approval first. at 593.50, 93.00, 626.50, 42.00
- Rune icon: Model at 891.88, 752.00, 18.00, 18.00

## panel-subagents-dark

67 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 402.86, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 324.50, 151.00, 228.00, 45.50
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00

## subagents-list-dark

67 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 402.86, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 324.50, 151.00, 228.00, 45.50
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00

## subagent-conversation-dark

63 matched; 0 flagged; 0 Electron / 4 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 402.86, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 324.50, 151.00, 228.00, 45.50
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune icon: Workspace panel at 629.50, 79.00, 14.00, 14.00

## settings-general-dark

46 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they can also check its latest progress. It’ at 471.25, 453.00, 566.45, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-side-chat.js at 847.80, 471.50, 86.70, 14.00
- Electron text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and small tools shown beside the chat in your the at 471.25, 550.50, 552.46, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-canvas.js at 750.08, 569.00, 86.70, 14.00
- Rune text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they at 471.25, 451.00, 567.26, 18.00
- Rune text: can also check its latest progress. It’s hidden in all other sessions. /tmp/ocr-fx- at 471.25, 469.50, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-side-chat.js at 471.25, 488.00, 567.26, 18.50
- Rune text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and at 471.25, 548.50, 567.26, 18.00
- Rune text: small tools shown beside the chat in your theme. /tmp/ocr-fx- at 471.25, 567.00, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-canvas.js at 471.25, 585.50, 567.26, 18.50

## settings-appearance-dark

53 matched; 0 flagged; 5 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron input: 14 at 889.25, 267.25, 179.77, 16.00
- Electron control: Light accent color at 1006.25, 577.25, 22.00, 22.00
- Electron control: Light background color at 1006.25, 630.25, 22.00, 22.00
- Electron control: Light foreground color at 1006.25, 683.25, 22.00, 22.00
- Electron input: 45 at 889.25, 738.75, 186.00, 16.00

## settings-shortcuts-dark

43 matched; 0 flagged; 3 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Shortcuts work while OpenCodex is focused. Chat actions are available in an open conversation. Close a menu before using app shortcuts. Hold at 454.25, 116.00, 670.48, 16.50
- Electron text: ⌘ at 709.43, 137.00, 12.72, 16.50
- Electron text: to show thread numbers: pinned chats first, then chats in Focus. at 722.15, 137.00, 371.31, 16.50
- Rune text: Shortcuts work while OpenCodex is focused. Chat actions are available in an open conversation. Close a menu before using app shortcuts. Hold at 454.25, 114.00, 672.00, 63.00

## settings-projects-dark

33 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## settings-usage-dark

26 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## settings-remote-access-dark

41 matched; 0 flagged; 6 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: In Cloudflare Zero Trust, give your tunnel a public hostname whose service is at 471.25, 383.00, 377.72, 14.00
- Electron text: http://127.0.0.1:4317 at 528.05, 401.50, 151.72, 14.00
- Electron text: , then copy its token. For a tunnel made with the CLI, run at 679.77, 401.00, 150.14, 14.00
- Electron text: cloudflared tunnel token NAME at 640.75, 420.00, 173.39, 14.00
- Electron text: . at 500.15, 438.00, 3.56, 14.00
- Electron input: Paste the token at 869.25, 391.00, 240.00, 32.00
- Rune text: In Cloudflare Zero Trust, give your tunnel a public hostname whose at 471.25, 381.00, 382.00, 18.00
- Rune text: service is http://127.0.0.1:4317, then copy its token. For a at 471.25, 399.50, 382.00, 18.50
- Rune text: tunnel made with the CLI, run cloudflared tunnel token at 471.25, 418.00, 382.00, 18.50
- Rune text: NAME. at 471.25, 436.50, 382.00, 18.50
- Rune icon: Tunnel token at 869.25, 391.00, 240.00, 32.00

## usage-limits-open-dark

26 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## tasks-empty-dark

58 matched; 0 flagged; 0 Electron / 4 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Nothing planned for today. at 333.50, 174.50, 214.00, 38.75
- Rune text: Nothing else this week. at 577.50, 174.50, 214.00, 38.75
- Rune text: Ideas and later work go here. at 821.50, 174.50, 214.00, 38.75
- Rune text: Completed tasks stay here for two weeks. at 1065.50, 174.50, 214.00, 57.50

## apps-empty-dark

28 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: apps at 779.25, 184.00, 22.00, 22.00
- Rune text: No apps yet at 747.71, 214.00, 85.09, 22.50
- Rune text: An app is a canvas with code behind it that can call OpenCode. Ask for one in any chat, for example: “Every day, check open PRs and issues i at 594.25, 244.50, 392.00, 78.00

## connection-offline-dark

23 matched; 0 flagged; 0 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: Release dashboard at 45.50, 226.50, 11.00, 11.00
- Rune text: Release dashboard at 67.00, 222.25, 213.00, 19.50
- Rune icon: raster image at 702.25, 227.38, 176.00, 176.00
- Rune text: Can’t reach the gateway at 632.47, 407.38, 315.57, 37.50
- Rune text: Check that the OpenCodex server is running, then try again. at 590.97, 454.88, 398.57, 21.75

## home-empty-light

55 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## sidebar-hidden-light

28 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 552.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 492.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 445.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 553.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 383.98, 650.85, 14.00, 14.00
- Rune text: master at 403.98, 648.48, 41.57, 18.75

## sidebar-project-collapsed-light

50 matched; 0 flagged; 1 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: New chat in atlas-api at 247.00, 307.00, 14.00, 14.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## sidebar-row-hover-light

55 matched; 0 flagged; 2 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Caching parity fixture at 309.00, 341.00, 121.59, 14.00
- Electron text: 1 min ago at 309.00, 363.00, 55.74, 14.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## sidebar-focus-view-light

67 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## app-menu-open-light

59 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## thread-search-open-light

72 matched; 0 flagged; 0 Electron / 7 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75
- Rune icon: search at 452.00, 218.00, 16.00, 16.00

## composer-focused-light

55 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## composer-text-light

55 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## composer-attachment-light

58 matched; 0 flagged; 1 Electron / 7 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: Remove notes.txt at 636.25, 519.84, 14.00, 14.00
- Rune icon: raster image at 702.25, 8.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 188.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 235.65, 388.69, 21.75
- Rune text: × at 648.39, 516.35, 8.86, 21.00
- Rune icon: Choose model at 703.60, 635.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 685.85, 14.00, 14.00
- Rune text: master at 553.98, 683.48, 41.57, 18.75

## composer-slash-light

69 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## composer-mention-light

81 matched; 0 flagged; 1 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: svg at 447.25, 504.34, 16.00, 16.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## model-picker-open-light

82 matched; 0 flagged; 2 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: Big Pickle, OpenCode at 1063.60, 259.84, 16.00, 16.00
- Electron icon: Big Pickle, OpenCode at 1063.60, 367.84, 16.00, 16.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75
- Rune icon: Big Pickle at 709.60, 258.85, 18.00, 18.00
- Rune text: ✓ at 1068.41, 258.10, 11.19, 19.50
- Rune icon: OpenCode at 709.60, 294.85, 18.00, 18.00
- Rune text: ✓ at 1068.41, 366.10, 11.19, 19.50

## model-picker-filtered-light

65 matched; 0 flagged; 1 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron icon: Big Pickle, OpenCode at 1063.60, 513.84, 16.00, 16.00
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75
- Rune icon: OpenCode at 709.60, 476.85, 18.00, 18.00
- Rune text: ✓ at 1068.41, 512.10, 11.19, 19.50

## project-actions-open-light

39 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## project-edit-open-light

42 matched; 0 flagged; 6 Electron / 13 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: Gray icon at 441.00, 537.25, 36.00, 36.00
- Electron control: Blue icon at 481.00, 537.25, 36.00, 36.00
- Electron control: Green icon at 521.00, 537.25, 36.00, 36.00
- Electron control: Orange icon at 561.00, 537.25, 36.00, 36.00
- Electron control: Pink icon at 601.00, 537.25, 36.00, 36.00
- Electron control: Purple icon at 641.00, 537.25, 36.00, 36.00
- Rune text: Project name at 441.00, 184.75, 398.00, 19.50
- Rune text: A at 456.34, 281.25, 17.32, 26.00
- Rune text: Images are cropped to a square. at 501.00, 302.25, 338.00, 18.00
- Rune text: Website or icon URL at 441.00, 340.25, 398.00, 19.50
- Rune text: Favicon uses the site's /favicon.ico. URL icons need an internet connection. at 441.00, 453.75, 398.00, 36.00
- Rune text: Icon color at 441.00, 509.75, 398.00, 19.50
- Rune text: A at 454.53, 548.75, 8.94, 13.00
- Rune text: A at 494.53, 548.75, 8.94, 13.00
- Rune text: A at 534.53, 548.75, 8.94, 13.00
- Rune text: A at 574.53, 548.75, 8.94, 13.00
- Rune text: A at 614.53, 548.75, 8.94, 13.00
- Rune text: A at 654.53, 548.75, 8.94, 13.00
- Rune text: /private/tmp/ocr-fx-align/proj/atlas-api at 441.00, 593.25, 398.00, 18.00

## project-copy-feedback-light

34 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## worktree-picker-open-light

62 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## worktree-new-selected-light

57 matched; 0 flagged; 1 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Frommaster at 605.13, 650.47, 75.52, 14.50
- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune text: From master at 605.13, 648.48, 75.52, 18.75

## worktrees-empty-light

35 matched; 0 flagged; 0 Electron / 2 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Chats started in a new worktree get their own checkout. Removing one deletes it from disk; Git refuses if it has uncommitted changes, and it at 441.00, 388.00, 398.00, 54.00
- Rune text: No worktrees yet. Choose “New worktree” below a new chat. at 441.00, 442.00, 398.00, 18.00

## chat-markdown-top-light

67 matched; 0 flagged; 1 Electron / 22 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 646.70, 13.00, 13.00
- Rune text: Explain this project with headings, lists, a table and code. at 735.60, 84.00, 392.65, 38.75
- Rune text: Project overview at 408.25, 151.00, 720.00, 34.30
- Rune text: The source lives in src/index.ts , with a README and local report. External links, such as at 408.25, 201.30, 720.00, 23.75
- Rune icon: Conversation at 532.09, 206.80, 13.00, 13.00
- Rune icon: Conversation at 703.02, 206.80, 13.00, 13.00
- Rune icon: Conversation at 809.35, 206.80, 13.00, 13.00
- Rune text: OpenCode, have no file icon. at 408.25, 225.05, 720.00, 22.75
- Rune text: Modules at 408.25, 271.80, 720.00, 29.40
- Rune text: 1. at 408.25, 317.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 317.20, 696.00, 22.75
- Rune text: 2. at 408.25, 345.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 345.95, 696.00, 22.75
- Rune text: 3. at 408.25, 374.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 374.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 604.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 649.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 643.20, 679.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: src/index.ts at 549.10, 201.30, 105.02, 23.00
- Rune text: README at 721.08, 201.30, 58.07, 23.00
- Rune text: local report at 827.76, 201.30, 75.83, 23.00
- Rune text: OpenCode at 408.25, 225.05, 70.34, 23.00

## chat-markdown-middle-light

66 matched; 0 flagged; 2 Electron / 24 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 516.70, 13.00, 13.00
- Electron control: input at 432.25, 545.45, 13.00, 13.00
- Rune text: Project overview at 408.25, 21.00, 720.00, 34.30
- Rune text: The source lives in src/index.ts , with a README and local report. External links, such as at 408.25, 71.30, 720.00, 23.75
- Rune icon: Conversation at 532.09, 76.80, 13.00, 13.00
- Rune icon: Conversation at 703.02, 76.80, 13.00, 13.00
- Rune icon: Conversation at 809.35, 76.80, 13.00, 13.00
- Rune text: OpenCode, have no file icon. at 408.25, 95.05, 720.00, 22.75
- Rune text: Modules at 408.25, 141.80, 720.00, 29.40
- Rune text: 1. at 408.25, 187.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 187.20, 696.00, 22.75
- Rune text: 2. at 408.25, 215.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 215.95, 696.00, 22.75
- Rune text: 3. at 408.25, 244.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 244.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 474.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 519.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 513.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 541.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 595.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 649.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: src/index.ts at 549.10, 71.30, 105.02, 23.00
- Rune text: README at 721.08, 71.30, 58.07, 23.00
- Rune text: local report at 827.76, 71.30, 75.83, 23.00
- Rune text: OpenCode at 408.25, 95.05, 70.34, 23.00

## chat-markdown-bottom-light

66 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-long-top-light

57 matched; 0 flagged; 0 Electron / 9 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Turn 1: give a testing tip. at 946.70, 84.00, 181.55, 38.75
- Rune text: Testing tip 1: exercise the boundary before the happy path. at 408.25, 151.00, 720.00, 22.75
- Rune text: Turn 2: give a testing tip. at 944.73, 236.00, 183.52, 38.75
- Rune text: Testing tip 2: exercise the boundary before the happy path. at 408.25, 303.00, 720.00, 22.75
- Rune text: Turn 3: give a testing tip. at 944.41, 388.00, 183.84, 38.75
- Rune text: Testing tip 3: exercise the boundary before the happy path. at 408.25, 455.00, 720.00, 22.75
- Rune text: Turn 4: give a testing tip. at 944.18, 540.00, 184.07, 38.75
- Rune text: Testing tip 4: exercise the boundary before the happy path. at 408.25, 607.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-long-middle-light

54 matched; 0 flagged; 0 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Turn 19: give a testing tip. at 937.93, 41.00, 190.32, 38.75
- Rune text: Testing tip 19: exercise the boundary before the happy path. at 408.25, 108.00, 720.00, 22.75
- Rune text: Turn 20: give a testing tip. at 936.07, 193.00, 192.18, 38.75
- Rune text: Testing tip 20: exercise the boundary before the happy path. at 408.25, 260.00, 720.00, 22.75
- Rune text: Turn 21: give a testing tip. at 938.39, 345.00, 189.86, 38.75
- Rune text: Testing tip 21: exercise the boundary before the happy path. at 408.25, 412.00, 720.00, 22.75
- Rune text: Turn 22: give a testing tip. at 936.44, 497.00, 191.81, 38.75
- Rune text: Testing tip 22: exercise the boundary before the happy path. at 408.25, 564.00, 720.00, 22.75
- Rune text: Turn 23: give a testing tip. at 936.11, 649.00, 192.14, 38.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-long-bottom-light

54 matched; 0 flagged; 0 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Testing tip 37: exercise the boundary before the happy path. at 408.25, 65.00, 720.00, 22.75
- Rune text: Turn 38: give a testing tip. at 935.62, 150.00, 192.63, 38.75
- Rune text: Testing tip 38: exercise the boundary before the happy path. at 408.25, 217.00, 720.00, 22.75
- Rune text: Turn 39: give a testing tip. at 935.65, 302.00, 192.60, 38.75
- Rune text: Testing tip 39: exercise the boundary before the happy path. at 408.25, 369.00, 720.00, 22.75
- Rune text: Turn 40: give a testing tip. at 935.51, 454.00, 192.74, 38.75
- Rune text: Testing tip 40: exercise the boundary before the happy path. at 408.25, 521.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-tools-bottom-light

57 matched; 0 flagged; 0 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Added multiply alongside the existing add function. at 408.25, 187.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 192.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 187.00, 53.00, 23.00

## chat-question-bottom-light

61 matched; 0 flagged; 4 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 429.25, 533.02, 15.00, 15.00
- Electron control: input at 429.25, 594.01, 15.00, 15.00
- Electron control: input at 429.25, 655.00, 15.00, 15.00
- Electron control: input at 429.25, 698.00, 15.00, 15.00
- Rune text: Ask which deployment target I want. at 870.20, 84.00, 258.05, 38.75

## chat-architecture-bottom-light

66 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-subagent-bottom-light

55 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 978.61, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 408.25, 151.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-checklist-bottom-light

55 matched; 0 flagged; 2 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 154.50, 13.00, 13.00
- Electron control: input at 432.25, 183.25, 13.00, 13.00
- Rune text: Write a release checklist. at 942.98, 84.00, 185.27, 38.75
- Rune icon: Tests at 434.69, 156.94, 8.13, 8.13
- Rune text: Tests at 449.25, 151.00, 679.00, 22.75
- Rune text: Release at 449.25, 179.75, 679.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## chat-external-read-bottom-light

66 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## tools-expanded-light

58 matched; 0 flagged; 2 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Jump to latest at 736.90, 629.00, 82.70, 14.00
- Electron icon: svg at 716.90, 629.00, 14.00, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Added multiply alongside the existing add function. at 408.25, 227.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 232.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 227.00, 53.00, 23.00

## tool-rows-expanded-light

76 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Used skill: at 452.25, 388.59, 61.50, 14.00
- Electron text: review at 513.75, 388.59, 36.75, 14.00
- Electron text: Jump to latest at 736.90, 629.00, 82.70, 14.00
- Electron icon: svg at 716.90, 629.00, 14.00, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Used skill: review at 452.25, 386.60, 98.25, 18.00
- Rune text: Added multiply alongside the existing add function. at 408.25, 428.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 433.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 428.00, 53.00, 23.00

## thoughts-expanded-light

76 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Used skill: at 452.25, 388.59, 61.50, 14.00
- Electron text: review at 513.75, 388.59, 36.75, 14.00
- Electron text: Jump to latest at 736.90, 629.00, 82.70, 14.00
- Electron icon: svg at 716.90, 629.00, 14.00, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 84.00, 379.01, 38.75
- Rune text: Used skill: review at 452.25, 386.60, 98.25, 18.00
- Rune text: Added multiply alongside the existing add function. at 408.25, 428.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 433.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 428.00, 53.00, 23.00

## question-selected-light

61 matched; 0 flagged; 4 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 429.25, 533.02, 15.00, 15.00
- Electron control: input at 429.25, 594.01, 15.00, 15.00
- Electron control: input at 429.25, 655.00, 15.00, 15.00
- Electron control: input at 429.25, 698.00, 15.00, 15.00
- Rune text: Ask which deployment target I want. at 870.20, 84.00, 258.05, 38.75

## question-review-light

55 matched; 0 flagged; 0 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Ask which deployment target I want. at 870.20, 84.00, 258.05, 38.75

## thread-actions-open-light

72 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## thread-context-menu-light

72 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## session-details-open-light

94 matched; 0 flagged; 5 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Release dashboard at 957.00, 316.00, 107.73, 14.00
- Electron text: No MCP servers configured. at 949.00, 348.00, 159.06, 14.00
- Electron icon: svg at 1191.00, 317.00, 12.00, 12.00
- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## find-markdown-open-light

70 matched; 0 flagged; 2 Electron / 14 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 432.25, 386.70, 13.00, 13.00
- Electron control: input at 432.25, 415.45, 13.00, 13.00
- Rune text: Modules at 408.25, 11.80, 720.00, 29.40
- Rune text: 1. at 408.25, 57.20, 24.00, 22.75
- Rune text: API — accepts requests and validates input. at 432.25, 57.20, 696.00, 22.75
- Rune text: 2. at 408.25, 85.95, 24.00, 22.75
- Rune text: Storage — persists records and caches lookups. at 432.25, 85.95, 696.00, 22.75
- Rune text: 3. at 408.25, 114.70, 24.00, 22.75
- Rune text: Tests — cover failure paths and boundaries. at 432.25, 114.70, 696.00, 22.75
- Rune text: Keep the transport separate from execution. at 426.25, 344.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 389.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 383.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 411.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 465.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 519.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## find-long-open-light

58 matched; 0 flagged; 0 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Testing tip 37: exercise the boundary before the happy path. at 408.25, 65.00, 720.00, 22.75
- Rune text: Turn 38: give a testing tip. at 935.62, 150.00, 192.63, 38.75
- Rune text: Testing tip 38: exercise the boundary before the happy path. at 408.25, 217.00, 720.00, 22.75
- Rune text: Turn 39: give a testing tip. at 935.65, 302.00, 192.60, 38.75
- Rune text: Testing tip 39: exercise the boundary before the happy path. at 408.25, 369.00, 720.00, 22.75
- Rune text: Turn 40: give a testing tip. at 935.51, 454.00, 192.74, 38.75
- Rune text: Testing tip 40: exercise the boundary before the happy path. at 408.25, 521.00, 720.00, 22.75
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00

## panel-terminal-light

59 matched; 0 flagged; 3 Electron / 47 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Terminal1 at 341.50, 533.13, 59.00, 14.50
- Electron control: input at 432.25, 106.70, 13.00, 13.00
- Electron control: input at 432.25, 135.45, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 426.25, 64.45, 702.00, 22.75
- Rune icon: Read the source at 434.69, 109.13, 8.13, 8.13
- Rune text: Read the source at 449.25, 103.20, 679.00, 22.75
- Rune text: Review the changes at 449.25, 131.95, 679.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 425.25, 185.70, 686.00, 23.25
- Rune text: Inline code , bold, emphasis and strikethrough stay selectable. at 408.25, 239.95, 720.00, 23.75
- Rune icon: Choose model at 681.60, 472.00, 18.00, 18.00
- Rune text: Terminal 1 at 341.50, 531.13, 58.99, 18.75
- Rune text: k at 310.50, 597.50, 7.83, 13.00
- Rune text: o at 318.50, 597.50, 7.83, 13.00
- Rune text: u at 326.50, 597.50, 7.83, 13.00
- Rune text: s at 334.50, 597.50, 7.83, 13.00
- Rune text: h at 342.50, 597.50, 7.83, 13.00
- Rune text: i at 350.50, 597.50, 7.83, 13.00
- Rune text: k at 358.50, 597.50, 7.83, 13.00
- Rune text: @ at 366.50, 597.50, 7.83, 13.00
- Rune text: K at 374.50, 597.50, 7.83, 13.00
- Rune text: o at 382.50, 597.50, 7.83, 13.00
- Rune text: u at 390.50, 597.50, 7.83, 13.00
- Rune text: s at 398.50, 597.50, 7.83, 13.00
- Rune text: h at 406.50, 597.50, 7.83, 13.00
- Rune text: i at 414.50, 597.50, 7.83, 13.00
- Rune text: k at 422.50, 597.50, 7.83, 13.00
- Rune text: s at 430.50, 597.50, 7.83, 13.00
- Rune text: - at 438.50, 597.50, 7.83, 13.00
- Rune text: M at 446.50, 597.50, 7.83, 13.00
- Rune text: a at 454.50, 597.50, 7.83, 13.00
- Rune text: c at 462.50, 597.50, 7.83, 13.00
- Rune text: B at 470.50, 597.50, 7.83, 13.00
- Rune text: o at 478.50, 597.50, 7.83, 13.00
- Rune text: o at 486.50, 597.50, 7.83, 13.00
- Rune text: k at 494.50, 597.50, 7.83, 13.00
- Rune text: - at 502.50, 597.50, 7.83, 13.00
- Rune text: P at 510.50, 597.50, 7.83, 13.00
- Rune text: r at 518.50, 597.50, 7.83, 13.00
- Rune text: o at 526.50, 597.50, 7.83, 13.00
- Rune text: a at 542.50, 597.50, 7.83, 13.00
- Rune text: t at 550.50, 597.50, 7.83, 13.00
- Rune text: l at 558.50, 597.50, 7.83, 13.00
- Rune text: a at 566.50, 597.50, 7.83, 13.00
- Rune text: s at 574.50, 597.50, 7.83, 13.00
- Rune text: - at 582.50, 597.50, 7.83, 13.00
- Rune text: a at 590.50, 597.50, 7.83, 13.00
- Rune text: p at 598.50, 597.50, 7.83, 13.00
- Rune text: i at 606.50, 597.50, 7.83, 13.00
- Rune text: % at 622.50, 597.50, 7.83, 13.00
- Rune text: raster image at 638.50, 597.50, 7.83, 13.00

## panel-canvas-light

68 matched; 0 flagged; 2 Electron / 8 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00

## panel-side-chat-light

75 matched; 0 flagged; 8 Electron / 11 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chat1 at 618.50, 12.13, 64.09, 14.50
- Electron text: It knows the main chat up to at 593.50, 95.00, 181.69, 16.50
- Electron text: 00:56 at 778.98, 95.00, 38.36, 16.50
- Electron text: . Questions here don’t interrupt the main chat. Edits ask for approval first. at 817.34, 95.00, 381.34, 16.50
- Electron text: To let side chats check the main chat’s latest progress, install the live context plugin in Settings → General. at 593.50, 145.00, 603.61, 14.00
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: Context usage unavailable at 852.88, 751.00, 20.00, 20.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: Side chat 1 at 618.50, 10.13, 64.09, 18.75
- Rune text: It knows the main chat up to 12:56 AM. Questions here don’t interrupt the main chat. Edits ask for approval first. at 593.50, 93.00, 626.50, 42.00
- Rune icon: Model at 891.88, 752.00, 18.00, 18.00

## side-chat-new-light

77 matched; 0 flagged; 9 Electron / 12 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chat1 at 618.50, 12.13, 64.09, 14.50
- Electron text: Side chat2 at 747.59, 12.13, 65.84, 14.50
- Electron text: It knows the main chat up to at 593.50, 95.00, 181.69, 16.50
- Electron text: 02:05 at 778.98, 95.00, 37.67, 16.50
- Electron text: . Questions here don’t interrupt the main chat. Edits ask for approval first. at 816.65, 95.00, 381.34, 16.50
- Electron text: To let side chats check the main chat’s latest progress, install the live context plugin in Settings → General. at 593.50, 145.00, 603.61, 14.00
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: Context usage unavailable at 852.88, 751.00, 20.00, 20.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: Side chat 1 at 618.50, 10.13, 64.09, 18.75
- Rune text: Side chat 2 at 747.59, 10.13, 65.84, 18.75
- Rune text: It knows the main chat up to 2:05 AM. Questions here don’t interrupt the main chat. Edits ask for approval first. at 593.50, 93.00, 626.50, 42.00
- Rune icon: Model at 891.88, 752.00, 18.00, 18.00

## panel-subagents-light

67 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 402.86, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 324.50, 151.00, 228.00, 45.50
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00

## subagents-list-light

67 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 402.86, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 324.50, 151.00, 228.00, 45.50
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00

## subagent-conversation-light

63 matched; 0 flagged; 0 Electron / 4 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Inspect the project. at 402.86, 84.00, 149.64, 38.75
- Rune text: The source is small and the transport is isolated. at 324.50, 151.00, 228.00, 45.50
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune icon: Workspace panel at 629.50, 79.00, 14.00, 14.00

## settings-general-light

46 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they can also check its latest progress. It’ at 471.25, 453.00, 566.45, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-side-chat.js at 847.80, 471.50, 86.70, 14.00
- Electron text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and small tools shown beside the chat in your the at 471.25, 550.50, 552.46, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-canvas.js at 750.08, 569.00, 86.70, 14.00
- Rune text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they at 471.25, 451.00, 567.26, 18.00
- Rune text: can also check its latest progress. It’s hidden in all other sessions. /tmp/ocr-fx- at 471.25, 469.50, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-side-chat.js at 471.25, 488.00, 567.26, 18.50
- Rune text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and at 471.25, 548.50, 567.26, 18.00
- Rune text: small tools shown beside the chat in your theme. /tmp/ocr-fx- at 471.25, 567.00, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-canvas.js at 471.25, 585.50, 567.26, 18.50

## settings-appearance-light

53 matched; 0 flagged; 5 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron input: 14 at 889.25, 267.25, 179.77, 16.00
- Electron control: Light accent color at 1006.25, 577.25, 22.00, 22.00
- Electron control: Light background color at 1006.25, 630.25, 22.00, 22.00
- Electron control: Light foreground color at 1006.25, 683.25, 22.00, 22.00
- Electron input: 45 at 889.25, 738.75, 186.00, 16.00

## settings-shortcuts-light

43 matched; 0 flagged; 3 Electron / 1 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Shortcuts work while OpenCodex is focused. Chat actions are available in an open conversation. Close a menu before using app shortcuts. Hold at 454.25, 116.00, 670.48, 16.50
- Electron text: ⌘ at 709.43, 137.00, 12.72, 16.50
- Electron text: to show thread numbers: pinned chats first, then chats in Focus. at 722.15, 137.00, 371.31, 16.50
- Rune text: Shortcuts work while OpenCodex is focused. Chat actions are available in an open conversation. Close a menu before using app shortcuts. Hold at 454.25, 114.00, 672.00, 63.00

## settings-projects-light

33 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## settings-usage-light

26 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## settings-remote-access-light

41 matched; 0 flagged; 6 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: In Cloudflare Zero Trust, give your tunnel a public hostname whose service is at 471.25, 383.00, 377.72, 14.00
- Electron text: http://127.0.0.1:4317 at 528.05, 401.50, 151.72, 14.00
- Electron text: , then copy its token. For a tunnel made with the CLI, run at 679.77, 401.00, 150.14, 14.00
- Electron text: cloudflared tunnel token NAME at 640.75, 420.00, 173.39, 14.00
- Electron text: . at 500.15, 438.00, 3.56, 14.00
- Electron input: Paste the token at 869.25, 391.00, 240.00, 32.00
- Rune text: In Cloudflare Zero Trust, give your tunnel a public hostname whose at 471.25, 381.00, 382.00, 18.00
- Rune text: service is http://127.0.0.1:4317, then copy its token. For a at 471.25, 399.50, 382.00, 18.50
- Rune text: tunnel made with the CLI, run cloudflared tunnel token at 471.25, 418.00, 382.00, 18.50
- Rune text: NAME. at 471.25, 436.50, 382.00, 18.50
- Rune icon: Tunnel token at 869.25, 391.00, 240.00, 32.00

## usage-limits-open-light

26 matched; 0 flagged; 0 Electron / 0 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

## tasks-empty-light

58 matched; 0 flagged; 0 Electron / 4 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune text: Nothing planned for today. at 333.50, 174.50, 214.00, 38.75
- Rune text: Nothing else this week. at 577.50, 174.50, 214.00, 38.75
- Rune text: Ideas and later work go here. at 821.50, 174.50, 214.00, 38.75
- Rune text: Completed tasks stay here for two weeks. at 1065.50, 174.50, 214.00, 57.50

## apps-empty-light

28 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: apps at 779.25, 184.00, 22.00, 22.00
- Rune text: No apps yet at 747.71, 214.00, 85.09, 22.50
- Rune text: An app is a canvas with code behind it that can call OpenCode. Ask for one in any chat, for example: “Every day, check open PRs and issues i at 594.25, 244.50, 392.00, 78.00

## connection-offline-light

23 matched; 0 flagged; 0 Electron / 5 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: Release dashboard at 45.50, 226.50, 11.00, 11.00
- Rune text: Release dashboard at 67.00, 222.25, 213.00, 19.50
- Rune icon: raster image at 702.25, 227.38, 176.00, 176.00
- Rune text: Can’t reach the gateway at 632.47, 407.38, 315.57, 37.50
- Rune text: Check that the OpenCodex server is running, then try again. at 590.97, 454.88, 398.57, 21.75

## home-no-project-dark

27 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 225.38, 176.00, 176.00
- Rune text: Open a project at 694.84, 405.38, 190.84, 37.50
- Rune text: Choose a folder on the machine running OpenCodex. at 614.25, 452.88, 352.00, 21.75

## project-open-dialog-dark

33 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 225.38, 176.00, 176.00
- Rune text: Open a project at 694.84, 405.38, 190.84, 37.50
- Rune text: Choose a folder on the machine running OpenCodex. at 614.25, 452.88, 352.00, 21.75

## panel-changes-dark

84 matched; 0 flagged; 5 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: index. at 1078.88, 148.50, 35.01, 14.50
- Electron text: ts at 1113.89, 148.50, 10.89, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune icon: src/index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: index.ts at 1078.89, 146.63, 117.92, 18.75

## panel-files-dark

85 matched; 0 flagged; 6 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: README. at 1060.19, 172.50, 54.95, 14.50
- Electron text: md at 1115.13, 172.50, 18.48, 14.50
- Electron text: report. at 1060.19, 196.50, 39.62, 14.50
- Electron text: html at 1099.80, 196.50, 25.79, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: README.md at 1060.20, 170.63, 136.62, 18.75
- Rune text: report.html at 1060.20, 194.63, 136.62, 18.75

## panel-diff-open-dark

95 matched; 0 flagged; 39 Electron / 12 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: export at 617.13, 122.50, 45.16, 14.50
- Electron text: const at 662.28, 122.50, 45.16, 14.50
- Electron text: add at 707.44, 122.50, 30.11, 14.50
- Electron text: = at 737.55, 122.50, 15.05, 14.50
- Electron text: ( at 752.60, 122.50, 15.05, 14.50
- Electron text: a at 767.66, 122.50, 7.53, 14.50
- Electron text: : at 775.19, 122.50, 7.53, 14.50
- Electron text: number at 782.72, 122.50, 52.68, 14.50
- Electron text: , at 835.40, 122.50, 7.53, 14.50
- Electron text: b at 842.93, 122.50, 15.05, 14.50
- Electron text: : at 857.98, 122.50, 7.53, 14.50
- Electron text: number at 865.52, 122.50, 52.68, 14.50
- Electron text: ) at 918.20, 122.50, 7.53, 14.50
- Electron text: => at 925.73, 122.50, 22.58, 14.50
- Electron text: a at 948.30, 122.50, 22.58, 14.50
- Electron text: + at 970.88, 122.50, 7.53, 14.50
- Electron text: b at 978.41, 122.50, 15.05, 14.50
- Electron text: ; at 993.47, 122.50, 7.53, 14.50
- Electron text: export at 617.13, 142.50, 45.16, 14.50
- Electron text: const at 662.28, 142.50, 45.16, 14.50
- Electron text: multiply at 707.44, 142.50, 67.73, 14.50
- Electron text: = at 775.17, 142.50, 15.05, 14.50
- Electron text: ( at 790.23, 142.50, 15.05, 14.50
- Electron text: a at 805.28, 142.50, 7.53, 14.50
- Electron text: : at 812.81, 142.50, 7.53, 14.50
- Electron text: number at 820.34, 142.50, 52.68, 14.50
- Electron text: , at 873.02, 142.50, 7.53, 14.50
- Electron text: b at 880.55, 142.50, 15.05, 14.50
- Electron text: : at 895.61, 142.50, 7.53, 14.50
- Electron text: number at 903.14, 142.50, 52.68, 14.50
- Electron text: ) at 955.82, 142.50, 7.53, 14.50
- Electron text: => at 963.35, 142.50, 22.58, 14.50
- Electron text: a at 985.93, 142.50, 22.58, 14.50
- Electron text: * at 1008.51, 142.50, 7.53, 14.50
- Electron text: index. at 1078.88, 148.50, 35.01, 14.50
- Electron text: ts at 1113.89, 148.50, 10.89, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: export const add = (a: number, b: number) => a + b; at 617.13, 120.00, 421.44, 20.00
- Rune text: export const multiply = (a: number, b: number) => a * b; at 617.13, 140.00, 421.44, 20.00
- Rune icon: src/index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: index.ts at 1078.89, 146.63, 117.92, 18.75

## panel-file-open-dark

94 matched; 0 flagged; 7 Electron / 11 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: # atlas-api at 624.50, 87.00, 79.48, 14.00
- Electron text: README. at 1060.19, 172.50, 54.95, 14.50
- Electron text: md at 1115.13, 172.50, 18.48, 14.50
- Electron text: report. at 1060.19, 196.50, 39.62, 14.50
- Electron text: html at 1099.80, 196.50, 25.79, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune input: # atlas-api at 624.50, 84.00, 389.50, 20.40
- Rune text: README.md at 1060.20, 170.63, 136.62, 18.75
- Rune text: report.html at 1060.20, 194.63, 136.62, 18.75

## tool-detail-open-dark

78 matched; 0 flagged; 2 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Used skill: at 452.25, 481.88, 61.50, 14.00
- Electron text: review at 513.75, 481.88, 36.75, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 28.00, 379.01, 38.75
- Rune text: Used skill: review at 452.25, 479.91, 98.25, 18.00
- Rune text: Added multiply alongside the existing add function. at 408.25, 521.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 526.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 521.00, 53.00, 23.00

## settings-general-bottom-dark

47 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they can also check its latest progress. It’ at 471.25, 192.00, 566.45, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-side-chat.js at 847.80, 210.50, 86.70, 14.00
- Electron text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and small tools shown beside the chat in your the at 471.25, 289.50, 552.46, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-canvas.js at 750.08, 308.00, 86.70, 14.00
- Rune text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they at 471.25, 190.00, 567.26, 18.00
- Rune text: can also check its latest progress. It’s hidden in all other sessions. /tmp/ocr-fx- at 471.25, 208.50, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-side-chat.js at 471.25, 227.00, 567.26, 18.50
- Rune text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and at 471.25, 287.50, 567.26, 18.00
- Rune text: small tools shown beside the chat in your theme. /tmp/ocr-fx- at 471.25, 306.00, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-canvas.js at 471.25, 324.50, 567.26, 18.50

## home-no-project-light

27 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 225.38, 176.00, 176.00
- Rune text: Open a project at 694.84, 405.38, 190.84, 37.50
- Rune text: Choose a folder on the machine running OpenCodex. at 614.25, 452.88, 352.00, 21.75

## project-open-dialog-light

33 matched; 0 flagged; 0 Electron / 3 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 225.38, 176.00, 176.00
- Rune text: Open a project at 694.84, 405.38, 190.84, 37.50
- Rune text: Choose a folder on the machine running OpenCodex. at 614.25, 452.88, 352.00, 21.75

## panel-changes-light

84 matched; 0 flagged; 5 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: index. at 1078.88, 148.50, 35.01, 14.50
- Electron text: ts at 1113.89, 148.50, 10.89, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune icon: src/index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: index.ts at 1078.89, 146.63, 117.92, 18.75

## panel-files-light

85 matched; 0 flagged; 6 Electron / 10 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: README. at 1060.19, 172.50, 54.95, 14.50
- Electron text: md at 1115.13, 172.50, 18.48, 14.50
- Electron text: report. at 1060.19, 196.50, 39.62, 14.50
- Electron text: html at 1099.80, 196.50, 25.79, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: README.md at 1060.20, 170.63, 136.62, 18.75
- Rune text: report.html at 1060.20, 194.63, 136.62, 18.75

## panel-diff-open-light

95 matched; 0 flagged; 39 Electron / 12 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: export at 617.13, 122.50, 45.16, 14.50
- Electron text: const at 662.28, 122.50, 45.16, 14.50
- Electron text: add at 707.44, 122.50, 30.11, 14.50
- Electron text: = at 737.55, 122.50, 15.05, 14.50
- Electron text: ( at 752.60, 122.50, 15.05, 14.50
- Electron text: a at 767.66, 122.50, 7.53, 14.50
- Electron text: : at 775.19, 122.50, 7.53, 14.50
- Electron text: number at 782.72, 122.50, 52.68, 14.50
- Electron text: , at 835.40, 122.50, 7.53, 14.50
- Electron text: b at 842.93, 122.50, 15.05, 14.50
- Electron text: : at 857.98, 122.50, 7.53, 14.50
- Electron text: number at 865.52, 122.50, 52.68, 14.50
- Electron text: ) at 918.20, 122.50, 7.53, 14.50
- Electron text: => at 925.73, 122.50, 22.58, 14.50
- Electron text: a at 948.30, 122.50, 22.58, 14.50
- Electron text: + at 970.88, 122.50, 7.53, 14.50
- Electron text: b at 978.41, 122.50, 15.05, 14.50
- Electron text: ; at 993.47, 122.50, 7.53, 14.50
- Electron text: export at 617.13, 142.50, 45.16, 14.50
- Electron text: const at 662.28, 142.50, 45.16, 14.50
- Electron text: multiply at 707.44, 142.50, 67.73, 14.50
- Electron text: = at 775.17, 142.50, 15.05, 14.50
- Electron text: ( at 790.23, 142.50, 15.05, 14.50
- Electron text: a at 805.28, 142.50, 7.53, 14.50
- Electron text: : at 812.81, 142.50, 7.53, 14.50
- Electron text: number at 820.34, 142.50, 52.68, 14.50
- Electron text: , at 873.02, 142.50, 7.53, 14.50
- Electron text: b at 880.55, 142.50, 15.05, 14.50
- Electron text: : at 895.61, 142.50, 7.53, 14.50
- Electron text: number at 903.14, 142.50, 52.68, 14.50
- Electron text: ) at 955.82, 142.50, 7.53, 14.50
- Electron text: => at 963.35, 142.50, 22.58, 14.50
- Electron text: a at 985.93, 142.50, 22.58, 14.50
- Electron text: * at 1008.51, 142.50, 7.53, 14.50
- Electron text: index. at 1078.88, 148.50, 35.01, 14.50
- Electron text: ts at 1113.89, 148.50, 10.89, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Electron icon: index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune text: export const add = (a: number, b: number) => a + b; at 617.13, 120.00, 421.44, 20.00
- Rune text: export const multiply = (a: number, b: number) => a * b; at 617.13, 140.00, 421.44, 20.00
- Rune icon: src/index.ts at 1058.09, 148.00, 16.00, 16.00
- Rune text: index.ts at 1078.89, 146.63, 117.92, 18.75

## panel-file-open-light

94 matched; 0 flagged; 7 Electron / 11 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: # atlas-api at 624.50, 87.00, 79.48, 14.00
- Electron text: README. at 1060.19, 172.50, 54.95, 14.50
- Electron text: md at 1115.13, 172.50, 18.48, 14.50
- Electron text: report. at 1060.19, 196.50, 39.62, 14.50
- Electron text: html at 1099.80, 196.50, 25.79, 14.50
- Electron control: input at 348.50, 328.20, 13.00, 13.00
- Electron control: input at 348.50, 356.95, 13.00, 13.00
- Rune text: Keep the transport separate from execution. at 342.50, 263.20, 210.00, 45.50
- Rune icon: Read the source at 350.94, 330.63, 8.13, 8.13
- Rune text: Read the source at 365.50, 324.70, 187.00, 22.75
- Rune text: Review the changes at 365.50, 353.45, 187.00, 22.75
- Rune text: export const multiply = (a: number, b: number) => a * b; at 341.50, 407.20, 438.30, 23.25
- Rune text: Inline code , bold, emphasis and at 324.50, 461.45, 228.00, 23.75
- Rune text: strikethrough stay selectable. at 324.50, 485.20, 228.00, 22.75
- Rune icon: Choose model at 383.50, 715.00, 18.00, 18.00
- Rune input: # atlas-api at 624.50, 84.00, 389.50, 20.40
- Rune text: README.md at 1060.20, 170.63, 136.62, 18.75
- Rune text: report.html at 1060.20, 194.63, 136.62, 18.75

## tool-detail-open-light

78 matched; 0 flagged; 2 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Used skill: at 452.25, 481.88, 61.50, 14.00
- Electron text: review at 513.75, 481.88, 36.75, 14.00
- Rune text: Read the source, run git status and explain the change. at 749.24, 28.00, 379.01, 38.75
- Rune text: Used skill: review at 452.25, 479.91, 98.25, 18.00
- Rune text: Added multiply alongside the existing add function. at 408.25, 521.00, 720.00, 22.75
- Rune icon: Conversation at 454.11, 526.50, 13.00, 13.00
- Rune icon: Choose model at 681.60, 752.00, 18.00, 18.00
- Rune text: multiply at 471.11, 521.00, 53.00, 23.00

## settings-general-bottom-light

47 matched; 0 flagged; 4 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Electron text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they can also check its latest progress. It’ at 471.25, 192.00, 566.45, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-side-chat.js at 847.80, 210.50, 86.70, 14.00
- Electron text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and small tools shown beside the chat in your the at 471.25, 289.50, 552.46, 14.00
- Electron text: /tmp/ocr-fx-align/home/.config/opencode/plugins/opencodex-canvas.js at 750.08, 308.00, 86.70, 14.00
- Rune text: Side chats start from a snapshot of the main chat. Install a small read-only OpenCode plugin so they at 471.25, 190.00, 567.26, 18.00
- Rune text: can also check its latest progress. It’s hidden in all other sessions. /tmp/ocr-fx- at 471.25, 208.50, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-side-chat.js at 471.25, 227.00, 567.26, 18.50
- Rune text: Install a small OpenCode plugin so agents can make canvases: charts, dashboards, diagrams, and at 471.25, 287.50, 567.26, 18.00
- Rune text: small tools shown beside the chat in your theme. /tmp/ocr-fx- at 471.25, 306.00, 567.26, 18.50
- Rune text: align/home/.config/opencode/plugins/opencodex-canvas.js at 471.25, 324.50, 567.26, 18.50

## project-picker-open-dark

66 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75

## project-picker-open-light

66 matched; 0 flagged; 0 Electron / 6 Rune unmatched.

| Item |  Δx |  Δy | Difference |
| ---- | --: | --: | ---------- |

Unmatched (not validated):

- Rune icon: raster image at 702.25, 43.15, 176.00, 176.00
- Rune text: What should we build? at 642.55, 223.15, 295.40, 37.50
- Rune text: Any model, any provider. Your repo stays on your machine. at 595.91, 270.65, 388.69, 21.75
- Rune icon: Choose model at 703.60, 600.85, 18.00, 18.00
- Rune icon: Start from branch at 533.98, 650.85, 14.00, 14.00
- Rune text: master at 553.98, 648.48, 41.57, 18.75
