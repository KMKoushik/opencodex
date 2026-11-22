use super::*;
use crate::Options;
use std::time::Instant;
fn state() -> State {
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
fn side_acknowledgement_treats_text_and_context_as_one_captured_draft() {
    for changed in ["text", "context", "neither"] {
        let mut s = state();
        let id = "side".to_owned();
        s.workbench
            .side_drafts
            .insert(id.clone(), TextEdit::new("captured prompt"));
        s.workbench.side_revisions.insert(id.clone(), 1);
        s.workbench.side_sending = Some((id.clone(), 1));
        let draft = s.composer.drafts.edit(&id);
        draft
            .mentions
            .push(serde_json::json!({"type":"file","path":"README.md","token":"@README.md"}));
        s.workbench.side_context_revision = Some(draft.revision);
        match changed {
            "text" => {
                s.workbench.side_revisions.insert(id.clone(), 2);
            }
            "context" => s.composer.drafts.touch(&id),
            _ => {}
        }
        receive(
            &mut s,
            "side-send",
            worker::prepare(serde_json::Value::Null),
        );
        if changed == "neither" {
            assert!(s.workbench.side_drafts[&id].text.is_empty());
            assert!(s.composer.drafts.get(&id).mentions.is_empty());
        } else {
            assert_eq!(s.workbench.side_drafts[&id].text, "captured prompt");
            assert_eq!(s.composer.drafts.get(&id).mentions.len(), 1);
        }
    }
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
