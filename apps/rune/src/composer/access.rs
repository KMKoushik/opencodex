use crate::{State, sidebar::label};
use rune::{El, col, el, row};
use serde_json::json;
pub fn change(s: &mut State, full: bool) {
    if s.composer.access_pending {
        return;
    }
    if let Some(id) = s.selected.clone() {
        if s.prompt_request(oc_gateway::prompt::Request::Mutate {
            tag: format!("access-{full}:{id}"),
            path: format!("sessions/{id}/access"),
            body: json!({"mode":if full {"full"} else {"default"}}),
            delete: false,
        }) {
            s.composer.access_pending = true;
        }
    } else {
        s.draft_mut().full_access = full;
        s.touch_draft();
        s.composer.menu = None;
    }
}
pub fn view(s: &State) -> El {
    let t = &s.theme;
    let button = |text: &str| {
        label(t, text, 13.0, 500.0, "text")
            .px(14.0)
            .py(8.0)
            .radius(8.0)
            .hover(t.c("hover"))
            .role("button")
            .label(text)
            .focusable(true)
    };
    t.shadow(col().key("full-access-confirm").w(480.0).padding(24.0).gap(16.0).radius(14.0).fill(t.c("elevated")).border(1.0,t.c("border-heavy"))
        .child(label(t,"Enable full access?",18.0,600.0,"text"))
        .child(label(t,"This agent can read and change files outside the project and run commands without approval, including destructive commands and access to secrets. Only enable this for work you trust.",13.0,400.0,"text-secondary").wrap())
        .child(label(t,"Applies to this thread and new subagents. Existing subagents keep their own permissions. Pending approvals in this thread will be allowed. Your global OpenCode settings stay unchanged; server policies still apply.",13.0,400.0,"text-secondary").wrap())
        .child(row().w_full().gap(8.0).child(el().grow(1.0))
            .child(button("Cancel").autofocus().on_press(|s:&mut State|{if !s.composer.access_pending {s.composer.menu=None;}}))
            .child(t.paint(button(if s.composer.access_pending {"Enabling…"} else {"Enable full access"}),"chip").on_press(|s:&mut State|change(s,true))))
        .absolute((s.window_size.0-480.0)/2.0,(s.window_size.1-300.0)/2.0)
        .modal(true,|s:&mut State|{if !s.composer.access_pending {s.composer.menu=None;}}),"shadow")
}
