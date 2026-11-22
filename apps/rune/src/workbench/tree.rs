//! Change explorer hierarchy, kept separate from lazily loaded all-files directories.
use crate::State;
use std::collections::BTreeMap;

pub fn rebuild(s: &mut State) {
    let query = s.workbench.search.text.trim().to_lowercase();
    let mut children: BTreeMap<String, BTreeMap<String, bool>> = BTreeMap::new();
    s.workbench.change_lookup.clear();
    for (index, value) in s.workbench.changes.iter().enumerate() {
        let Some(path) = value["path"].as_str() else {
            continue;
        };
        s.workbench.change_lookup.insert(path.into(), index);
        if !query.is_empty() && !path.to_lowercase().contains(&query) {
            continue;
        }
        let parts: Vec<_> = path.split('/').collect();
        let mut parent = String::new();
        for (n, part) in parts.iter().enumerate() {
            let path = if parent.is_empty() {
                (*part).to_owned()
            } else {
                format!("{parent}/{part}")
            };
            children
                .entry(parent)
                .or_default()
                .insert(path.clone(), n + 1 < parts.len());
            parent = path;
        }
    }
    fn walk(
        s: &State,
        children: &BTreeMap<String, BTreeMap<String, bool>>,
        parent: &str,
        depth: usize,
        rows: &mut Vec<(String, bool, usize)>,
    ) {
        if depth > 64 {
            return;
        }
        let Some(children_here) = children.get(parent) else {
            return;
        };
        let mut entries: Vec<_> = children_here.iter().collect();
        entries.sort_by_cached_key(|(p, dir)| (!**dir, p.to_lowercase()));
        for (path, dir) in entries {
            rows.push((path.clone(), *dir, depth));
            if *dir
                && (!s.workbench.collapsed_changes.contains(path)
                    || !s.workbench.search.text.trim().is_empty())
            {
                walk(s, children, path, depth + 1, rows);
            }
        }
    }
    let mut rows = Vec::new();
    walk(s, &children, "", 0, &mut rows);
    s.workbench.change_tree = rows;
}
pub fn collapse(s: &mut State) {
    if s.workbench.panel == super::Panel::Changes {
        s.workbench.collapsed_changes = s
            .workbench
            .change_tree
            .iter()
            .filter(|(_, dir, _)| *dir)
            .map(|(p, _, _)| p.clone())
            .collect();
        rebuild(s);
    } else {
        s.workbench.folders.clear();
        s.rebuild_workspace_tree();
    }
}
pub fn toggle(s: &mut State, path: &str, changes: bool) {
    if changes {
        if !s.workbench.collapsed_changes.remove(path) {
            s.workbench.collapsed_changes.insert(path.into());
        }
        rebuild(s);
    } else {
        if !s.workbench.folders.remove(path) {
            s.workbench.folders.insert(path.into());
            s.load_folder(path, false);
        }
        s.rebuild_workspace_tree();
    }
}
