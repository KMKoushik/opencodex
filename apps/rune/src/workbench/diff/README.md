# Owned diff renderer

Vendored from `rune-kit/src/diff` at
`7286a3c5fe525bcbdb5a1188a4046ff4eff5f0de` (MIT, Copyright 2026 Anomaly).
The original notice is retained in `LICENSE`.

Local adaptations:

- Immutable source storage uses `Arc`, allowing prepared models to cross the bounded worker
  mailbox without reparsing or pairing on the UI thread.
- Shared configurable `Metrics` drive typography, gutters, row layout and navigation.
  Defaults follow the web's 12.5/20 source, 40-point header, 32-point separators and SF Mono
  column advance. Unified diffs show one line-number column; change bars overlay the gutter.
- `on_expand` requests missing full context, including unknown trailing ranges. Full sources
  attach without changing hunks, selection, annotations or virtual row keys; queued expansion
  gestures replay after receipt. Highlighting remains worker-owned, in 128-line chunks.
- The app supplies its syntax theme and annotation builders. The original virtualization,
  word pairing, copy/selection and bounded Myers implementation are retained.
