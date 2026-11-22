use crate::{State, sidebar::label};
use rune::{El, col, el, row};
use serde_json::json;
pub fn change(s: &mut State, full: bool) {
    if s.composer.access_pending {
        return;
    }
    s.composer.access_error = None;
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
            .disabled(s.composer.access_pending)
            .opacity(if s.composer.access_pending { 0.45 } else { 1.0 })
    };
    let dialog = t.shadow(col().key("full-access-confirm").w((s.window_size.0-32.0).min(440.0)).padding(20.0).radius(14.0).fill(t.c("elevated")).border(1.0,t.c("border-heavy"))
        .child(row().w_full().center_y().justify_between().mb(20.0).child(label(t,"Enable full access?",16.0,600.0,"text"))
            .child(crate::sidebar::icon_button_size(t,&crate::icons::CLOSE,"Close enable full access?",16.0).disabled(s.composer.access_pending).opacity(if s.composer.access_pending {0.45} else {1.0}).on_press(|s: &mut State| { if !s.composer.access_pending {s.composer.menu=None;} })))
        .child(label(t,"This agent can read and change files outside the project and run commands without approval, including destructive commands and access to secrets. Only enable this for work you trust.",12.0,400.0,"text-tertiary").wrap())
        .child(label(t,"Applies to this thread and new subagents. Existing subagents keep their own permissions. Pending approvals in this thread will be allowed. Your global OpenCode settings stay unchanged; server policies still apply.",12.0,400.0,"text-tertiary").wrap())
        .children(s.composer.access_error.as_ref().map(|e| label(t,e,14.0,400.0,"error").wrap()))
        .child(row().w_full().gap(8.0).child(el().grow(1.0))
            .child(t.paint(button("Cancel").autofocus(),"chip").on_press(|s:&mut State|{if !s.composer.access_pending {s.composer.menu=None;}}))
            .child(t.paint(button(if s.composer.access_pending {"Enabling…"} else {"Enable full access"}).key("access-enable").color(t.c("on-primary")),"primary-glaze").on_press(|s:&mut State|change(s,true))))
        .modal(true,|s:&mut State|{if !s.composer.access_pending {s.composer.menu=None;}}),"shadow");
    el().absolute(0.0, 0.0)
        .size(s.window_size.0, s.window_size.1)
        .fill(t.c("scrim"))
        .center()
        .child(dialog)
}
