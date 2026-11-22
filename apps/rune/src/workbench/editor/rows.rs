use crate::workbench::{
    diff::{Annotation, LineRef, Side},
    documents::Document,
};
use crate::{State, sidebar::label};
use rune::{El, GrowthSpec, Key, TextStyle, col, row, text_input};

fn ensure(doc: &mut Document, line: usize) {
    if doc.source_input.line != line {
        super::activate(doc, line);
    }
}

fn input_key(index: usize, line: usize) -> String {
    if line == 0 {
        "workspace-editor".into()
    } else {
        format!("source-input-{index}-{line}")
    }
}
fn focus_input(s: &State, index: usize, tx: &mut rune::Tx) {
    tx.focus(
        input_key(index, s.workbench.docs[index].source_input.line),
        false,
    );
}
fn line_at(doc: &Document, y: f32, fallback: usize) -> usize {
    doc.source_rects
        .iter()
        .rev()
        .find(|(_, rect)| rect[1] <= y)
        .map(|(line, _)| *line)
        .unwrap_or(fallback)
}

fn byte_at_x(text: &str, x: f32) -> usize {
    let target = (x / 7.5).max(0.0);
    let mut column = 0;
    for (byte, c) in text.char_indices() {
        let next = column + if c == '\t' { 4 - column % 4 } else { 1 };
        if target < (column + next) as f32 / 2.0 {
            return byte;
        }
        column = next;
    }
    text.len()
}

pub fn view(s: &State, index: usize) -> El {
    let doc = &s.workbench.docs[index];
    let gutter = 30.0 + (doc.lines.len().max(1).ilog10() + 1) as f32 * 7.5;
    let viewport = if doc.source_viewport > 0.0 {
        doc.source_viewport
    } else {
        (s.panel_width()
            - if s.workbench.tree_visible {
                s.workbench.tree_width
            } else {
                0.0
            })
        .max(gutter + 40.0)
    };
    let width = (doc.line_columns as f32 * 7.5 + 16.0).max(viewport - gutter);
    col()
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .scroll_xy()
        .on_layout_tx(move |s: &mut State, rect, tx| {
            let doc = &mut s.workbench.docs[index];
            if (doc.source_viewport - rect[2]).abs() > 0.5 {
                doc.source_viewport = rect[2];
            } else {
                tx.live_only();
            }
        })
        .child(
            col()
                .w(width + gutter)
                .pt(4.0)
                .pb(4.0)
                .growth(GrowthSpec::default())
                .virtual_rows(
                    doc.lines.len(),
                    20.0,
                    move |_: &State, n| format!("source-line-{index}-{n}").into(),
                    move |s: &State, n| source_row(s, index, n, gutter, width, viewport),
                )
                .on_visible_rows(move |s: &mut State, range| {
                    let doc = &mut s.workbench.docs[index];
                    doc.source_rects.retain(|line, _| range.contains(line));
                    if doc.visible_source == range {
                        false
                    } else {
                        doc.visible_source = range;
                        true
                    }
                }),
        )
}

fn source_row(s: &State, index: usize, n: usize, gutter: f32, width: f32, viewport: f32) -> El {
    let doc = &s.workbench.docs[index];
    let t = &s.theme;
    let (a, b) = doc.lines[n];
    let active = doc.source_input.line == n;
    let edit = &doc.source_input.edit;
    let first = doc.highlights.partition_point(|(r, _)| r.end <= a);
    let highlights: Vec<_> = doc.highlights[first..]
        .iter()
        .take_while(|(r, _)| r.start < b)
        .map(|(r, p)| (r.start.max(a) - a..r.end.min(b) - a, *p))
        .collect();
    let selected = doc.source_input.global_selection
        && a <= doc.edit.anchor.max(doc.edit.focus)
        && b >= doc.edit.anchor.min(doc.edit.focus);
    let input = if active {
        text_input(edit, TextStyle::new(12.5, 400.0).mono().lh(20.0))
            .key(input_key(index, n))
            .label(format!("{}: line {}", doc.path, n + 1))
            .single_line()
            .size(width, 20.0)
            .px(0.0)
            .py(0.0)
            .color(t.c("text"))
            .caret(t.c("text"), t.c("selected"))
            .decorations(super::syntax_theme(s).spans(&highlights, 0))
            .on_edit(move |s: &mut State| {
                let doc = &mut s.workbench.docs[index];
                &mut doc.source_input.edit
            })
            .on_input_change(move |s: &mut State, tx| commit(s, index, tx))
            .on_input_paste(move |s: &mut State, content, tx| {
                insert(s, index, content.text(), tx);
                true
            })
            .on_submit(move |s: &mut State, tx| {
                let doc = &mut s.workbench.docs[index];
                ensure(doc, n);
                let newline = if doc.value["text"]
                    .as_str()
                    .is_some_and(|t| t.contains("\r\n"))
                {
                    "\r\n"
                } else {
                    "\n"
                };
                insert(s, index, newline, tx);
            })
            .on_input_key(move |s: &mut State, key, tx| key_input(s, index, n, key, tx))
    } else {
        rune::rich(
            &doc.edit.text[a..b],
            super::syntax_theme(s).spans(&highlights, 0),
        )
        .font(TextStyle::new(12.5, 400.0).mono().lh(20.0))
        .color(t.c("text"))
        .size(width, 20.0)
        .inert()
    };
    let code = col()
        .w(width)
        .h(20.0)
        .child(input)
        .on_drag(move |s: &mut State, d, tx| {
            if d.cancelled() {
                return;
            }
            let doc = &mut s.workbench.docs[index];
            let target = line_at(doc, d.window_point()[1], n).min(doc.lines.len() - 1);
            if d.phase == rune::Phase::Down {
                super::activate(doc, n);
            }
            let (a, b) = doc.lines[target];
            let offset = a + byte_at_x(&doc.edit.text[a..b], d.x);
            if d.phase == rune::Phase::Down {
                doc.edit.anchor = offset;
            }
            doc.edit.focus = offset;
            let anchor = doc.edit.anchor;
            super::activate(doc, target);
            doc.source_input.edit.anchor = anchor.saturating_sub(a).min(b - a);
            doc.source_input.edit.focus = offset - a;
            doc.source_input.global_selection = anchor < a || anchor > b;
            focus_input(s, index, tx);
        });
    let numbers = row()
        .w(gutter)
        .h(20.0)
        .center_y()
        .pr(10.0)
        .gap(2.0)
        .hover_group()
        .child(
            label(t, "+", 11.0, 400.0, "text-tertiary")
                .key(format!("source-comment-{index}-{n}"))
                .w(16.0)
                .group_opacity(0.0, 1.0)
                .role("button")
                .label(format!("Comment on line {}", n + 1))
                .focusable(true)
                .on_press_tx(move |s: &mut State, tx| {
                    let doc = &mut s.workbench.docs[index];
                    super::activate(doc, n);
                    doc.source_input.global_selection = true;
                    doc.edit.anchor = doc.lines[n].0;
                    doc.edit.focus = doc.lines[n].1;
                    crate::workbench::review::source_selection(s);
                    tx.focus("review-comment", false);
                }),
        )
        .child(
            label(t, format!("{}", n + 1), 12.5, 400.0, "text-tertiary")
                .font(TextStyle::new(12.5, 400.0).mono().lh(20.0))
                .align(rune::Align::End)
                .grow(1.0)
                .on_drag(move |s: &mut State, d, tx| {
                    if d.cancelled() {
                        return;
                    }
                    let doc = &mut s.workbench.docs[index];
                    // The source rows own geometry; review cards never become source bytes.
                    let end = line_at(doc, d.window_point()[1], n).min(doc.lines.len() - 1);
                    super::activate(doc, n);
                    doc.source_input.global_selection = true;
                    doc.source_input.edit.anchor = 0;
                    doc.source_input.edit.focus = doc.source_input.edit.text.len();
                    doc.edit.anchor = doc.lines[n.min(end)].0;
                    doc.edit.focus = doc.lines[n.max(end)].1;
                    sync(doc);
                    focus_input(s, index, tx);
                }),
        );
    let mut result = col().w_full().child(
        row()
            .w_full()
            .h(20.0)
            .fill(t.c(if selected {
                "selected"
            } else if active {
                "secondary"
            } else {
                "surface"
            }))
            .child(numbers)
            .child(code),
    );
    // CodeMirror block widgets have side:1 at line.to: place cards after the END line.
    let editor = s.chat.comment_editor.as_ref();
    let comments = s
        .draft()
        .comments
        .iter()
        .filter(|c| !editor.is_some_and(|e| e.id == c.id))
        .map(|c| (&c.id, &c.target))
        .chain(editor.map(|e| (&e.id, &e.target)));
    for (id, target) in comments {
        if target["path"] != doc.path
            || target["directory"] != doc.directory
            || !target["diffMode"].is_null()
            || target["version"] != doc.value["version"]
            || target["end"].as_u64() != Some(n as u64 + 1)
        {
            continue;
        }
        let start = target["start"].as_u64().unwrap_or(0) as usize;
        if start == 0 || start > n + 1 {
            continue;
        }
        if doc.edit.text[doc.lines[start - 1].0..b]
            .chars()
            .take(8000)
            .collect::<String>()
            != target["quote"].as_str().unwrap_or("")
        {
            continue;
        }
        let annotation = Annotation::new(0, LineRef::new(Side::New, n as u32 + 1), id.clone());
        result = result.child(
            col()
                .key(format!("source-review-{id}"))
                .w(viewport - gutter)
                .ml(gutter)
                .py(4.0)
                .sticky_left(gutter)
                .child(crate::workbench::review::card(s, &annotation)),
        );
    }
    result.on_layout_tx(move |s: &mut State, rect, tx| {
        s.workbench.docs[index].source_rects.insert(n, rect);
        tx.live_only();
    })
}

pub(super) fn commit(s: &mut State, index: usize, tx: &mut rune::Tx) {
    let doc = &mut s.workbench.docs[index];
    let input = &doc.source_input;
    let (a, b) = if input.global_selection {
        (
            doc.edit.anchor.min(doc.edit.focus),
            doc.edit.anchor.max(doc.edit.focus),
        )
    } else {
        (input.start, input.end)
    };
    let replacement = if input.global_selection {
        let old = &doc.edit.text[input.start..input.end];
        let new = &input.edit.text;
        let mut prefix = old
            .bytes()
            .zip(new.bytes())
            .take_while(|(a, b)| a == b)
            .count();
        while !old.is_char_boundary(prefix) || !new.is_char_boundary(prefix) {
            prefix -= 1;
        }
        let mut suffix = old[prefix..]
            .bytes()
            .rev()
            .zip(new[prefix..].bytes().rev())
            .take_while(|(a, b)| a == b)
            .count();
        while !old.is_char_boundary(old.len() - suffix) || !new.is_char_boundary(new.len() - suffix)
        {
            suffix -= 1;
        }
        new[prefix..new.len() - suffix].to_owned()
    } else {
        input.edit.text.clone()
    };
    if doc.edit.text.get(a..b) == Some(&replacement) {
        return;
    }
    let (anchor, focus) = if input.global_selection {
        (a + replacement.len(), a + replacement.len())
    } else {
        (a + input.edit.anchor, a + input.edit.focus)
    };
    let revision = doc.revision;
    replace(s, index, a, b, &replacement, tx);
    let doc = &mut s.workbench.docs[index];
    if doc.revision == revision {
        sync(doc);
        focus_input(s, index, tx);
        return;
    }
    doc.edit.anchor = anchor.min(doc.edit.text.len());
    doc.edit.focus = focus.min(doc.edit.text.len());
    if replacement.contains('\n')
        || doc.source_input.global_selection
        || doc.edit.text.get(a..a + replacement.len()) != Some(&replacement)
    {
        sync(doc);
        focus_input(s, index, tx);
    } else {
        doc.source_input.start = a;
        doc.source_input.end = a + replacement.len();
    }
}

fn insert(s: &mut State, index: usize, text: &str, tx: &mut rune::Tx) {
    let doc = &mut s.workbench.docs[index];
    super::selection(doc);
    let (a, b) = (
        doc.edit.anchor.min(doc.edit.focus),
        doc.edit.anchor.max(doc.edit.focus),
    );
    replace(s, index, a, b, text, tx);
    sync(&mut s.workbench.docs[index]);
    focus_input(s, index, tx);
}

fn markers(s: &State, index: usize) -> Vec<(String, usize, usize)> {
    let doc = &s.workbench.docs[index];
    s.draft()
        .comments
        .iter()
        .map(|c| (&c.id, &c.target))
        .chain(s.chat.comment_editor.as_ref().map(|e| (&e.id, &e.target)))
        .filter_map(|(id, target)| {
            if target["path"] != doc.path
                || target["directory"] != doc.directory
                || !target["diffMode"].is_null()
            {
                return None;
            }
            let start = target["start"].as_u64()? as usize;
            let end = target["end"].as_u64()? as usize;
            Some((
                id.clone(),
                doc.lines.get(start.checked_sub(1)?)?.0,
                doc.lines.get(end.checked_sub(1)?)?.1,
            ))
        })
        .collect()
}

fn replace(s: &mut State, index: usize, a: usize, b: usize, replacement: &str, tx: &mut rune::Tx) {
    let mappings = markers(s, index);
    let doc = &mut s.workbench.docs[index];
    doc.edit.anchor = a;
    doc.edit.focus = b;
    doc.edit.insert(replacement);
    let revision = doc.revision;
    super::changed(s, index, tx);
    let doc = &s.workbench.docs[index];
    if doc.revision == revision {
        return;
    }
    map_markers(s, index, mappings, a, b, replacement.len());
}

fn map_markers(
    s: &mut State,
    index: usize,
    mappings: Vec<(String, usize, usize)>,
    a: usize,
    b: usize,
    inserted: usize,
) {
    let doc = &s.workbench.docs[index];
    let delta = inserted as isize - (b - a) as isize;
    let mapped: Vec<_> = mappings
        .into_iter()
        .filter_map(|(id, start, end)| {
            // Keep an edited quote stale; map only edits wholly before/after the quote.
            if b <= start {
                let start = start.saturating_add_signed(delta);
                let end = end.saturating_add_signed(delta);
                Some((
                    id,
                    doc.lines.partition_point(|(_, e)| *e < start) + 1,
                    doc.lines.partition_point(|(_, e)| *e < end) + 1,
                ))
            } else {
                None
            }
        })
        .collect();
    let mut touched = false;
    for (id, start, end) in mapped {
        if let Some(c) = s.draft_mut().comments.iter_mut().find(|c| c.id == id) {
            c.target["start"] = start.into();
            c.target["end"] = end.into();
            if !c.target["anchor"].is_null() {
                c.target["anchor"]["line"] = end.into();
            }
            touched = true;
        }
        if let Some(e) = s.chat.comment_editor.as_mut().filter(|e| e.id == id) {
            e.target["start"] = start.into();
            e.target["end"] = end.into();
            e.target["anchor"]["line"] = end.into();
        }
    }
    if touched {
        s.touch_draft();
    }
}

pub fn sync(doc: &mut Document) {
    let (anchor, focus) = (doc.edit.anchor, doc.edit.focus);
    let line = doc
        .lines
        .partition_point(|(_, end)| *end < focus)
        .min(doc.lines.len() - 1);
    super::activate(doc, line);
    let start = doc.source_input.start;
    let len = doc.source_input.edit.text.len();
    doc.source_input.edit.anchor = anchor.saturating_sub(start).min(len);
    doc.source_input.edit.focus = focus.saturating_sub(start).min(len);
    doc.source_input.global_selection = anchor < start || anchor > doc.source_input.end;
}

fn key_input(
    s: &mut State,
    index: usize,
    n: usize,
    key: &rune::KeyEvent,
    tx: &mut rune::Tx,
) -> bool {
    let doc = &mut s.workbench.docs[index];
    ensure(doc, n);
    super::selection(doc);
    if key.is_command('s') {
        s.save_workspace_file();
        tx.instant();
        return true;
    }
    if key.is_command('m') && key.mods.shift {
        crate::workbench::review::source_selection(s);
        tx.focus("review-comment", false);
        return true;
    }
    if key.is_command('a') {
        doc.edit.anchor = 0;
        doc.edit.focus = doc.edit.text.len();
        doc.source_input.global_selection = true;
        doc.source_input.edit.anchor = 0;
        doc.source_input.edit.focus = doc.source_input.edit.text.len();
        return true;
    }
    if key.is_command('z') {
        let mappings = markers(s, index);
        let doc = &mut s.workbench.docs[index];
        let before = doc.edit.text.clone();
        if key.mods.shift {
            doc.edit.redo();
        } else {
            doc.edit.undo();
        }
        if doc.edit.text != before {
            let after = &doc.edit.text;
            let mut a = before
                .bytes()
                .zip(after.bytes())
                .take_while(|(a, b)| a == b)
                .count();
            while !before.is_char_boundary(a) || !after.is_char_boundary(a) {
                a -= 1;
            }
            let mut tail = before[a..]
                .bytes()
                .rev()
                .zip(after[a..].bytes().rev())
                .take_while(|(a, b)| a == b)
                .count();
            while !before.is_char_boundary(before.len() - tail)
                || !after.is_char_boundary(after.len() - tail)
            {
                tail -= 1;
            }
            let (b, inserted) = (before.len() - tail, after.len() - tail - a);
            super::changed(s, index, tx);
            map_markers(s, index, mappings, a, b, inserted);
            sync(&mut s.workbench.docs[index]);
            focus_input(s, index, tx);
        }
        return true;
    }
    if (key.is_command('c') || key.is_command('x')) && doc.source_input.global_selection {
        let (a, b) = (
            doc.edit.anchor.min(doc.edit.focus),
            doc.edit.anchor.max(doc.edit.focus),
        );
        oc_native::clipboard::copy(tx, doc.edit.text[a..b].to_owned());
        if key.is_command('x') {
            replace(s, index, a, b, "", tx);
            sync(&mut s.workbench.docs[index]);
        }
        return true;
    }
    if key.key == Key::Tab && !key.mods.cmd && !key.mods.ctrl && !key.mods.alt {
        let (a, b) = (
            doc.edit.anchor.min(doc.edit.focus),
            doc.edit.anchor.max(doc.edit.focus),
        );
        if a == b && !key.mods.shift {
            replace(s, index, a, b, "  ", tx);
        } else {
            let first = doc.edit.text[..a].rfind('\n').map_or(0, |i| i + 1);
            let last = doc.edit.text[b..]
                .find('\n')
                .map_or(doc.edit.text.len(), |i| b + i);
            let replacement = doc.edit.text[first..last]
                .split('\n')
                .map(|line| {
                    if key.mods.shift {
                        line.strip_prefix("  ")
                            .or_else(|| line.strip_prefix('\t'))
                            .unwrap_or(line)
                            .to_owned()
                    } else {
                        format!("  {line}")
                    }
                })
                .collect::<Vec<_>>()
                .join("\n");
            replace(s, index, first, last, &replacement, tx);
            s.workbench.docs[index].edit.anchor = first;
        }
        sync(&mut s.workbench.docs[index]);
        focus_input(s, index, tx);
        return true;
    }
    let doc = &mut s.workbench.docs[index];
    let focus = doc.edit.focus;
    let (start, end) = doc.lines[n];
    if doc.source_input.global_selection
        && !key.mods.shift
        && matches!(key.key, Key::Left | Key::Right)
    {
        let next = if key.key == Key::Left {
            doc.edit.anchor.min(focus)
        } else {
            doc.edit.anchor.max(focus)
        };
        doc.edit.anchor = next;
        doc.edit.focus = next;
        sync(doc);
        focus_input(s, index, tx);
        return true;
    }
    let next = match key.key {
        Key::Up if n > 0 => {
            Some(doc.lines[n - 1].0 + (focus - start).min(doc.lines[n - 1].1 - doc.lines[n - 1].0))
        }
        Key::Down if n + 1 < doc.lines.len() => {
            Some(doc.lines[n + 1].0 + (focus - start).min(doc.lines[n + 1].1 - doc.lines[n + 1].0))
        }
        Key::Left if focus == start && n > 0 => Some(doc.lines[n - 1].1),
        Key::Right if focus == end && n + 1 < doc.lines.len() => Some(doc.lines[n + 1].0),
        _ => None,
    };
    if let Some(mut next) = next {
        while !doc.edit.text.is_char_boundary(next) {
            next -= 1;
        }
        let anchor = doc.edit.anchor;
        doc.edit.focus = next;
        doc.edit.anchor = if key.mods.shift { anchor } else { next };
        sync(doc);
        focus_input(s, index, tx);
        return true;
    }
    let delete =
        if doc.source_input.global_selection && matches!(key.key, Key::Backspace | Key::Delete) {
            Some((doc.edit.anchor.min(focus), doc.edit.anchor.max(focus)))
        } else if doc.edit.anchor == focus && key.key == Key::Backspace && focus == start && n > 0 {
            Some((doc.lines[n - 1].1, focus))
        } else if doc.edit.anchor == focus
            && key.key == Key::Delete
            && focus == end
            && n + 1 < doc.lines.len()
        {
            Some((focus, doc.lines[n + 1].0))
        } else {
            None
        };
    if let Some((a, b)) = delete {
        replace(s, index, a, b, "", tx);
        sync(&mut s.workbench.docs[index]);
        focus_input(s, index, tx);
        return true;
    }
    false
}
