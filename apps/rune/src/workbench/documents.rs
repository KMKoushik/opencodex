use super::{
    Panel,
    worker::{self, Operation, Payload},
};
use crate::{State, sidebar::label};
use rune::{El, GrowthSpec, ScrollSpec, TextEdit, TextStyle, col, rich, row, text_input};
use rune_kit::{
    diff::{self, DiffMode, DiffState, DiffView},
    syntax::{self, Highlighter, SyntaxTheme},
};
use serde_json::{Value, json};
use std::sync::Arc;
const MAX_EDIT_BYTES: usize = 2 * 1024 * 1024;

pub struct Document {
    pub path: String,
    pub directory: String,
    pub is_diff: bool,
    pub value: Value,
    pub diff: DiffState,
    pub edit: TextEdit,
    pub editing: bool,
    pub preview: bool,
    pub discarding: bool,
    pub revision: u64,
    pub saved_revision: u64,
    pub saving: Option<(u64, String)>,
    pub lines: Vec<(usize, usize)>,
    pub highlights: Vec<syntax::Highlight>,
    pub image: Option<Result<rune::Image, String>>,
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
        self.workbench.selected = if self.workbench.docs.is_empty() {
            None
        } else {
            Some(index.min(self.workbench.docs.len() - 1))
        };
    }
}
pub fn receive(s: &mut State, tag: &str, mut p: Payload) {
    let Some((kind, path)) = tag.split_once(':') else {
        return;
    };
    let target = serde_json::from_str::<[String; 2]>(path).ok();
    let directory = target
        .as_ref()
        .map(|v| v[0].clone())
        .unwrap_or_else(|| s.workspace_directory());
    let path = target.as_ref().map(|v| v[1].as_str()).unwrap_or(path);
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
    let mut files = Vec::new();
    for prepared in p.diff {
        let mut f = diff::parse(&prepared.header);
        if let Some(file) = f.first_mut() {
            file.hunks = prepared.hunks;
        }
        files.extend(f);
    }
    let mut diff = DiffState::new(files);
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
    }
    let editing =
        !kind.starts_with("diff") && p.value["kind"] == "text" && text.len() <= MAX_EDIT_BYTES;
    let mut doc = Document {
        path: path.into(),
        directory: directory.clone(),
        is_diff: kind.starts_with("diff"),
        value: p.value,
        diff,
        edit,
        editing,
        preview: false,
        discarding: false,
        revision: 0,
        saved_revision: 0,
        saving: None,
        lines: Vec::new(),
        highlights,
        image: p.image,
        stale: false,
    };
    reindex(&mut doc);
    // Never evict an unsaved draft. Both tab count and retained source bytes are bounded.
    let bytes: usize = s.workbench.docs.iter().map(Document::bytes).sum();
    if let Some(index) = s.workbench.docs.iter().position(|d| {
        d.path == path && d.directory == directory && d.is_diff == doc.is_diff && !d.dirty()
    }) {
        s.workbench.docs[index] = doc;
        s.workbench.selected = Some(index);
        return;
    }
    if doc.bytes() > 64 * 1024 * 1024 {
        s.workbench.error = Some("This preview exceeds the 64 MiB memory budget.".into());
        return;
    }
    let mut bytes = bytes;
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
}
fn reindex(doc: &mut Document) {
    let text = doc.value["text"].as_str().unwrap_or("");
    let mut start = 0;
    doc.lines = text
        .split('\n')
        .map(|line| {
            let range = (start, start + line.len());
            start += line.len() + 1;
            range
        })
        .collect();
}
pub fn tabs(s: &State) -> El {
    let t = &s.theme;
    let mut tabs = row().h(39.0).center_y().scroll_x();
    for (index, doc) in s.workbench.docs.iter().enumerate() {
        let name = doc.path.rsplit('/').next().unwrap_or(&doc.path);
        tabs = tabs.child(
            row()
                .h(39.0)
                .px(10.0)
                .gap(6.0)
                .center_y()
                .fill(if s.workbench.selected == Some(index) {
                    t.c("surface")
                } else {
                    t.c("surface-under")
                })
                .border_sides(
                    [
                        0.0,
                        1.0,
                        if s.workbench.selected == Some(index) {
                            2.0
                        } else {
                            0.0
                        },
                        0.0,
                    ],
                    t.c("border"),
                )
                .child(
                    label(
                        t,
                        &format!("{}{}", name, if doc.dirty() { " •" } else { "" }),
                        12.0,
                        400.0,
                        "text",
                    )
                    .on_press(move |s: &mut State| {
                        let doc = &s.workbench.docs[index];
                        let (directory, path, is_diff) =
                            (doc.directory.clone(), doc.path.clone(), doc.is_diff);
                        s.open_workspace_target(directory, path, is_diff);
                    }),
                )
                .child(
                    label(t, "×", 14.0, 400.0, "text-tertiary")
                        .role("button")
                        .label("Close file")
                        .focusable(true)
                        .on_press(move |s: &mut State| s.close_workspace_document(index)),
                ),
        );
    }
    tabs
}
pub fn view(s: &State) -> El {
    let Some(index) = s.workbench.selected else {
        return super::view::empty(s, "Select a file to preview.");
    };
    let Some(doc) = s.workbench.docs.get(index) else {
        return super::view::empty(s, "Select a file to preview.");
    };
    let t = &s.theme;
    let mut toolbar = row()
        .w_full()
        .h(36.0)
        .px(10.0)
        .gap(8.0)
        .center_y()
        .border_sides([0.0, 0.0, 1.0, 0.0], t.c("border"))
        .child(
            label(t, &doc.path, 11.5, 400.0, "text-secondary")
                .truncate()
                .grow(1.0),
        );
    if doc.is_diff {
        toolbar = toolbar.child(button(s, "Expand context").on_press(move |s: &mut State| {
            let path = s.workbench.docs[index].path.clone();
            s.workspace_get(
                &format!("diff-full:{path}"),
                "workspace/diff".into(),
                vec![
                    ("directory".into(), s.workspace_directory()),
                    ("path".into(), path),
                    ("mode".into(), s.workbench.mode.clone()),
                    ("full".into(), "1".into()),
                ],
                false,
            );
        }));
        toolbar = toolbar
            .child(
                button(
                    s,
                    if s.workbench.split {
                        "Unified"
                    } else {
                        "Split"
                    },
                )
                .on_press(|s: &mut State| {
                    s.workbench.split = !s.workbench.split;
                    let mode = if s.workbench.split {
                        DiffMode::Split
                    } else {
                        DiffMode::Unified
                    };
                    for doc in &mut s.workbench.docs {
                        doc.diff.set_mode(mode);
                    }
                }),
            )
            .child(button(s, "Open file").on_press(move |s: &mut State| {
                let path = s.workbench.docs[index].path.clone();
                s.workbench.panel = Panel::Files;
                s.open_workspace_file(path, false);
            }));
        let diff = DiffView::new(
            |s: &State| &s.workbench.docs[s.workbench.selected.unwrap()].diff,
            |s: &mut State| {
                let i = s.workbench.selected.unwrap();
                &mut s.workbench.docs[i].diff
            },
        )
        .build(s, &super::view::kit(s));
        return col()
            .grow(1.0)
            .min_h(0.0)
            .min_w(0.0)
            .child(toolbar.child(tree_toggle(s)))
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
            toolbar = toolbar
                .child(
                    crate::sidebar::icon_button(t, &crate::chat::icons::SOURCE, "Edit source")
                        .disabled(doc.saving.is_some())
                        .on_press(move |s: &mut State| s.workbench.docs[index].preview = false),
                )
                .child(
                    crate::sidebar::icon_button(
                        t,
                        &crate::chat::icons::PREVIEW,
                        "Preview Markdown",
                    )
                    .disabled(doc.saving.is_some())
                    .on_press(move |s: &mut State| s.workbench.docs[index].preview = true),
                );
        }
        if doc.dirty() {
            toolbar = toolbar.child(label(t, "Unsaved edits", 11.0, 400.0, "text-tertiary"));
        }
        toolbar = toolbar.child(
            crate::sidebar::icon_button(t, &crate::chat::icons::UNDO, "Discard edits")
                .disabled(!doc.dirty() || doc.saving.is_some())
                .on_press(move |s: &mut State| s.workbench.docs[index].discarding = true),
        );
        toolbar = toolbar.child(
            crate::sidebar::icon_button(
                t,
                &crate::chat::icons::SAVE,
                if doc.saving.is_some() {
                    "Saving file…"
                } else {
                    "Save file"
                },
            )
            .disabled(!doc.dirty() || doc.saving.is_some())
            .on_press(|s: &mut State| s.save_workspace_file()),
        );
    }
    let content = if doc.discarding {
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
                    .child(
                        button(s, "Keep editing").on_press(move |s: &mut State| {
                            s.workbench.docs[index].discarding = false
                        }),
                    )
                    .child(button(s, "Discard edits").on_press(move |s: &mut State| {
                        let doc = &mut s.workbench.docs[index];
                        doc.edit
                            .replace_text(doc.value["text"].as_str().unwrap_or(""));
                        doc.saved_revision = doc.revision;
                        doc.discarding = false;
                    })),
            )
    } else if doc.preview && doc.edit.text.len() <= 200_000 {
        col()
            .grow(1.0)
            .min_h(0.0)
            .padding(24.0)
            .scroll(ScrollSpec {
                stick_bottom: false,
            })
            .child(crate::chat::markdown_view(
                s,
                &doc.edit.text,
                false,
                (s.panel_width() - 268.0).max(100.0),
            ))
    } else if doc.editing {
        text_input(&doc.edit, TextStyle::new(12.5, 400.0).mono().lh(20.0))
            .key("workspace-editor")
            .grow(1.0)
            .min_h(0.0)
            .w_full()
            .padding(12.0)
            .color(t.c("text"))
            .on_edit(move |s: &mut State| &mut s.workbench.docs[index].edit)
            .on_input_change(move |s: &mut State, _| {
                let dirty_count = s.workbench.docs.iter().filter(|d| d.dirty()).count();
                let doc = &mut s.workbench.docs[index];
                let error = if doc.edit.text.len() > MAX_EDIT_BYTES {
                    Some("This edit would exceed the file size limit. Keep this document under 2 MiB.")
                } else if !doc.dirty() && dirty_count >= 8 {
                    Some("Save or discard an open edit before editing another file (8-file limit).")
                } else { None };
                if let Some(error) = error {
                    doc.edit.undo();
                    s.workbench.error = Some(error.into());
                } else {
                    doc.revision += 1;
                }
            })
            .on_input_key(|s: &mut State, key, tx| {
                if key.is_command('s') {
                    s.save_workspace_file();
                    tx.instant();
                    true
                } else {
                    false
                }
            })
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
    } else if let Some(Ok(image)) = &doc.image {
        col().grow(1.0).min_h(0.0).center().child(
            rune::el()
                .grow(1.0)
                .w_full()
                .pixels_fit(image.pixels(), rune::SurfaceFit::Fit),
        )
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
        .child(toolbar.child(tree_toggle(s)))
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
        let lang = syntax::lang_for_path(path);
        p.highlights.insert(
            worker::hash(p.value["text"].as_str().unwrap_or("")),
            syntax::builtin(lang, p.value["text"].as_str().unwrap_or("")),
        );
    }
    receive(
        s,
        &format!("{}:{path}", if is_diff { "diff" } else { "file" }),
        p,
    );
    Ok(())
}
