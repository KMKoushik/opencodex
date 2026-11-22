//! Vendored from rune-kit at 7286a3c5fe525bcbdb5a1188a4046ff4eff5f0de.
//! Copyright (c) 2026 Anomaly. MIT license: see LICENSE in this directory.
//! App-owned diff view for reviewing changes: files of hunks, unified or split, with word changes,
//! syntax colours, expandable unchanged ranges, line annotations and line selection, on a
//! virtual list that keeps a fifty-thousand-line diff at frame rate.
//!
//! [`parse`] reads a patch (`git diff`) and [`FileDiff::from_texts`] diffs two texts. The app
//! keeps a [`DiffState`] of the files in its state and draws it with [`DiffView`].

#![allow(dead_code, unused_imports)] // Retain the pinned MIT module's complete reusable API.

mod copy;
mod model;
mod myers;
mod pairs;
mod state;
mod view;
mod words;

pub use model::{FileDiff, FileStatus, Hunk, Line, LineKind, Side, parse};
pub use pairs::SplitRow;
pub use state::{
    Annotation, DiffLine, DiffMode, DiffState, EXPAND_STEP, Expand, LineRange, LineRef, Metrics,
};
pub use view::{DiffView, FoldRow};
