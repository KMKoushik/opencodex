use crate::{
    State,
    pages::{self, data},
    sidebar::label,
};
use rune::{El, col, el, row};

pub fn settings(s: &State) -> El {
    let state = data(s, "host/update");
    let status = state.and_then(|v| v["status"].as_str()).unwrap_or("");
    let version = state.and_then(|v| v["version"].as_str()).unwrap_or("");
    let description = state
        .and_then(|v| v["disabledReason"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| {
            state
                .map(|v| {
                    format!(
                        "{}Installed v{}. Updates download only when you choose.",
                        if status == "up-to-date" {
                            "You’re up to date. "
                        } else {
                            ""
                        },
                        v["currentVersion"].as_str().unwrap_or("")
                    )
                })
                .unwrap_or("Reading update status…".into())
        });
    let title = match status {
        "available" => format!("Update to v{version}"),
        "downloading" => format!(
            "Downloading… {}%",
            state.unwrap()["percent"].as_u64().unwrap_or(0)
        ),
        "ready" => "Restart to update".into(),
        "installing" => "Preparing restart…".into(),
        "checking" => "Checking…".into(),
        _ => "Check for updates".into(),
    };
    let action = if status == "available" {
        "download"
    } else if status == "ready" {
        "install"
    } else {
        "check"
    };
    let mut controls = col().gap(8.0).child(
        row()
            .gap(12.0)
            .center_y()
            .child(
                pages::button(s, &title)
                    .disabled(matches!(
                        status,
                        "" | "disabled" | "checking" | "downloading" | "installing"
                    ))
                    .on_press_tx(move |s: &mut State, tx| {
                        if action == "install" {
                            s.pages.update_confirming = true;
                            tx.focus_when_shown("update-cancel", false);
                        } else {
                            super::command(action);
                        }
                    }),
            )
            .child(
                label(&s.theme, "Release notes", 13.0, 400.0, "link")
                    .role("link")
                    .focusable(true)
                    .on_press(|_: &mut State| {
                        std::thread::spawn(|| {
                            let _ = std::process::Command::new("/usr/bin/open")
                                .arg("https://github.com/KMKoushik/opencodex/releases")
                                .status();
                        });
                    }),
            ),
    );
    if let Some(error) = state.and_then(|v| v["error"].as_str()) {
        controls = controls.child(
            label(&s.theme, error, 12.0, 400.0, "error")
                .wrap()
                .role("alert"),
        );
    }
    crate::settings::group(s, "OpenCodex")
        .child(crate::settings::setting_row(s, "Updates", &description).child(controls))
}
fn close(s: &mut State) {
    s.pages.update_confirming = false;
}
pub fn dialog(s: &State) -> Option<El> {
    if !s.pages.update_confirming {
        return None;
    }
    let version = data(s, "host/update")
        .and_then(|v| v["version"].as_str())
        .unwrap_or("");
    let panel = col().w(440.0f32.min(s.window_size.0 - 32.0)).padding(20.0).gap(20.0).radius(14.0)
        .fill(s.theme.c("elevated")).border(1.0, s.theme.c("border-heavy"))
        .child(label(&s.theme, "Restart to update?", 16.0, 600.0, "text"))
        .child(label(&s.theme, format!("OpenCodex will restart to install v{version}. Save your files and send any drafts first; unsaved changes will be lost. OpenCode and running agents will keep running."), 13.0, 400.0, "text-secondary").w_full().wrap())
        .child(row().w_full().gap(8.0).justify_end()
            .child(pages::button(s, "Not now").key("update-cancel").on_press(close))
            .child(pages::primary_button(s, "Restart and update").on_press(|s: &mut State| { close(s); super::command("install"); })));
    Some(
        el().absolute(0.0, 0.0)
            .size(s.window_size.0, s.window_size.1)
            .center()
            .fill(s.theme.c("scrim"))
            .modal(true, close)
            .child(s.theme.shadow(panel, "shadow")),
    )
}
