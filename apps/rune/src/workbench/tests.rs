use super::*;
use crate::Options;
use std::time::Instant;
pub(super) fn state() -> State {
    OPTIONS.get_or_init(|| Options {
        page: String::new(),
        gateway: None,
        preset: String::new(),
        dark: true,
        headless: true,
        session: None,
        scroll: "bottom".into(),
        work: None,
        composer_state: String::new(),
        panel: None,
        file: None,
        size: (1280.0, 800.0),
    });
    let mut s = State::new();
    s.selected = Some("fixture".into());
    s.workbench.open = true;
    s
}
#[test]
fn save_acknowledges_only_captured_revision_and_navigation_preserves_edits() {
    let mut s = state();
    documents::receive(
        &mut s,
        "file:source.rs",
        worker::prepare(
            serde_json::json!({"kind":"text","text":"original","version":"before","bytes":8}),
        ),
    );
    let d = &mut s.workbench.docs[0];
    d.edit.replace_text("saved + later edits");
    d.revision = 2;
    d.saving = Some((1, "saved".into()));
    documents::receive(
        &mut s,
        "save:source.rs",
        worker::prepare(
            serde_json::json!({"kind":"text","text":"saved","version":"after","bytes":5}),
        ),
    );
    let d = &s.workbench.docs[0];
    assert!(d.dirty());
    assert_eq!(d.edit.text, "saved + later edits");
    assert_eq!(d.value["version"], "after");
    reset(&mut s);
    assert_eq!(s.workbench.docs.len(), 1);
    assert!(s.workbench.docs[0].dirty());
}

#[test]
fn one_preview_tab_replaces_clean_previews_and_closing_a_background_tab_keeps_selection() {
    let mut s = state();
    for name in ["pinned.txt", "preview.txt"] {
        documents::receive(
            &mut s,
            &format!("file:{name}"),
            worker::prepare(
                serde_json::json!({"kind":"text","text":name,"version":"disk","bytes":name.len()}),
            ),
        );
        if name == "pinned.txt" {
            s.workbench.docs[0].pinned = true;
        }
    }
    s.workbench.selected = Some(0);
    documents::receive(
        &mut s,
        "file:replacement.txt",
        worker::prepare(
            serde_json::json!({"kind":"text","text":"replacement","version":"disk","bytes":11}),
        ),
    );
    assert_eq!(s.workbench.docs.len(), 2);
    assert_eq!(s.workbench.docs[1].path, "replacement.txt");
    s.close_workspace_document(0);
    assert_eq!(s.workbench.selected, Some(0));
    assert_eq!(s.workbench.docs[0].path, "replacement.txt");
}
#[test]
fn file_links_keep_directory_identity_and_large_text_remains_editable() {
    let mut s = state();
    for directory in ["/first", "/second"] {
        let text = "x".repeat(256 * 1024);
        documents::receive(
            &mut s,
            &format!("file:{}", serde_json::json!([directory, "notes.txt"])),
            worker::prepare(
                serde_json::json!({"kind":"text", "text":text, "version":"disk", "bytes":text.len()}),
            ),
        );
        s.workbench.docs.last_mut().unwrap().pinned = true;
    }
    assert_eq!(s.workbench.docs.len(), 2);
    for (doc, directory) in s.workbench.docs.iter().zip(["/first", "/second"]) {
        assert_eq!(doc.directory, directory);
        assert!(doc.editing);
        assert_eq!(doc.edit.text.len(), 256 * 1024);
    }
    s.workbench.docs[1].revision = 1;
    s.workbench.docs[1].saving = Some((1, "new".into()));
    documents::receive(
        &mut s,
        "save:[\"/second\",\"notes.txt\"]",
        worker::prepare(
            serde_json::json!({"kind":"text", "text":"new", "version":"after", "bytes":3}),
        ),
    );
    assert_eq!(s.workbench.docs[0].value["version"], "disk");
    assert_eq!(s.workbench.docs[1].value["version"], "after");
}
#[test]
fn large_workspaces_mount_only_visible_rows() {
    let mut timings = [Vec::<f64>::new(), Vec::<f64>::new()];
    let mut prepare_times = Vec::new();
    // Alternating paired samples; CPU runtime only, no network, GPU upload or presentation.
    for run in 0..if cfg!(debug_assertions) { 1 } else { 7 } {
        for kind in [run % 2, 1 - run % 2] {
            let mut s = state();
            if kind == 0 {
                s.workbench.panel = Panel::Files;
                s.workbench.tree = (0..5000)
                    .map(|i| (format!("file-{i:05}.rs"), false, 0))
                    .collect();
            } else {
                s.workbench.panel = Panel::Changes;
                let mut patch="diff --git a/source.rs b/source.rs\n--- a/source.rs\n+++ b/source.rs\n@@ -1,2000 +1,2000 @@\n".to_owned();
                for n in 0..2000 {
                    patch.push_str(&format!("-let value_{n} = old;\n+let value_{n} = new;\n"));
                }
                let start = Instant::now();
                let p = worker::prepare(serde_json::json!({"patch":patch}));
                prepare_times.push(start.elapsed().as_secs_f64() * 1000.0);
                documents::receive(&mut s, "diff:source.rs", p);
            }
            let mut rt =
                rune::Runtime::new(s, crate::view, (1280.0, 800.0), rune::Env::new(true, 2.0));
            let start = Instant::now();
            rt.frame(0.0);
            timings[kind].push(start.elapsed().as_secs_f64() * 1000.0);
            assert!(
                rt.elements().len() < 1800,
                "scene size must not grow with source length"
            );
            if kind == 0 {
                let rows = rt
                    .elements()
                    .iter()
                    .filter(|e| e.key.as_deref().is_some_and(|key| key.starts_with("file-")))
                    .count();
                assert!(
                    rows > 5 && rows < 80,
                    "only visible file rows mount: {rows}"
                );
            }
        }
    }
    let [tree, diff] = &mut timings;
    for (label, values) in [
        ("5000-file first CPU frame", tree),
        ("2000-line diff first CPU frame", diff),
        ("diff parse + word pairing + highlights", &mut prepare_times),
    ] {
        values.sort_by(f64::total_cmp);
        eprintln!(
            "{label}: median {:.3} ms; range {:.3}–{:.3}; n={}",
            values[values.len() / 2],
            values[0],
            values[values.len() - 1],
            values.len()
        );
    }
}

#[test]
fn two_mib_native_editor_keeps_input_and_virtualizes_source_rows() {
    let mut s = state();
    let mut source = "let value = 1234567890123456789;\n".repeat(70_000);
    source.truncate(2 * 1024 * 1024);
    documents::receive(
        &mut s,
        "file:large.ts",
        worker::prepare(
            serde_json::json!({"kind":"text","text":source,"version":"disk","bytes":source.len(),"__path":"large.ts"}),
        ),
    );
    fn source_view(s: &State, _: &mut rune::Cx<State>) -> rune::El {
        super::editor::view(s, 0).h_full()
    }
    let mut rt = rune::Runtime::new(s, source_view, (800.0, 600.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    rt.update(|s, tx| {
        s.workbench.docs[0].edit.anchor = 0;
        s.workbench.docs[0].edit.focus = 1;
        super::editor::sync(&mut s.workbench.docs[0]);
        tx.focus("workspace-editor", false);
    });
    rt.frame(0.0);
    let mut times = Vec::new();
    for i in 0..if cfg!(debug_assertions) { 2 } else { 20 } {
        rt.update(|s, _| {
            s.workbench.docs[0].edit.anchor = 0;
            s.workbench.docs[0].edit.focus = 1;
            super::editor::sync(&mut s.workbench.docs[0]);
        });
        rt.frame(0.0);
        let start = Instant::now();
        rt.key(rune::KeyEvent {
            key: rune::Key::Text(if i % 2 == 0 { "x" } else { "y" }.into()),
            mods: Default::default(),
        });
        rt.frame(0.0);
        times.push(start.elapsed().as_secs_f64() * 1000.0);
        rt.update(|s, _| {
            assert_eq!(s.workbench.docs[0].edit.text.len(), 2 * 1024 * 1024);
            assert_eq!(
                &s.workbench.docs[0].edit.text[..1],
                if i % 2 == 0 { "x" } else { "y" }
            );
            assert!(s.workbench.error.is_none());
            assert!(s.workbench.docs[0].dirty());
        });
    }
    let number_rows = rt
        .elements()
        .iter()
        .filter(|e| {
            e.key
                .as_deref()
                .is_some_and(|k| k.starts_with("source-line-"))
        })
        .count();
    assert!(
        number_rows > 10 && number_rows < 120,
        "number rows: {number_rows}"
    );
    times.sort_by(f64::total_cmp);
    eprintln!(
        "2 MiB native key-to-CPU-frame: p50 {:.3} ms; p95 {:.3} ms; max {:.3} ms; n={}; excludes GPU/OS delivery",
        times[times.len() / 2],
        times[(times.len() * 95 / 100).min(times.len() - 1)],
        times[times.len() - 1],
        times.len()
    );
}

#[test]
fn source_cards_follow_end_line_and_native_rows_keep_multiline_paste_ime_and_undo() {
    let mut s = state();
    documents::receive(
        &mut s,
        "file:source.ts",
        worker::prepare(
            serde_json::json!({"kind":"text","text":"alpha\nbeta\ngamma","version":"disk"}),
        ),
    );
    let directory = s.workbench.docs[0].directory.clone();
    s.draft_mut().comments.push(crate::chat::comments::Comment { id: "inline".into(), text: "Review these two lines".into(), target: serde_json::json!({"path":"source.ts","directory":directory,"version":"disk","start":1,"end":2,"quote":"alpha\nbeta"}) });
    fn source_view(s: &State, _: &mut rune::Cx<State>) -> rune::El {
        super::editor::view(s, 0).h_full()
    }
    let mut rt = rune::Runtime::new(s, source_view, (800.0, 600.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    let elements = rt.elements();
    let card = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("source-review-inline"))
        .unwrap();
    let second = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("source-line-0-1"))
        .unwrap();
    let third = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("source-line-0-2"))
        .unwrap();
    assert!(card.rect[1] >= second.rect[1] + 20.0);
    assert!(third.rect[1] >= card.rect[1] + card.rect[3]);
    rt.update(|s, tx| {
        s.workbench.docs[0].source_input.edit.anchor = 0;
        s.workbench.docs[0].source_input.edit.focus = 0;
        tx.focus("workspace-editor", false);
    });
    rt.frame(0.0);
    rt.paste("one\ntwo\n");
    rt.frame(0.0);
    rt.update(|s, _| {
        assert_eq!(
            s.workbench.docs[0].edit.text,
            "one\ntwo\nalpha\nbeta\ngamma"
        );
        assert_eq!(s.draft().comments[0].target["start"], 3);
        assert_eq!(s.draft().comments[0].target["end"], 4);
    });
    rt.ime(rune::Ime::Preedit("日".into(), Some((3, 3)), vec![]));
    rt.frame(0.0);
    rt.ime(rune::Ime::Commit("日".into()));
    rt.frame(0.0);
    rt.update(|s, _| {
        assert_eq!(
            s.workbench.docs[0].edit.text,
            "one\ntwo\n日alpha\nbeta\ngamma"
        )
    });
    rt.key(rune::KeyEvent {
        key: rune::Key::Command('z'),
        mods: rune::Mods {
            cmd: true,
            ..Default::default()
        },
    });
    rt.frame(0.0);
    rt.update(|s, _| {
        assert_eq!(
            s.workbench.docs[0].edit.text,
            "one\ntwo\nalpha\nbeta\ngamma"
        )
    });
    rt.key(rune::KeyEvent {
        key: rune::Key::Command('a'),
        mods: rune::Mods {
            cmd: true,
            ..Default::default()
        },
    });
    rt.paste("replacement\nlast");
    rt.frame(0.0);
    rt.update(|s, _| assert_eq!(s.workbench.docs[0].edit.text, "replacement\nlast"));
    let first = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("source-line-0-0"))
        .unwrap()
        .rect;
    let (x, y) = (first[0] + 37.5 + 15.0, first[1] + 10.0);
    rt.pointer_move(x, y);
    rt.pointer_down(x, y);
    rt.frame(0.0);
    rt.pointer_up(x, y);
    rt.frame(0.0);
    rt.key(rune::KeyEvent {
        key: rune::Key::Text("X".into()),
        mods: Default::default(),
    });
    rt.frame(0.0);
    rt.update(|s, _| assert_eq!(s.workbench.docs[0].edit.text, "reXplacement\nlast"));
}

#[test]
fn lazy_diff_sources_preserve_hunks_selection_and_expand_twenty_then_all() {
    let old = (1..=100).map(|n| format!("line {n}\n")).collect::<String>();
    let new = old.replace("line 40\n", "changed 40\n");
    let full = diff::FileDiff::from_texts_with_context("source.ts", &old, &new, 200);
    let partial = diff::FileDiff::from_texts("source.ts", &old, &new);
    let mut state = diff::DiffState::new(diff::parse(&partial.patch()));
    assert!(!state.files()[0].expandable());
    assert_eq!(state.hidden(0, 1), None);
    let range = diff::LineRange {
        file: 0,
        start: diff::LineRef::new(diff::Side::New, 40),
        end: diff::LineRef::new(diff::Side::New, 40),
    };
    state.set_selection(Some(range));
    let mut prepared = worker::prepare(serde_json::json!({"patch":full.patch(),"__full":true}));
    assert!(prepared.diff[0].expandable());
    state.attach_full_sources(std::mem::take(&mut prepared.diff));
    assert_eq!(state.selection(), Some(range));
    assert_eq!(state.files()[0].hunks.len(), 1);
    assert_eq!(state.hidden(0, 1), Some(57));
    state.expand(0, 1, diff::Expand::Down);
    assert_eq!(state.hidden(0, 1), Some(37));
    state.expand(0, 1, diff::Expand::All);
    assert_eq!(state.hidden(0, 1), Some(0));
    assert_eq!(state.metrics.header, 40.0);
    assert_eq!(state.metrics.font, 12.5);
    let mut s = self::state();
    let partial_patch = partial.patch();
    documents::receive(
        &mut s,
        "diff:source.ts",
        worker::prepare(serde_json::json!({"patch":partial_patch})),
    );
    let directory = s.workbench.docs[0].directory.clone();
    for (mode, hash, accepted) in [
        ("branch", worker::hash(&partial_patch).to_string(), false),
        ("working", "stale-patch".into(), false),
        ("working", worker::hash(&partial_patch).to_string(), true),
    ] {
        let tag = format!(
            "diff-full:{}",
            serde_json::json!([directory, "source.ts", mode, hash])
        );
        documents::receive(
            &mut s,
            &tag,
            worker::prepare(serde_json::json!({"patch":full.patch(),"__full":true})),
        );
        assert_eq!(s.workbench.docs[0].diff.files()[0].expandable(), accepted);
    }
}
