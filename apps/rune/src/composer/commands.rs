use crate::State;
use oc_gateway::prompt::Request;
pub const LOCAL: &[(&str, &str)] = &[
    (
        "undo",
        "Stage undo of the last turn; apply when you next send",
    ),
    ("redo", "Cancel staged undo and restore the conversation"),
    (
        "side",
        "Ask in a side chat without interrupting · /side question",
    ),
    ("fork", "Fork this conversation into a new thread"),
    ("new", "Start a new thread in this project"),
    ("compact", "Summarize the conversation to free context"),
    ("rename", "Rename this thread · /rename New title"),
    (
        "export",
        "Download this conversation as Markdown · /export json",
    ),
];
pub fn parse(text: &str) -> Option<(&str, &str)> {
    let slash = text.trim().strip_prefix('/')?;
    let (name, args) = slash.split_once(char::is_whitespace).unwrap_or((slash, ""));
    (!name.is_empty() && !name.contains('/')).then_some((name, args.trim()))
}
pub fn local(s: &mut State) -> bool {
    let Some((name, args)) = parse(&s.draft().edit.text)
        .filter(|(name, _)| LOCAL.iter().any(|(n, _)| n == name))
        .map(|(n, a)| (n.to_owned(), a.to_owned()))
    else {
        return false;
    };
    let Some(id) = s.selected.clone() else {
        s.error = Some(format!("/{name} needs a thread. Send a message first."));
        return true;
    };
    if !s.draft().attachments.is_empty() {
        s.error = Some("Send or remove attached context before running a thread action.".into());
        return true;
    }
    if matches!(name.as_str(), "undo" | "redo") && s.snapshot.active.contains(&id) {
        s.error = Some("Stop the current response before undoing or redoing.".into());
        return true;
    }
    if name == "rename" && args.is_empty() {
        s.error = Some("Enter a title after /rename.".into());
        return true;
    }
    if !matches!(name.as_str(), "rename" | "side" | "export") && !args.is_empty() {
        s.error = Some(format!("/{name} does not take arguments."));
        return true;
    }
    let revision = s.draft().revision;
    if name == "new" {
        s.composer.drafts.acknowledge(&id, revision);
        s.open_session(None);
        s.composer.menu = None;
        return true;
    }
    if name == "export" {
        s.error = Some("Choose an export destination using Send or Enter.".into());
        return true;
    }
    if s.prompt_request(Request::Action {
        session: id.clone(),
        revision,
        name,
        args,
        destination: None,
    }) {
        s.composer.pending.insert(id);
        s.error = None;
    }
    true
}
pub fn submit(s: &mut State, tx: &mut rune::Tx) {
    let export = parse(&s.draft().edit.text)
        .filter(|(n, _)| *n == "export")
        .map(|(_, a)| a.to_owned());
    if let (Some(args), Some(id)) = (export, s.selected.clone()) {
        if s.composer.pending.contains(&id) {
            return;
        }
        let revision = s.draft().revision;
        tx.save_file(
            rune::FileDialogOptions {
                title: "Export conversation".into(),
                ..Default::default()
            },
            move |s: &mut State, result, _| match result {
                Ok(Some(path)) => {
                    if s.prompt_request(Request::Action {
                        session: id.clone(),
                        revision,
                        name: "export".into(),
                        args: args.clone(),
                        destination: Some(path.to_string_lossy().into_owned()),
                    }) {
                        s.composer.pending.insert(id.clone());
                    }
                }
                Err(e) => s.error = Some(e.to_string()),
                _ => {}
            },
        );
    } else {
        s.send();
    }
}
