//! Per-open-project pagination: local disclosure is immediate; remote disclosure
//! advances only on success and never changes the event-stream connection state.
use crate::State;
use std::collections::BTreeMap;

#[derive(Default)]
pub struct Pagination {
    pending: BTreeMap<String, (String, usize, u64)>,
    errors: BTreeMap<String, String>,
}
pub fn pending(s: &State, id: &str) -> bool {
    s.menus.sidebar_pages.pending.contains_key(id)
}
pub fn error<'a>(s: &'a State, id: &str) -> Option<&'a str> {
    s.menus
        .sidebar_pages
        .errors
        .get(id)
        .map(String::as_str)
        .or_else(|| {
            let project = super::projects(s).into_iter().find(|p| p.id == id)?;
            s.snapshot
                .project_errors
                .get(&project.canonical)
                .map(String::as_str)
        })
}
pub fn more(s: &mut State, id: &str) {
    if pending(s, id) {
        return;
    }
    let count = s.visible.get(id).copied().unwrap_or(4);
    if error(s, id).is_none() && s.menus.project_counts.get(id).copied().unwrap_or(0) > count {
        s.visible.insert(id.into(), count + 4);
    } else if let Some(project) = super::projects(s).into_iter().find(|p| p.id == id) {
        if !crate::menus::search::connected(s) {
            return;
        }
        let directory = project.canonical.clone();
        let revision = s.snapshot.page_results.get(&directory).map_or(0, |v| v.0);
        let retry = s.snapshot.project_errors.contains_key(&directory);
        let result = s
            .worker
            .as_ref()
            .ok_or_else(|| "Gateway is not connected".to_owned())
            .and_then(|worker| {
                worker.command(if retry {
                    oc_gateway::Command::RetryProject(directory.clone())
                } else {
                    oc_gateway::Command::More(directory.clone())
                })
            });
        match result {
            Ok(()) => {
                s.menus.sidebar_pages.errors.remove(id);
                s.menus
                    .sidebar_pages
                    .pending
                    .insert(id.into(), (directory, count + 4, revision));
            }
            Err(error) => {
                s.menus.sidebar_pages.errors.insert(id.into(), error);
            }
        }
    }
    super::rebuild(s);
}
pub fn receive(s: &mut State) {
    let pending = std::mem::take(&mut s.menus.sidebar_pages.pending);
    for (id, (directory, count, revision)) in pending {
        if !super::projects(s).iter().any(|p| p.id == id) {
            continue;
        }
        if let Some((current, error)) = s
            .snapshot
            .page_results
            .get(&directory)
            .filter(|v| v.0 != revision)
        {
            let _ = current;
            if let Some(error) = error {
                s.menus.sidebar_pages.errors.insert(id, error.clone());
            } else {
                s.visible.insert(id.clone(), count);
                s.menus.sidebar_pages.errors.remove(&id);
            }
        } else if !s.snapshot.live {
            s.menus
                .sidebar_pages
                .errors
                .insert(id, "Live updates interrupted. Try again.".into());
        } else {
            s.menus
                .sidebar_pages
                .pending
                .insert(id, (directory, count, revision));
        }
    }
    let ids: Vec<_> = super::projects(s).iter().map(|p| p.id.clone()).collect();
    s.menus
        .sidebar_pages
        .errors
        .retain(|id, _| ids.contains(id));
}
pub fn sync(s: &mut State) {
    let directories = if s.prefs.focus {
        Default::default()
    } else {
        super::projects(s)
            .into_iter()
            .filter(|p| !s.folded.contains(&p.id))
            .map(|p| p.canonical.clone())
            .collect()
    };
    if s.menus.sidebar_scopes.as_ref() == Some(&directories) {
        return;
    }
    if let Some(worker) = &s.worker {
        if worker
            .command(oc_gateway::Command::ProjectLists(directories.clone()))
            .is_ok()
        {
            s.menus.sidebar_scopes = Some(directories);
        }
    }
}
