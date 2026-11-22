//! Structural rows around diff lines: file headers, folded unchanged-range summaries, and
//! empty/binary file notes.

use std::any::Any;

use rune::{Color, Cursor, El, Icon, col, icon, row, text};

use super::{CODE_PAD, View};
use crate::workbench::diff::model::FileStatus;
use crate::workbench::diff::state::{DiffState, EXPAND_STEP, Expand, GAP_H, HEADER_H, NOTE_H};

static EXPAND_UP: Icon = Icon {
    name: "kit-diff-expand-up",
    view: 16.0,
    body: r#"<path d="M4.5 9.5L8 6L11.5 9.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>"#,
};
static EXPAND_DOWN: Icon = Icon {
    name: "kit-diff-expand-down",
    view: 16.0,
    body: r#"<path d="M4.5 6.5L8 10L11.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>"#,
};
static EXPAND_ALL: Icon = Icon {
    name: "kit-diff-expand-all",
    view: 16.0,
    body: r#"<path d="M5 5.5L8 2.5L11 5.5M5 10.5L8 13.5L11 10.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>"#,
};
// Pierre's diffs-icon-symbol-modified, used by the real diff header.
static MODIFIED: Icon = Icon {
    name: "diffs-icon-symbol-modified",
    view: 16.0,
    body: r#"<path fill="currentColor" d="M1.5 8c0 1.613.088 2.806.288 3.704.196.88.478 1.381.802 1.706s.826.607 1.706.802c.898.2 2.091.288 3.704.288s2.806-.088 3.704-.288c.88-.195 1.381-.478 1.706-.802s.607-.826.802-1.706c.2-.898.288-2.091.288-3.704s-.088-2.806-.288-3.704c-.195-.88-.478-1.381-.802-1.706s-.826-.606-1.706-.802C10.806 1.588 9.613 1.5 8 1.5s-2.806.088-3.704.288c-.88.196-1.381.478-1.706.802s-.606.826-.802 1.706C1.588 5.194 1.5 6.387 1.5 8M0 8c0-6.588 1.412-8 8-8s8 1.412 8 8-1.412 8-8 8-8-1.412-8-8m8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>"#,
};

macro_rules! change_icon {
    ($name:literal, $symbol:literal) => {
        Icon { name: $name, view: 16.0, body: concat!(r#"<g fill="currentColor"><path d="M1.5 8c0 1.613.088 2.806.288 3.704.196.88.478 1.381.802 1.706s.826.607 1.706.802c.898.2 2.091.288 3.704.288s2.806-.088 3.704-.288c.88-.195 1.381-.478 1.706-.802s.607-.826.802-1.706c.2-.898.288-2.091.288-3.704s-.088-2.806-.288-3.704c-.195-.88-.478-1.381-.802-1.706s-.826-.606-1.706-.802C10.806 1.588 9.613 1.5 8 1.5s-2.806.088-3.704.288c-.88.196-1.381.478-1.706.802s-.606.826-.802 1.706C1.588 5.194 1.5 6.387 1.5 8M0 8c0-6.588 1.412-8 8-8s8 1.412 8 8-1.412 8-8 8-8-1.412-8-8"/><path d=""#, $symbol, r#""/></g>"#) }
    };
}
static ADDED: Icon = change_icon!(
    "diffs-icon-symbol-added",
    "M8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4"
);
static DELETED: Icon = change_icon!(
    "diffs-icon-symbol-deleted",
    "M4 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8"
);
static MOVED: Icon = change_icon!(
    "diffs-icon-symbol-moved",
    "M8.495 4.695a.75.75 0 0 0-.05 1.06L10.486 8l-2.041 2.246a.75.75 0 0 0 1.11 1.008l2.5-2.75a.75.75 0 0 0 0-1.008l-2.5-2.75a.75.75 0 0 0-1.06-.051m-4 0a.75.75 0 0 0-.05 1.06l2.044 2.248-1.796 1.995a.75.75 0 0 0 1.114 1.004l2.25-2.5a.75.75 0 0 0-.002-1.007l-2.5-2.75a.75.75 0 0 0-1.06-.05"
);

impl View {
    /// The unchanged lines between two hunks, folded: buttons to show more, and the next
    /// hunk's header.
    pub(super) fn gap(&self, st: &DiffState, f: usize, gap: usize) -> El {
        let l = &self.look;
        let file = &st.files()[f];
        let hidden = st.hidden(f, gap).unwrap_or(0);
        let last = gap == file.hunks.len();
        let expandable = file.expandable();
        let mut buttons = Vec::new();
        if expandable {
            let mut add = |how: Expand, glyph: &'static Icon, label: String| {
                let btn = row()
                    .key(format!("{how:?}"))
                    .size(24.0, 24.0)
                    .center()
                    .radius(6.0)
                    .hover(l.hover)
                    .cursor(Cursor::Pointer)
                    .role("button")
                    .label(label)
                    .child(icon(glyph, 16.0).color(l.muted));
                buttons.push(self.bind.bind_expand(btn, f, gap, how, false));
            };
            let step = hidden.min(EXPAND_STEP);
            if hidden <= EXPAND_STEP {
                add(
                    Expand::All,
                    &EXPAND_ALL,
                    format!("Show {hidden} hidden lines"),
                );
            } else {
                if gap > 0 {
                    add(
                        Expand::Down,
                        &EXPAND_DOWN,
                        format!("Show {step} more lines below"),
                    );
                }
                if !last {
                    add(
                        Expand::Up,
                        &EXPAND_UP,
                        format!("Show {step} more lines above"),
                    );
                }
            }
        }
        let buttons = row()
            .key("expand")
            .w(self.gutter_w(st, f))
            .h(l.metrics.gap)
            .center()
            .gap(2.0)
            .children(buttons);
        let mut inner = row()
            .key("inner")
            .h(l.metrics.gap)
            .items_center()
            .gap(12.0)
            .child(buttons);
        if let Some(w) = self.view_w(st, false) {
            inner = inner.max_w(w).sticky_left(0.0);
        }
        if hidden > 0 {
            let count = text(if hidden == 1 {
                "1 unchanged line".to_owned()
            } else {
                format!("{hidden} unchanged lines")
            })
            .font(l.small)
            .color(l.muted)
            .key("count");
            let count = if expandable && hidden > EXPAND_STEP {
                let all = row()
                    .key("all")
                    .px(6.0)
                    .h(24.0)
                    .items_center()
                    .radius(6.0)
                    .hover(l.hover)
                    .cursor(Cursor::Pointer)
                    .role("button")
                    .label(format!("Show all {hidden} lines"));
                self.bind
                    .bind_expand(all, f, gap, Expand::All, false)
                    .child(count)
            } else {
                row().key("all").px(6.0).child(count)
            };
            inner = inner.child(count);
        }
        if let Some(h) = file.hunks.get(gap) {
            inner = inner.child(
                text(h.header())
                    .font(l.small)
                    .color(l.faint)
                    .single_line()
                    .key("header"),
            );
        }
        let label = match file.hunks.get(gap) {
            Some(h) => format!("{hidden} unchanged lines, then {}", h.header()),
            None => format!("{hidden} unchanged lines"),
        };
        row()
            .w_full()
            .h(l.metrics.gap)
            .items_center()
            .fill(l.gap_bg)
            .role("group")
            .label(label)
            .child(inner)
    }

    /// A file with no lines to show.
    pub(super) fn note(&self, st: &DiffState, f: usize) -> El {
        let l = &self.look;
        let file = &st.files()[f];
        let msg = if file.binary {
            "Binary file not shown"
        } else if file.status == FileStatus::Renamed || file.status == FileStatus::Copied {
            "File moved without changes"
        } else if file.old_mode != file.new_mode {
            "File mode changed"
        } else if file.status == FileStatus::Added || file.status == FileStatus::Deleted {
            "Empty file"
        } else {
            "No changes"
        };
        let mut inner = row()
            .key("inner")
            .h(l.metrics.note)
            .items_center()
            .pl(self.gutter_w(st, f) + l.metrics.code_padding.0)
            .child(text(msg).font(l.small).color(l.muted));
        if let Some(w) = self.view_w(st, false) {
            inner = inner.max_w(w).sticky_left(0.0);
        }
        row()
            .w_full()
            .h(l.metrics.note)
            .fill(l.bg)
            .role("note")
            .label(msg)
            .child(inner)
    }

    pub(super) fn file_header(&self, s: &dyn Any, st: &DiffState, f: usize, sticky: bool) -> El {
        let l = &self.look;
        let file = &st.files()[f];
        let collapsed = st.collapsed(f);
        let toggle = row()
            .key("toggle")
            .size(16.0, 16.0)
            .center()
            .radius(6.0)
            .hover(l.hover)
            .cursor(Cursor::Pointer)
            .role("button")
            .label(if collapsed {
                "Expand file"
            } else {
                "Collapse file"
            })
            .expanded(!collapsed)
            .child(
                icon(
                    match file.status {
                        FileStatus::Added => &ADDED,
                        FileStatus::Deleted => &DELETED,
                        FileStatus::Renamed | FileStatus::Copied => &MOVED,
                        FileStatus::Modified => &MODIFIED,
                    },
                    16.0,
                )
                .color(match file.status {
                    FileStatus::Added => l.add.count,
                    FileStatus::Deleted => l.del.count,
                    FileStatus::Renamed | FileStatus::Copied => l.muted,
                    FileStatus::Modified => l.modified,
                }),
            );
        let toggle = self.bind.bind_toggle_file(toggle, f, sticky);
        let path = |p: &str, c: Color| {
            text(p.to_owned())
                .font(l.label)
                .color(c)
                .truncate_head()
                .min_w(0.0)
                .shrink()
        };
        let mut name = row()
            .key("path")
            .items_center()
            .gap(6.0)
            .min_w(0.0)
            .shrink();
        let (old, new) = (file.old_path.as_deref(), file.new_path.as_deref());
        name = match (file.status, old, new) {
            (FileStatus::Renamed | FileStatus::Copied, Some(a), Some(b)) => name
                .child(path(a, l.muted).key("old"))
                .child(text("→").font(l.label).color(l.faint).key("arrow"))
                .child(path(b, l.text).key("new")),
            _ => name.child(path(file.path(), l.text).key("new")),
        };
        let status = match file.status {
            FileStatus::Added => Some(("Added", l.add.count)),
            FileStatus::Deleted => Some(("Deleted", l.del.count)),
            FileStatus::Renamed => Some(("Renamed", l.muted)),
            FileStatus::Copied => Some(("Copied", l.muted)),
            FileStatus::Modified => None,
        };
        let mut inner = row()
            .key("inner")
            .w_full()
            .grow(1.0)
            .pl(14.0)
            .pr(12.0)
            .gap(8.0)
            .items_center()
            .child(toggle)
            .child(name);
        if let Some((word, color)) = status {
            inner = inner.child(text(word).font(l.small).color(color).key("status"));
        }
        if let (Some(a), Some(b)) = (&file.old_mode, &file.new_mode)
            && a != b
        {
            inner = inner.child(
                text(format!("{a} → {b}"))
                    .font(l.small)
                    .color(l.faint)
                    .key("mode"),
            );
        }
        inner = inner.child(row().key("space").grow(1.0).a11y_hidden());
        let (adds, dels) = (file.additions(), file.deletions());
        if adds > 0 {
            inner = inner.child(
                text(format!("+{adds}"))
                    .font(l.font)
                    .color(l.add.count)
                    .key("adds"),
            );
        }
        if dels > 0 {
            inner = inner.child(
                text(format!("−{dels}"))
                    .font(l.font)
                    .color(l.del.count)
                    .key("dels"),
            );
        }
        if let Some(actions) = self.bind.header_action(s, f) {
            inner = inner.child(actions.key("actions"));
        }
        let mut label = file.path().to_owned();
        if let (FileStatus::Renamed, Some(a)) = (file.status, old) {
            label.push_str(&format!(", renamed from {a}"));
        }
        label.push_str(&format!(", {adds} added, {dels} removed"));
        let line =
            |key: &'static str, c: Color| col().key(key).w_full().h(1.0).fill(c).a11y_hidden();
        let mut h = col()
            .w_full()
            .h(l.metrics.header)
            .fill(l.header_bg)
            .role("heading")
            .label(label);
        // In the list, as wide as the view and held to its left edge while the code scrolls
        // sideways, so the counts and actions stay in sight.
        if let (false, Some(w)) = (sticky, self.view_w(st, false)) {
            h = h.w(w).sticky_left(0.0);
        }
        h.child(inner).child(line("bottom", l.border))
    }
}
