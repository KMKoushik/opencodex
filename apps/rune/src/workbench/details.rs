use super::Panel;
use crate::{
    State, icons,
    sidebar::{icon_button, label},
};
use rune::{El, col, el, row};
use serde_json::Value;
impl State {
    pub fn toggle_session_details(&mut self) {
        self.chat.details = !self.chat.details;
        if !self.chat.details {
            return;
        }
        let Some(id) = self.selected.clone() else {
            return;
        };
        self.workspace_get("detail-session", format!("sessions/{id}"), vec![], false);
        for (tag, route) in [("vcs", "vcs"), ("mcp", "mcp"), ("skills", "skills")] {
            self.workspace_get(
                &format!("detail-{tag}"),
                format!("workspace/{route}"),
                vec![("directory".into(), self.workspace_directory())],
                false,
            );
        }
    }
}
pub fn view(s: &State, width: f32) -> El {
    let t = &s.theme;
    let pane_width = (width - 24.0).clamp(240.0, 360.0);
    let value = |name: &str| s.workbench.details.get(name).unwrap_or(&Value::Null);
    let latest = s
        .chat
        .data
        .messages
        .iter()
        .rev()
        .find(|m| m.r#type == "assistant");
    let tokens = latest.and_then(|m| m.fields.get("tokens"));
    let total = tokens.map(|v| {
        v["input"].as_u64().unwrap_or(0)
            + v["output"].as_u64().unwrap_or(0)
            + v["reasoning"].as_u64().unwrap_or(0)
            + v["cache"]["read"].as_u64().unwrap_or(0)
            + v["cache"]["write"].as_u64().unwrap_or(0)
    });
    let limit = s.model_info().and_then(|m| m.limit["context"].as_u64());
    let ratio = total
        .zip(limit)
        .filter(|(_, max)| *max > 0)
        .map(|(n, max)| n as f32 / max as f32);
    let mut popup = col()
        .key("session-details")
        .w(pane_width)
        .absolute((width - pane_width - 12.0).max(12.0), 8.0)
        .padding(12.0)
        .gap(10.0)
        .radius(12.0)
        .fill(t.c("elevated"))
        .border(1.0, t.c("border-heavy"))
        .child(
            row()
                .w_full()
                .center_y()
                .child(label(t, "Session", 12.0, 500.0, "text").grow(1.0))
                .child(
                    icon_button(t, &icons::CLOSE, "Close session details")
                        .on_press(|s: &mut State| s.chat.details = false),
                ),
        )
        .child(detail(
            s,
            "Context",
            &ratio
                .map(|v| format!("{:.1}%", v * 100.0))
                .unwrap_or_else(|| "—".into()),
        ))
        .child(
            row()
                .w_full()
                .h(4.0)
                .radius(2.0)
                .fill(t.c("border-heavy"))
                .child(
                    el().w((pane_width - 24.0) * ratio.unwrap_or(0.0).clamp(0.0, 1.0))
                        .h(4.0)
                        .radius(2.0)
                        .fill(t.c("success")),
                ),
        )
        .child(label(
            t,
            &total
                .zip(limit)
                .map(|(n, max)| format!("{n} / {max} tokens"))
                .unwrap_or_else(|| "Token usage unavailable".into()),
            12.0,
            400.0,
            "text-tertiary",
        ));
    if let Some(project) = s.project() {
        popup = popup
            .child(rule(s))
            .child(detail(s, "Project", project.display_name()));
    }
    let vcs = value("detail-vcs");
    popup = popup.child(detail(s, "Checkout", "Local checkout"));
    if let Some(branch) = vcs["info"]["branch"]["current"].as_str() {
        popup = popup.child(detail(s, "Branch", branch));
    }
    if let Some(files) = vcs["files"].as_array() {
        popup = popup.child(
            detail(s, "Changes", &format!("{} files", files.len()))
                .role("button")
                .focusable(true)
                .on_press(|s: &mut State| {
                    s.chat.details = false;
                    s.select_panel(Panel::Changes);
                }),
        );
    }
    let cost = value("detail-session")["cost"].as_f64();
    if let Some(cost) = cost.filter(|v| *v > 0.0) {
        popup = popup.child(detail(s, "Session cost", &format!("${cost:.4}")));
    }
    popup = popup.child(rule(s));
    for (name, key) in [("MCP", "detail-mcp"), ("Skills", "detail-skills")] {
        let count = value(key).as_array().map(Vec::len);
        popup = popup.child(detail(
            s,
            name,
            &count
                .map(|n| format!("{n} available"))
                .unwrap_or_else(|| "Loading…".into()),
        ));
    }
    popup
}
fn detail(s: &State, name: &str, value: &str) -> El {
    row()
        .w_full()
        .gap(10.0)
        .center_y()
        .child(label(&s.theme, name, 12.0, 400.0, "text-secondary").grow(1.0))
        .child(label(&s.theme, value, 12.0, 400.0, "text-secondary").truncate())
}
fn rule(s: &State) -> El {
    el().h(1.0).w_full().fill(s.theme.c("border"))
}
