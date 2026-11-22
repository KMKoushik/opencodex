//! Root worker-mailbox integration; rendering stays in main.
use super::*;

pub(crate) fn poll(s: &mut State, clock: f64, tx: &mut Tx) -> bool {
    if s.menus.sidebar_scopes.is_none() {
        sidebar::pagination::sync(s);
    }
    let connection_changed = pages::offline::poll(s, clock, tx)
        | sidebar::focus::poll(s, clock, tx)
        | sidebar::images::take(s);
    let task_minute = s.pages.tasks.minute;
    if let Some(worker) = &s.worker {
        let changes = worker.take_page_changes();
        pages::invalidate(s, changes);
    }
    pages::poll(s, clock, tx);
    notifications::clear_on_focus(s);
    let code_changed = apps::code::poll(s);
    let source_find_changed = apps::code::find::poll(s, tx);
    let mut changed = connection_changed
        || settings::appearance::receive_color(s)
        || task_minute != s.pages.tasks.minute
        || code_changed
        || source_find_changed;
    if s.menus.toast_due.is_some_and(|due| clock >= due) {
        s.menus.toast = None;
        s.menus.toast_due = None;
        changed = true;
    }
    let mut sidebar_changed = false;
    let mut chat_updated = false;
    if let Some(data) = s.worker.as_ref().and_then(Worker::take_messages) {
        if s.selected.as_deref() == Some(&data.session_id) {
            s.chat.accept(data);
            if s.find.open {
                find::refresh(s);
            }
            if let Some(info) = &s.chat.data.info {
                s.prefs.project = Some(info.location.directory.clone());
            }
            s.chat.media.request(
                s.chat.data.clone(),
                OPTIONS.get().unwrap().gateway.as_deref(),
                s.waker.clone(),
            );
            changed = true;
            chat_updated = true;
            s.chat_settled = false;
            s.chat_settle_due = Some(clock + 0.5);
            tx.wake_after(std::time::Duration::from_millis(500));
        }
    }
    if s.chat.media.take() {
        s.chat.disclosure_revision += 1;
        changed = true;
    }
    if s.chat.data.running {
        if s.chat.tick_due.is_none_or(|due| clock >= due) {
            s.chat.tick_due = Some(clock + 1.0);
            s.chat.now_ms = unix_ms() as f64;
            tx.wake_after(std::time::Duration::from_secs(1));
            changed = true;
        }
    } else {
        s.chat.tick_due = None;
    }
    if s.chat_settle_due.is_some_and(|due| clock >= due) {
        s.chat_settle_due = None;
        s.chat_settled = true;
        changed = true;
    }
    if s.selected.is_some() && !s.chat.rows.is_empty() {
        let at = s.chat.position.get();
        let away = at.max[1] - at.offset[1] > 40.0;
        if s.chat.jump != away {
            s.chat.jump = away;
            changed = true;
        }
        if at.viewport[1] > 0.0 && !s.chat.scroll_applied {
            let scroll = &OPTIONS.get().unwrap().scroll;
            if scroll == "top" {
                tx.scroll_to_instant(chat::scroll_key(s), 0.0, 0.0);
            }
            if scroll == "middle" {
                tx.scroll_to_instant(chat::scroll_key(s), 0.0, at.max[1] * 0.5);
            }
            s.chat.scroll_applied = true;
            changed = true;
        }
        if !chat_updated
            && s.worker.is_some()
            && at.viewport[1] > 0.0
            && at.offset[1] < 240.0
            && s.chat.scroll_applied
            && !s.chat.loading_earlier
            && s.chat.data.error.is_none()
            && s.chat.data.cursor.is_some()
        {
            s.load_earlier();
            changed = true;
        }
    }
    if let Some(prefs) = s
        .profile
        .as_ref()
        .and_then(|p| p.loaded.lock().ok()?.take())
    {
        let bench = std::env::var("OPENCODEX_BENCH_PROJECT").ok();
        s.prefs = prefs;
        s.theme = settings::restored_theme(
            &s.prefs,
            s.pages.appearance.system_dark.unwrap_or(s.theme.dark),
        );
        if bench.is_some() {
            s.prefs.project = bench;
        }
        changed = true;
        sidebar_changed = true;
    }
    if let Some(snapshot) = s.worker.as_ref().and_then(Worker::take) {
        if std::env::var("OPENCODEX_FRAME_LOG").as_deref() == Ok("1") {
            eprintln!(
                "OPENCODEX_SNAPSHOT {} {} {} {} {:?}",
                snapshot.sessions.len(),
                snapshot.active.len(),
                snapshot_digest(&snapshot),
                unix_ms(),
                snapshot.error
            );
        }
        notifications::snapshot(s, &snapshot);
        let reconnected = snapshot.live && !s.snapshot.live;
        let first_projects = s.snapshot.projects.is_empty() && !snapshot.projects.is_empty();
        let new_focus_thread = s.prefs.focus
            && snapshot
                .sessions
                .keys()
                .any(|id| !s.snapshot.sessions.contains_key(id));
        s.snapshot = snapshot;
        sidebar::pagination::receive(s);
        for (id, thread) in &s.menus.focus.loaded {
            Arc::make_mut(&mut s.snapshot)
                .sessions
                .entry(id.clone())
                .or_insert_with(|| thread.clone());
        }
        if new_focus_thread || (reconnected && s.prefs.focus) {
            sidebar::focus::load(s, false);
        }
        if first_projects {
            sidebar::initialize(s);
        }
        if reconnected && s.pages.route != pages::Route::Chat {
            s.open_page(s.pages.route.clone());
        }
        if reconnected {
            pages::invalidate(s, vec!["all".into()]);
        }
        changed = true;
        sidebar_changed = true;
        if let Some(directory) = s
            .project()
            .filter(|p| !s.snapshot.models.contains_key(&p.canonical))
            .map(|p| p.canonical.clone())
        {
            s.command(oc_gateway::Command::Details(directory));
        }
    }
    if sidebar_changed {
        sidebar::rebuild(s);
    }
    if changed {
        tx.instant();
    }
    composer::menus::prefetch(s);
    if composer::state::poll(s) {
        changed = true;
        tx.instant();
    }
    changed | sidebar::selection::poll(s, clock, tx) | menus::thread::poll(s, tx)
}
