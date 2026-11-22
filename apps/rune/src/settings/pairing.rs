//! One-time device pairing modal. No public listener/tunnel is created here.
use crate::{
    State,
    pages::{self, data},
    sidebar::label,
};
use rune::{El, col, el, row};
use serde_json::json;

pub fn open(s: &mut State) {
    s.pages.remote.pair_focus = true;
    s.pages.remote.pairing_at = Some(chrono::Utc::now().timestamp_millis());
    create(s);
}
/// Screenshot preflight runs the same real operation before virtual-clock
/// rendering. Curl runs only on this headless capture worker, never in a frame.
pub fn capture(s: &mut State) {
    let Some(base) = crate::OPTIONS.get().and_then(|o| o.gateway.clone()) else {
        return;
    };
    s.pages.remote.pairing_at = Some(chrono::Utc::now().timestamp_millis());
    let result = std::thread::spawn(move || {
        let output = std::process::Command::new("/usr/bin/curl")
            .args([
                "--fail-with-body",
                "--silent",
                "--max-time",
                "15",
                "-H",
                "Content-Type: application/json",
                "-d",
                "{}",
                &format!("{}/api/remote/codes", base.trim_end_matches('/')),
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(serde_json::from_slice::<serde_json::Value>(&output.stdout)
                .ok()
                .and_then(|v| v["message"].as_str().map(str::to_owned))
                .unwrap_or_else(|| String::from_utf8_lossy(&output.stdout).to_string()));
        }
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
    })
    .join()
    .unwrap_or_else(|_| Err("Pairing capture worker failed".into()));
    pages::receive(s, "page:remote/codes", result);
}
fn create(s: &mut State) {
    s.pages.remote.pair = None;
    s.pages.data.remove("remote/codes");
    if s.prompt_request(oc_gateway::prompt::Request::Mutate {
        tag: "page:remote/codes".into(),
        path: "remote/codes".into(),
        body: json!({}),
        delete: false,
    }) {
        s.pages.pending.insert("remote/codes".into());
    } else {
        s.pages.data.insert(
            "remote/codes".into(),
            Err(s
                .error
                .clone()
                .unwrap_or_else(|| "Gateway is not connected".into())),
        );
    }
}
fn close(s: &mut State) {
    s.pages.remote.pairing_at = None;
    s.pages.remote.pair = None;
    s.pages.remote.qr.clear();
}
fn dismiss(s: &mut State, tx: &mut rune::Tx) {
    close(s);
    tx.return_focus("page-action-Add device", false);
}
pub fn paired(s: &State) -> Option<&str> {
    let started = s.pages.remote.pairing_at?;
    data(s, "remote")?["devices"]
        .as_array()?
        .iter()
        .find(|d| d["created"].as_i64().is_some_and(|time| time >= started))?["name"]
        .as_str()
}
pub fn dialog(s: &State) -> Option<El> {
    s.pages.remote.pairing_at?;
    let hostname = data(s, "remote")
        .and_then(|v| v["hostname"].as_str())
        .unwrap_or("");
    let mut content = col().w_full().center_y().gap(12.0).role("status");
    let note = |text: &str| {
        label(&s.theme, text, 13.0, 400.0, "text-secondary")
            .w_full()
            .align(rune::Align::Center)
            .wrap()
    };
    if let Some(name) = paired(s) {
        content = content
            .child(label(
                &s.theme,
                &format!("{name} is paired."),
                13.0,
                500.0,
                "text",
            ))
            .child(pages::primary_button(s, "Done").on_press_tx(dismiss));
    } else if let Some(Err(error)) = s.pages.data.get("remote/codes") {
        content = content.child(label(&s.theme, error, 13.0, 400.0, "error").wrap());
    } else if let Some(pair) = &s.pages.remote.pair {
        let left = ((pair["expires"].as_i64().unwrap_or(0)
            - chrono::Utc::now().timestamp_millis())
            / 1000)
            .max(0);
        if left > 0 {
            let mut qr = el()
                .size(216.0, 216.0)
                .radius(8.0)
                .fill(s.theme.c("scan-light"))
                .role("img")
                .label("Pairing QR code");
            let scale = 216.0 / s.pages.remote.qr_size.max(1) as f32;
            for &(x, y, width) in &s.pages.remote.qr {
                qr = qr.child(
                    el().absolute(x as f32 * scale, y as f32 * scale)
                        .size(width as f32 * scale, scale)
                        .fill(s.theme.c("scan-dark")),
                );
            }
            let instructions =
                format!("Scan with the device’s camera, or open {hostname} on it and enter:");
            let start = instructions.find(hostname).unwrap_or(0);
            content = content
                .child(qr)
                .child(note(&instructions).spans(vec![
                        rune::Span::new(start, start + hostname.len())
                            .weight(500.0)
                            .color(s.theme.c("text")),
                    ]))
                .child(
                    label(
                        &s.theme,
                        pair["code"].as_str().unwrap_or(""),
                        20.0,
                        400.0,
                        "text",
                    )
                    .font(rune::TextStyle::new(20.0, 400.0).mono().tracking(1.6))
                    .selectable(true),
                )
                .child(note(&format!(
                    "Works once. Expires in {}:{:02}.",
                    left / 60,
                    left % 60
                )));
        } else {
            content = content.child(note("This code expired.")).child(
                pages::primary_button(s, "New code")
                    .disabled(s.pages.pending.contains("remote/codes"))
                    .on_press(|s: &mut State| create(s)),
            );
        }
    } else {
        content = content.child(note("Making a code…"));
    }
    let header = row()
        .w_full()
        .center_y()
        .h(28.0)
        .mb(20.0)
        .child(label(&s.theme, "Add a device", 16.0, 600.0, "text").grow(1.0))
        .child(
            crate::sidebar::icon_button(&s.theme, &crate::icons::CLOSE, "Close add a device")
                .key("pair-dialog-close")
                .on_press_tx(dismiss),
        );
    let panel = col()
        .on_layout_tx(|s: &mut State, _, tx| {
            if s.pages.remote.pair_focus {
                s.pages.remote.pair_focus = false;
                tx.focus_when_shown("pair-dialog-close", false);
            } else {
                tx.live_only();
            }
        })
        .w(440.0_f32.min(s.window_size.0 - 32.0))
        .padding(20.0)
        .radius(14.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .border_layout()
        .child(header)
        .child(content);
    Some(
        el().absolute(0.0, 0.0)
            .size(s.window_size.0, s.window_size.1)
            .center()
            .modal_tx(true, dismiss)
            .child(
                el().absolute(0.0, 0.0)
                    .size(s.window_size.0, s.window_size.1)
                    .fill(s.theme.c("scrim"))
                    .on_press_tx(dismiss),
            )
            .child(s.theme.shadow(panel, "shadow")),
    )
}
