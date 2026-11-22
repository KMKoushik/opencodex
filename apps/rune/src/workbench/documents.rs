use super::diff::{self, DiffMode, DiffState, DiffView};
use super::{
    Panel,
    worker::{self, Operation, Payload},
};
use crate::{State, sidebar::label};
use rune::{El, GrowthSpec, ScrollSpec, TextEdit, TextStyle, col, rich, row};
use rune_kit::syntax::{self, Highlighter, SyntaxTheme};
use serde_json::{Value, json};
use std::sync::Arc;
const MAX_EDIT_BYTES: usize = 2 * 1024 * 1024;

pub struct Document {
    pub path: String,
    pub directory: String,
    pub is_diff: bool,
    pub pinned: bool,
    pub value: Value,
    pub diff: DiffState,
    pub pending_expansion: Vec<(usize, usize, diff::Expand)>,
    pub edit: TextEdit,
    pub source_input: super::editor::SourceInput,
    pub source_rects: std::collections::BTreeMap<usize, [f32; 4]>,
    pub source_viewport: f32,
    pub editing: bool,
    pub preview: bool,
    pub rich_preview: Option<super::preview::Host>,
    pub discarding: bool,
    pub revision: u64,
    pub saved_revision: u64,
    pub saving: Option<(u64, String)>,
    pub lines: Vec<(usize, usize)>,
    pub line_columns: usize,
    pub highlights: Vec<syntax::Highlight>,
    pub highlight_due: Option<f64>,
    pub syntax_source: String,
    pub visible_source: std::ops::Range<usize>,
    pub image: Option<Result<rune::Image, String>>,
    pub image_scale: Option<f32>,
    pub image_view: super::image::ViewState,
    pub stale: bool,
}
impl Document {
    pub fn dirty(&self) -> bool {
        self.revision != self.saved_revision
    }
    pub fn bytes(&self) -> usize {
        let image = self
            .image
            .as_ref()
            .and_then(|v| v.as_ref().ok())
            .and_then(|v| v.size())
            .map(|[w, h]| w as usize * h as usize * 4 * 4 / 3)
            .unwrap_or(0);
        self.value["bytes"].as_u64().unwrap_or(0) as usize
            + self.edit.text.len() * 2
            + self.value["patch"].as_str().map(str::len).unwrap_or(0) * 4
            + image
    }
}
impl State {
    pub fn open_workspace_file(&mut self, path: String, is_diff: bool) {
        let directory = self.workspace_directory();
        self.open_workspace_target(directory, path, is_diff);
    }
    pub fn open_workspace_target(&mut self, directory: String, path: String, is_diff: bool) {
        if directory == self.workspace_directory() {
            let mut parent = std::path::Path::new(&path).parent();
            let mut parents = Vec::new();
            while let Some(p) = parent.filter(|p| !p.as_os_str().is_empty()) {
                parents.push(p.to_string_lossy().into_owned());
                parent = p.parent();
            }
            for parent in parents.into_iter().rev() {
                self.workbench.folders.insert(parent.clone());
                self.load_folder(&parent, false);
            }
            self.rebuild_workspace_tree();
        }
        if let Some(i) = self
            .workbench
            .docs
            .iter()
            .position(|d| d.path == path && d.directory == directory && d.is_diff == is_diff)
        {
            self.workbench.selected = Some(i);
            if !self.workbench.docs[i].stale || self.workbench.docs[i].dirty() {
                return;
            }
        }
        let tag = format!(
            "{}:{}",
            if is_diff { "diff" } else { "file" },
            json!([directory, path])
        );
        let mut q = vec![("directory".into(), directory), ("path".into(), path)];
        if is_diff {
            q.push(("mode".into(), self.workbench.mode.clone()));
        }
        self.workspace_get(
            &tag,
            if is_diff {
                "workspace/diff"
            } else {
                "workspace/file"
            }
            .into(),
            q,
            true,
        );
    }
    pub fn save_workspace_file(&mut self) {
        if self.workbench.docs.iter().any(|d| d.saving.is_some()) {
            return;
        }
        let Some(doc) = self
            .workbench
            .selected
            .and_then(|i| self.workbench.docs.get_mut(i))
        else {
            return;
        };
        if !doc.dirty() || doc.saving.is_some() {
            return;
        }
        let path = doc.path.clone();
        let directory = doc.directory.clone();
        let version = doc.value["version"].clone();
        let text = doc.edit.text.clone();
        doc.saving = Some((doc.revision, text.clone()));
        self.workspace_request(
            format!("save:{}", json!([directory, path])),
            Operation::Save(
                json!({"directory":directory,"path":path,"text":text,"version":version}),
            ),
        );
    }
    pub fn close_workspace_document(&mut self, index: usize) {
        if self.workbench.docs.get(index).is_some_and(Document::dirty) {
            self.workbench.error = Some("Save your edits before closing this file.".into());
            return;
        }
        self.workbench.docs.remove(index);
        let selected = self.workbench.selected;
        self.workbench.selected = if self.workbench.docs.is_empty() {
            None
        } else {
            selected.map(|current| {
                if current > index {
                    current - 1
                } else if current == index {
                    index.min(self.workbench.docs.len() - 1)
                } else {
                    current
                }
            })
        };
    }
}
pub fn receive(s: &mut State, tag: &str, mut p: Payload) {
    let Some((kind, path)) = tag.split_once(':') else {
        return;
    };
    let target = serde_json::from_str::<Vec<String>>(path)
        .ok()
        .filter(|v| v.len() >= 2);
    let directory = target
        .as_ref()
        .map(|v| v[0].clone())
        .unwrap_or_else(|| s.workspace_directory());
    let path = target.as_ref().map(|v| v[1].as_str()).unwrap_or(path);
    if kind == "highlight" {
        if let Some(doc) = s.workbench.docs.iter_mut().find(|d| {
            d.path == path
                && d.directory == directory
                && !d.is_diff
                && p.value["revision"].as_u64() == Some(d.revision)
        }) {
            doc.highlights = p
                .highlights
                .remove(&worker::hash(p.value["text"].as_str().unwrap_or("")))
                .unwrap_or_default();
        }
        return;
    }
    if kind == "save" {
        if let Some(doc) = s.workbench.docs.iter_mut().find(|d| {
            d.path == path && d.directory == directory && !d.is_diff && d.saving.is_some()
        }) {
            if let Some((revision, _)) = doc.saving.take() {
                doc.value = p.value;
                doc.saved_revision = revision;
                // The source editor stays mounted after a save, like FileEditor.
                reindex(doc);
            }
        }
        s.load_panel(true);
        return;
    }
    if !matches!(kind, "file" | "diff" | "diff-full") {
        return;
    }
    if kind == "diff-full" {
        if target
            .as_ref()
            .and_then(|v| v.get(2))
            .is_some_and(|mode| mode != &s.workbench.mode)
        {
            return;
        }
        if let Some(doc) = s
            .workbench
            .docs
            .iter_mut()
            .find(|d| d.is_diff && d.path == path && d.directory == directory)
        {
            if target.as_ref().and_then(|v| v.get(3)).is_some_and(|hash| {
                *hash != worker::hash(doc.value["patch"].as_str().unwrap_or("")).to_string()
            }) {
                return;
            }
            doc.diff.attach_full_sources(p.diff);
            let map = Arc::new(p.highlights);
            doc.diff.set_highlighter(
                Highlighter::new(move |_, code| {
                    map.get(&worker::hash(code)).cloned().unwrap_or_default()
                })
                .key((s.workbench.epoch, path, "full")),
            );
            for (file, gap, how) in std::mem::take(&mut doc.pending_expansion) {
                doc.diff.expand(file, gap, how);
            }
        }
        return;
    }
    let mut diff = DiffState::new(p.diff);
    diff.set_mode(if s.workbench.split {
        DiffMode::Split
    } else {
        DiffMode::Unified
    });
    let highlights = if kind == "file" {
        p.highlights
            .remove(&worker::hash(p.value["text"].as_str().unwrap_or("")))
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    if kind.starts_with("diff") {
        let map = Arc::new(p.highlights);
        diff.set_highlighter(
            Highlighter::new(move |_, code| {
                map.get(&worker::hash(code)).cloned().unwrap_or_default()
            })
            .key((s.workbench.epoch, path)),
        );
    }
    let text = p.value["text"].as_str().unwrap_or("");
    let mut edit = TextEdit::new("");
    // Long-file viewer remains virtual; only allocate an editable buffer on demand.
    if text.len() <= MAX_EDIT_BYTES {
        edit.replace_text(text);
        edit.anchor = 0;
        edit.focus = 0;
    }
    let editing =
        !kind.starts_with("diff") && p.value["kind"] == "text" && text.len() <= MAX_EDIT_BYTES;
    let syntax_source = super::editor::syntax_prefix(text).to_owned();
    let rich_preview = p
        .preview
        .as_deref()
        .and_then(|html| super::preview::create(s, html, &directory, path));
    let mut doc = Document {
        path: path.into(),
        directory: directory.clone(),
        is_diff: kind.starts_with("diff"),
        pinned: s.workbench.pin_target.as_ref().is_some_and(|(d, p, diff)| {
            d == &directory && p == path && *diff == kind.starts_with("diff")
        }),
        image_scale: None,
        image_view: Default::default(),
        value: p.value,
        diff,
        pending_expansion: Vec::new(),
        edit,
        source_input: Default::default(),
        source_rects: Default::default(),
        source_viewport: 0.0,
        editing,
        preview: false,
        rich_preview,
        discarding: false,
        revision: 0,
        saved_revision: 0,
        saving: None,
        lines: Vec::new(),
        line_columns: 0,
        highlights,
        highlight_due: None,
        syntax_source,
        visible_source: 0..128,
        image: p.image,
        stale: false,
    };
    reindex(&mut doc);
    if doc.editing {
        super::editor::activate(&mut doc, 0);
    }
    if doc.pinned {
        s.workbench.pin_target = None;
    }
    // Never evict an unsaved draft. Both tab count and retained source bytes are bounded.
    let bytes: usize = s.workbench.docs.iter().map(Document::bytes).sum();
    if let Some(index) = s.workbench.docs.iter().position(|d| {
        d.path == path && d.directory == directory && d.is_diff == doc.is_diff && !d.dirty()
    }) {
        if bytes.saturating_sub(s.workbench.docs[index].bytes()) + doc.bytes() > 64 * 1024 * 1024 {
            s.workbench.error = Some(
                "This preview exceeds the 64 MiB memory budget. Close an open file first.".into(),
            );
            return;
        }
        doc.pinned |= s.workbench.docs[index].pinned;
        s.workbench.docs[index] = doc;
        s.workbench.selected = Some(index);
        super::review::refresh(s);
        return;
    }
    if doc.bytes() > 64 * 1024 * 1024 {
        s.workbench.error = Some("This preview exceeds the 64 MiB memory budget.".into());
        return;
    }
    let mut bytes = bytes;
    s.workbench.docs.retain(|existing| {
        let keep = existing.pinned || existing.dirty() || existing.saving.is_some();
        if !keep {
            bytes = bytes.saturating_sub(existing.bytes());
        }
        keep
    });
    while s.workbench.docs.len() >= 12 || bytes + doc.bytes() > 64 * 1024 * 1024 {
        if let Some(i) = s
            .workbench
            .docs
            .iter()
            .position(|d| !d.dirty() && d.saving.is_none())
        {
            bytes = bytes.saturating_sub(s.workbench.docs.remove(i).bytes());
        } else {
            s.workbench.error = Some("Close or save an open file first.".into());
            return;
        }
    }
    s.workbench.docs.push(doc);
    s.workbench.selected = Some(s.workbench.docs.len() - 1);
    super::review::refresh(s);
}
pub(super) fn reindex(doc: &mut Document) {
    let text = if doc.editing {
        &doc.edit.text
    } else {
        doc.value["text"].as_str().unwrap_or("")
    };
    let mut start = 0;
    doc.line_columns = 0;
    doc.lines = text
        .split('\n')
        .map(|line| {
            let content = line.strip_suffix('\r').unwrap_or(line);
            let columns = content.chars().fold(0, |column, c| {
                column + if c == '\t' { 4 - column % 4 } else { 1 }
            });
            doc.line_columns = doc.line_columns.max(columns);
            let range = (start, start + content.len());
            start += line.len() + 1;
            range
        })
        .collect();
}
pub fn view(s: &State) -> El {
    let Some(index) = s.workbench.selected else {
        return empty_document(s);
    };
    let Some(doc) = s.workbench.docs.get(index) else {
        return empty_document(s);
    };
    let t = &s.theme;
    let mut toolbar = row()
        .w_full()
        .h(40.0)
        .pl(12.0)
        .pr(8.0)
        .gap(8.0)
        .center_y()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
        .border_layout()
        .child(breadcrumbs(s, &doc.path));
    if doc.is_diff {
        let mut layouts = row()
            .gap(2.0)
            .padding(2.0)
            .radius(9.0)
            .fill(t.c("well"))
            .role("group")
            .label("Diff layout");
        for (split, name, glyph) in [
            (false, "Unified", &crate::chat::icons::UNIFIED),
            (true, "Split", &crate::chat::icons::SPLIT),
        ] {
            let choice = crate::sidebar::icon_button_ink(
                t,
                glyph,
                name,
                14.0,
                if s.workbench.split == split {
                    "text"
                } else {
                    "text-secondary"
                },
            )
            .size(28.0, 26.0)
            .checked(s.workbench.split == split)
            .on_press(move |s: &mut State| {
                s.workbench.split = split;
                for doc in &mut s.workbench.docs {
                    doc.diff.set_mode(if split {
                        DiffMode::Split
                    } else {
                        DiffMode::Unified
                    });
                }
            });
            layouts = layouts.child(if s.workbench.split == split {
                t.shadow(t.paint(choice, "glaze"), "glaze-shadow")
            } else {
                choice
            });
        }
        toolbar = toolbar
            .child(rune::el().grow(1.0))
            .child(s.theme.shadow(layouts, "well-shadow"));
        if doc.value["status"] != "deleted" {
            toolbar = toolbar.gap(4.0).child(
                crate::sidebar::icon_button(t, &crate::icons::DIFF_EDIT, "Edit file").on_press(
                    move |s: &mut State| {
                        let doc = &s.workbench.docs[index];
                        let (directory, path) = (doc.directory.clone(), doc.path.clone());
                        s.workbench.panel = Panel::Files;
                        s.open_workspace_target(directory, path, false);
                    },
                ),
            );
        }
        let diff = DiffView::new(
            |s: &State| &s.workbench.docs[s.workbench.selected.unwrap()].diff,
            |s: &mut State| {
                let i = s.workbench.selected.unwrap();
                &mut s.workbench.docs[i].diff
            },
        )
        .fold_row(diff::FoldRow::LineInfo)
        .syntax(super::editor::syntax_theme(s))
        .on_expand(move |s, file, gap, how| {
            let doc = &mut s.workbench.docs[index];
            if doc.pending_expansion.len() < 64 {
                doc.pending_expansion.push((file, gap, how));
            }
            let (directory, path) = (doc.directory.clone(), doc.path.clone());
            let fingerprint = worker::hash(doc.value["patch"].as_str().unwrap_or("")).to_string();
            s.workspace_get(
                &format!(
                    "diff-full:{}",
                    json!([directory, path, s.workbench.mode, fingerprint])
                ),
                "workspace/diff".into(),
                vec![
                    ("directory".into(), directory),
                    ("path".into(), path),
                    ("mode".into(), s.workbench.mode.clone()),
                    ("full".into(), "1".into()),
                ],
                true,
            );
        })
        .on_comment(|s, range, tx| {
            if s.chat.comment_editor.is_some() {
                return;
            }
            super::review::begin(s, range);
            tx.focus("review-comment", false);
        })
        .on_select(|s, _, _| {
            if s.chat.comment_editor.is_some() {
                if let Some(index) = s.workbench.selected {
                    s.workbench.docs[index].diff.set_selection(None);
                }
            }
        })
        .annotation(super::review::card)
        .build(s, &super::view::kit(s));
        return col()
            .grow(1.0)
            .min_h(0.0)
            .min_w(0.0)
            .child(
                toolbar
                    .child(super::actions::trigger(s, index).ml(4.0))
                    .child(tree_toggle(s).ml(4.0)),
            )
            .child(diff.grow(1.0).min_h(0.0));
    }
    if doc.editing {
        let markdown = doc.path.rsplit('.').next().is_some_and(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown"
            )
        });
        if markdown {
            let modes = row()
                .gap(2.0)
                .padding(2.0)
                .radius(7.0)
                .fill(t.c("surface-under"))
                .child(
                    crate::sidebar::icon_button(t, &crate::chat::icons::SOURCE, "Edit source")
                        .checked(!doc.preview)
                        .fill(t.c(if !doc.preview {
                            "control"
                        } else {
                            "surface-under"
                        }))
                        .disabled(doc.saving.is_some())
                        .on_press(move |s: &mut State| s.workbench.docs[index].preview = false),
                )
                .child(
                    crate::sidebar::icon_button(
                        t,
                        &crate::chat::icons::PREVIEW,
                        "Preview Markdown",
                    )
                    .checked(doc.preview)
                    .fill(t.c(if doc.preview {
                        "control"
                    } else {
                        "surface-under"
                    }))
                    .disabled(doc.saving.is_some())
                    .on_press(move |s: &mut State| s.workbench.docs[index].preview = true),
                );
            toolbar = toolbar.gap(4.0).child(modes);
        }
        if doc.dirty() {
            toolbar = toolbar.child(label(t, "Unsaved edits", 11.0, 400.0, "text-tertiary"));
        }
        toolbar = toolbar.child(
            crate::sidebar::icon_button(t, &crate::chat::icons::UNDO, "Discard edits")
                .disabled(!doc.dirty() || doc.saving.is_some())
                .on_press(move |s: &mut State| s.workbench.docs[index].discarding = true),
        );
        toolbar = toolbar.child(super::actions::save(s, index));
    }
    let content =
        if doc.discarding {
            col()
                .grow(1.0)
                .w_full()
                .padding(24.0)
                .gap(12.0)
                .role("dialog")
                .label("Discard file edits?")
                .child(label(t, "Discard file edits?", 16.0, 600.0, "text"))
                .child(
                    label(
                        t,
                        format!(
                            "Replace your unsaved edits to {} with the latest loaded disk version?",
                            doc.path
                        ),
                        14.0,
                        400.0,
                        "text",
                    )
                    .wrap(),
                )
                .child(
                    row()
                        .gap(8.0)
                        .child(button(s, "Keep editing").on_press(move |s: &mut State| {
                            s.workbench.docs[index].discarding = false
                        }))
                        .child(button(s, "Discard edits").on_press(move |s: &mut State| {
                            let doc = &mut s.workbench.docs[index];
                            doc.edit
                                .replace_text(doc.value["text"].as_str().unwrap_or(""));
                            doc.saved_revision = doc.revision;
                            doc.discarding = false;
                            reindex(doc);
                            super::editor::sync(doc);
                        })),
                )
        } else if doc.preview {
            super::markdown::view(s, index)
        } else if doc.editing {
            super::editor::view(s, index)
        } else if doc.value["kind"] == "text" {
            col()
                .grow(1.0)
                .min_h(0.0)
                .scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .child(col().growth(GrowthSpec::default()).w_full().virtual_rows(
                    doc.lines.len(),
                    20.0,
                    move |_: &State, n| format!("file-{index}-line-{n}").into(),
                    move |s: &State, n| file_line(s, index, n),
                ))
        } else if let Some(host) = &doc.rich_preview {
            super::preview::view(s, index, host)
        } else if let Some(Ok(image)) = &doc.image {
            super::image::view(s, index, image)
        } else if doc.value["kind"] == "binary" {
            super::view::empty(
                s,
                &format!(
                    "Binary file · {} bytes. Text preview is unavailable.",
                    super::image::decimal(doc.value["bytes"].as_f64().unwrap_or(0.0))
                ),
            )
        } else if doc.image.as_ref().is_some_and(Result::is_err) {
            super::view::empty(s, "Could not decode this image.")
        } else {
            super::view::empty(
                s,
                doc.image
                    .as_ref()
                    .and_then(|i| i.as_ref().err())
                    .map(String::as_str)
                    .unwrap_or("No preview available for this file."),
            )
        };
    col()
        .grow(1.0)
        .min_h(0.0)
        .min_w(0.0)
        .child(
            toolbar
                .child(super::actions::trigger(s, index).ml(4.0))
                .child(tree_toggle(s).ml(4.0)),
        )
        .child(content)
}
fn file_line(s: &State, index: usize, n: usize) -> El {
    let doc = &s.workbench.docs[index];
    let t = &s.theme;
    let (a, b) = doc.lines[n];
    let text = &doc.value["text"].as_str().unwrap_or("")[a..b];
    let first = doc.highlights.partition_point(|(r, _)| r.end <= a);
    let highlights: Vec<_> = doc.highlights[first..]
        .iter()
        .take_while(|(r, _)| r.start < b)
        .map(|(r, p)| (r.start.max(a) - a..r.end.min(b) - a, *p))
        .collect();
    let spans = SyntaxTheme::from_kit(&super::view::kit(s)).spans(&highlights, 0);
    row()
        .key(format!("file-{index}-line-{n}"))
        .w_full()
        .min_h(20.0)
        .gap(12.0)
        .child(label(t, &format!("{}", n + 1), 11.5, 400.0, "text-tertiary").w(44.0))
        .child(
            rich(text, spans)
                .font(TextStyle::new(12.5, 400.0).mono().lh(20.0))
                .color(t.c("text"))
                .selectable(true),
        )
}
fn tree_toggle(s: &State) -> El {
    crate::sidebar::icon_button(
        &s.theme,
        &crate::chat::icons::PANEL,
        if s.workbench.tree_visible {
            "Hide file tree"
        } else {
            "Show file tree"
        },
    )
    .on_press(|s: &mut State| s.workbench.tree_visible = !s.workbench.tree_visible)
}
fn empty_document(s: &State) -> El {
    let changes = s.workbench.panel == Panel::Changes;
    col()
        .grow(1.0)
        .min_h(0.0)
        .min_w(0.0)
        .child(
            row()
                .w_full()
                .h(40.0)
                .pl(12.0)
                .pr(8.0)
                .gap(8.0)
                .center_y()
                .border_sides([0.0, 0.0, 1.0, 0.0], s.theme.c("border"))
                .border_layout()
                .child(breadcrumbs(s, ""))
                .child(rune::el().grow(1.0))
                .child(tree_toggle(s)),
        )
        .child(
            col()
                .grow(1.0)
                .center()
                .padding(24.0)
                .child(
                    rune::icon(
                        if changes {
                            &crate::chat::icons::CHANGES
                        } else {
                            &crate::chat::icons::READ
                        },
                        28.0,
                    )
                    .color(s.theme.c("text-tertiary"))
                    .mb(16.0),
                )
                .child(
                    label(
                        &s.theme,
                        if changes {
                            "Review your changes"
                        } else {
                            "Your workspace"
                        },
                        14.0,
                        500.0,
                        "text",
                    )
                    .mb(8.0),
                )
                .child(label(
                    &s.theme,
                    "Select a file in the tree to open it.",
                    12.0,
                    400.0,
                    "text-secondary",
                ))
                .child(
                    label(
                        &s.theme,
                        "Double-click to keep a tab open.",
                        12.0,
                        400.0,
                        "text-tertiary",
                    )
                    .mt(8.0),
                ),
        )
}
fn breadcrumbs(s: &State, path: &str) -> El {
    if s.workbench.panel == Panel::Changes {
        let mut modes = row()
            .gap(2.0)
            .padding(2.0)
            .radius(9.0)
            .fill(s.theme.c("well"))
            .role("group")
            .label("Compare changes against");
        for (mode, name) in [("working", "Uncommitted"), ("branch", "Base branch")] {
            let button = button(s, name)
                .h(26.0)
                .px(10.0)
                .font(TextStyle::new(12.0, 500.0).lh(18.0))
                .checked(s.workbench.mode == mode)
                .on_press(move |s: &mut State| {
                    if s.workbench.mode == mode {
                        return;
                    }
                    s.workbench.mode = mode.into();
                    s.workbench.docs.retain(|d| !d.is_diff);
                    s.workbench.selected = None;
                    s.load_panel(true);
                });
            modes = modes.child(if s.workbench.mode == mode {
                s.theme.shadow(
                    s.theme.paint(button.color(s.theme.c("text")), "glaze"),
                    "glaze-shadow",
                )
            } else {
                button
            });
        }
        return s.theme.shadow(modes, "well-shadow");
    }
    let mut nav = row()
        .grow(1.0)
        .min_w(0.0)
        .center_y()
        .gap(6.0)
        .role("navigation")
        .label("File breadcrumbs");
    for (index, part) in path.split('/').enumerate() {
        if index > 0 {
            nav = nav.child(label(&s.theme, "›", 12.0, 400.0, "text-tertiary"));
        }
        nav = nav.child(label(&s.theme, part, 12.0, 400.0, "text-secondary").truncate());
    }
    nav
}
pub fn button(s: &State, name: &str) -> El {
    label(&s.theme, name, 11.5, 400.0, "text-secondary")
        .px(7.0)
        .py(4.0)
        .radius(6.0)
        .hover(s.theme.c("hover"))
        .role("button")
        .focusable(true)
}
pub fn capture(
    s: &mut State,
    url: &str,
    directory: &str,
    path: &str,
    is_diff: bool,
) -> Result<(), String> {
    let q = vec![
        ("directory".into(), directory.into()),
        ("path".into(), path.into()),
        ("mode".into(), "working".into()),
    ];
    let mut p = super::capture_get(
        url,
        if is_diff {
            "workspace/diff"
        } else {
            "workspace/file"
        }
        .into(),
        q,
    )?;
    if !is_diff {
        p.highlights.insert(
            worker::hash(p.value["text"].as_str().unwrap_or("")),
            worker::source_highlights(path, p.value["text"].as_str().unwrap_or("")),
        );
    }
    receive(
        s,
        &format!("{}:{path}", if is_diff { "diff" } else { "file" }),
        p,
    );
    // Capture-only replay of a lazy context response; production uses DiffView::on_expand.
    if is_diff {
        if let Some(gap) = std::env::var("OPENCODEX_CAPTURE_EXPAND_GAP")
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
        {
            if let Some(index) = s.workbench.selected {
                s.workbench.docs[index]
                    .pending_expansion
                    .push((0, gap, diff::Expand::Down));
                let full = super::capture_get(
                    url,
                    "workspace/diff".into(),
                    vec![
                        ("directory".into(), directory.into()),
                        ("path".into(), path.into()),
                        ("mode".into(), "working".into()),
                        ("full".into(), "1".into()),
                    ],
                )?;
                receive(s, &format!("diff-full:{path}"), full);
            }
        }
    }
    Ok(())
}
