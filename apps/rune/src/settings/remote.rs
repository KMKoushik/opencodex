use crate::{
    State,
    pages::{self, button, data},
    sidebar::label,
};
use rune::{El, TextEdit, TextStyle, row, text_input};
use serde_json::{Value, json};
#[derive(Default)]
pub struct Remote {
    pub hostname: TextEdit,
    pub port: TextEdit,
    pub token: TextEdit,
    pub external: bool,
    pub dirty: bool,
    pub edits: std::collections::BTreeSet<&'static str>,
    pub pair: Option<Value>,
    pub qr: Vec<(usize, usize, usize)>,
    pub qr_size: usize,
    pub pairing_at: Option<i64>,
    pub next_poll: f64,
    pub minute: i64,
    pub next_usage: f64,
    pub clock_second: i64,
    pub pair_focus: bool,
}
/// Visible-page network cadence and countdown updates, never an idle redraw loop.
pub fn poll(s: &mut State, clock: f64, tx: &mut rune::Tx) {
    if s.pages.route == pages::Route::Settings("usage".into()) {
        s.pages.remote.minute = chrono::Utc::now().timestamp() / 60;
        if s.composer.worker.is_some() && s.snapshot.live && clock >= s.pages.remote.next_usage {
            s.pages.remote.next_usage = clock + 300.0;
            s.page_get("usage/limits");
        }
        tx.wake_after(std::time::Duration::from_secs(60));
    }
    if s.pages.route != pages::Route::Settings("remote".into()) {
        return;
    }
    let pairing = s.pages.remote.pairing_at.is_some();
    let value = data(s, "remote");
    let enabled = value.is_some_and(|v| v["enabled"] == true);
    if (pairing || enabled) && s.composer.worker.is_some() {
        let interval = if pairing
            || value.is_some_and(|v| {
                v["tunnel"] != "external" && v["connector"]["state"] != "connected"
            }) {
            2.0
        } else {
            10.0
        };
        if s.composer.worker.is_some() && clock >= s.pages.remote.next_poll {
            s.pages.remote.next_poll = clock + interval;
            s.page_get("remote");
        }
        tx.wake_after(std::time::Duration::from_secs_f64(
            (s.pages.remote.next_poll - clock).max(0.05),
        ));
    }
    if pairing
        && super::pairing::paired(s).is_none()
        && s.pages.remote.pair.as_ref().is_some_and(|v| {
            v["expires"].as_i64().unwrap_or(0) > s.pages.remote.clock_second * 1000
        })
    {
        s.pages.remote.clock_second = chrono::Utc::now().timestamp();
        if s.pages.remote.pair.as_ref().is_some_and(|v| {
            v["expires"].as_i64().unwrap_or(0) > chrono::Utc::now().timestamp_millis()
        }) {
            tx.wake_after(std::time::Duration::from_secs(1));
        }
    }
}
pub fn receive(s: &mut State, path: &str, value: &Value) {
    if path == "remote" {
        if !s.pages.remote.dirty {
            s.pages.remote.edits.clear();
        }
        if !s.pages.remote.edits.contains("hostname") {
            let hostname = value["hostname"].as_str().unwrap_or("");
            if s.pages.remote.hostname.text != hostname {
                s.pages.remote.hostname.replace_text(hostname);
            }
        }
        if !s.pages.remote.edits.contains("port") {
            let port = value["port"].as_u64().unwrap_or(4317).to_string();
            if s.pages.remote.port.text != port {
                s.pages.remote.port.replace_text(port);
            }
        }
        if !s.pages.remote.edits.contains("tunnel") {
            s.pages.remote.external = value["tunnel"] == "external";
        }
        if !s.pages.remote.edits.contains("token") {
            s.pages.remote.token.clear();
        }
    }
    if path == "remote/codes" {
        s.pages.remote.qr.clear();
        if let Some(url) = value["url"].as_str() {
            if let Some((size, code)) = super::qr::modules(url) {
                s.pages.remote.qr_size = size + 4;
                for y in 0..size {
                    let mut x = 0;
                    while x < size {
                        if code[y * size + x] {
                            let start = x;
                            while x < size && code[y * size + x] {
                                x += 1;
                            }
                            s.pages.remote.qr.push((start + 2, y + 2, x - start));
                        } else {
                            x += 1;
                        }
                    }
                }
            }
        }
        s.pages.remote.pair = Some(value.clone());
    }
}
pub fn view(s: &State, mut body: El) -> El {
    if data(s, "remote").is_none() {
        let error = s.pages.data.get("remote").and_then(|v| v.as_ref().err());
        let message = error.map(String::as_str).unwrap_or("Checking…");
        return body.child(
            super::group(s, "Remote access").child(super::setting_row_styled(
                s,
                "Status",
                message,
                vec![
                    rune::Span::new(0, message.len()).color(s.theme.c(if error.is_some() {
                        "error"
                    } else {
                        "text-secondary"
                    })),
                ],
            )),
        );
    }
    let enabled = data(s, "remote").is_some_and(|v| v["enabled"] == true);
    let value = data(s, "remote").unwrap();
    let status = describe(value);
    let busy = s.pages.pending.contains("remote");
    let mut group = super::group_action(
        s,
        "Remote access",
        Some(
            (if enabled {
                button(s, "Turn off")
            } else {
                pages::primary_button(s, "Turn on").h(28.0).px(10.0)
            })
            .disabled(busy)
            .on_press(move |s: &mut State| save(s, !enabled)),
        ),
    )
    .child(super::setting_row_styled(
        s,
        "Status",
        &status,
        vec![rune::Span::new(0, status.len()).color(s.theme.c(tone(value)))],
    ));
    for (key, title, description) in [
        (
            "hostname",
            "Hostname",
            "The public address your Cloudflare tunnel serves.".to_owned(),
        ),
        (
            "tunnel",
            "Tunnel",
            if s.pages.remote.external {
                "You run cloudflared yourself."
            } else {
                "OpenCodex runs cloudflared while the app is open."
            }
            .to_owned(),
        ),
        (
            "token",
            "Tunnel token",
            format!(
                "In Cloudflare Zero Trust, give your tunnel a public hostname whose service is http://127.0.0.1:{}, then copy its token. For a tunnel made with the CLI, run cloudflared tunnel token NAME.",
                s.pages.remote.port.text
            ),
        ),
        (
            "port",
            "Port",
            if s.pages.remote.external {
                format!(
                    "Point your tunnel’s service at http://127.0.0.1:{}.",
                    s.pages.remote.port.text
                )
            } else {
                "Remote requests arrive on this local port.".into()
            },
        ),
    ] {
        if key == "token" && s.pages.remote.external {
            continue;
        }
        if key == "tunnel" {
            let choices = super::controls::segment(
                s,
                "Tunnel",
                if s.pages.remote.external {
                    "external"
                } else {
                    "token"
                },
                &[("token", "Token"), ("external", "My own")],
                |s, value| {
                    s.pages.remote.external = value == "external";
                    s.pages.remote.dirty = true;
                    s.pages.remote.edits.insert("tunnel");
                },
            );
            group = group.child(super::setting_row(s, title, &description).child(choices));
            continue;
        }
        let edit = match key {
            "hostname" => &s.pages.remote.hostname,
            "port" => &s.pages.remote.port,
            _ => &s.pages.remote.token,
        };
        let input = text_input(edit, TextStyle::new(13.0, 400.0))
            .transition(rune::Transition::none())
            .key(format!("remote-{key}"))
            .label(title)
            .on_edit(move |s: &mut State| match key {
                "hostname" => &mut s.pages.remote.hostname,
                "port" => &mut s.pages.remote.port,
                _ => &mut s.pages.remote.token,
            })
            .single_line()
            .on_input_key(move |s: &mut State, event, _| {
                if key != "port" {
                    return false;
                }
                match &event.key {
                    rune::Key::Up | rune::Key::Down => {
                        let current = s
                            .pages
                            .remote
                            .port
                            .text
                            .parse::<f64>()
                            .ok()
                            .filter(|v| v.is_finite())
                            .unwrap_or(1023.0);
                        let next = if event.key == rune::Key::Up {
                            current.floor() + 1.0
                        } else {
                            current.ceil() - 1.0
                        };
                        s.pages
                            .remote
                            .port
                            .replace_text(format!("{:.0}", next.clamp(1024.0, 65535.0)));
                        s.pages.remote.dirty = true;
                        s.pages.remote.edits.insert("port");
                        true
                    }
                    rune::Key::Text(value) if !event.mods.cmd && !event.mods.ctrl => value
                        .chars()
                        .any(|c| !c.is_ascii_digit() && !".eE+-".contains(c)),
                    _ => false,
                }
            })
            .on_input_change(move |s: &mut State, _| {
                s.pages.remote.dirty = true;
                s.pages.remote.edits.insert(key);
            })
            .placeholder(
                if key == "hostname" {
                    "opencodex.example.com"
                } else if key == "token" {
                    if value["tokenSet"] == true {
                        "Saved"
                    } else {
                        "Paste the token"
                    }
                } else {
                    ""
                },
                s.theme.c("text-tertiary"),
            )
            .w(if key == "port" { 96.0 } else { 240.0 })
            .h(32.0)
            .px(10.0)
            .color(s.theme.c("text"))
            .fill(s.theme.c("control"))
            .border(1.0, s.theme.c("border-heavy"))
            .border_layout()
            .radius(8.0);
        let spans = [
            format!("http://127.0.0.1:{}", s.pages.remote.port.text),
            "cloudflared tunnel token NAME".into(),
        ]
        .into_iter()
        .filter_map(|code| {
            description.find(&code).map(|start| {
                rune::Span::new(start, start + code.len())
                    .mono()
                    .color(s.theme.c("text-tertiary"))
            })
        })
        .collect();
        group = group.child(
            super::setting_row_styled(s, title, &description, spans).child(if key == "token" {
                input.secure()
            } else {
                input
            }),
        );
    }
    if s.pages.remote.dirty || s.pages.errors.contains_key("remote") {
        let mut actions = row()
            .w_full()
            .min_h(52.0)
            .px(16.0)
            .py(10.0)
            .gap(8.0)
            .center_y()
            .border_sides([1.0, 0.0, 0.0, 0.0], s.theme.c("border"))
            .border_layout()
            .child(
                label(
                    &s.theme,
                    s.pages
                        .errors
                        .get("remote")
                        .map(String::as_str)
                        .unwrap_or(""),
                    13.0,
                    400.0,
                    "error",
                )
                .grow(1.0)
                .min_w(0.0)
                .wrap()
                .role("alert"),
            );
        if s.pages.remote.dirty {
            actions = actions
                .child(
                    pages::controls::ghost(s, "Cancel")
                        .disabled(busy)
                        .dim(if busy { 0.5 } else { 1.0 })
                        .on_press(|s: &mut State| {
                            s.pages.remote.dirty = false;
                            s.pages.errors.remove("remote");
                            if let Some(value) = data(s, "remote").cloned() {
                                receive(s, "remote", &value);
                            }
                        }),
                )
                .child(
                    pages::primary_small_button(s, if busy { "Saving…" } else { "Save" })
                        .disabled(busy)
                        .dim(if busy { 0.5 } else { 1.0 })
                        .on_press(move |s: &mut State| save(s, enabled)),
                );
        }
        group = group.child(actions);
    }
    body = body.child(group);
    let ready = enabled
        && value["listener"]["state"] == "listening"
        && value["hostname"].as_str().is_some_and(|h| !h.is_empty())
        && value["served"] == true;
    let mut devices = super::group_action(
        s,
        "Devices",
        Some(
            button(s, "Add device")
                .disabled(!ready)
                .dim(if ready { 1.0 } else { 0.5 })
                .on_press(|s: &mut State| {
                    super::pairing::open(s);
                }),
        ),
    );
    if value["devices"].as_array().is_none_or(Vec::is_empty) {
        devices = devices.child(super::setting_row(
            s,
            "No devices",
            "Paired phones and computers appear here. Revoking one signs it out at once.",
        ));
    }
    for device in data(s, "remote")
        .and_then(|v| v["devices"].as_array())
        .into_iter()
        .flatten()
    {
        let id = device["id"].as_str().unwrap_or("").to_owned();
        devices = devices.child(
            super::setting_row(
                s,
                device["name"].as_str().unwrap_or("Device"),
                &device_date(device),
            )
            .child(
                pages::controls::ghost(s, "Revoke")
                    .disabled(s.pages.pending.contains("remote/revoke"))
                    .dim(if s.pages.pending.contains("remote/revoke") {
                        0.5
                    } else {
                        1.0
                    })
                    .on_press(move |s: &mut State| {
                        s.page_mutate(
                            &format!("remote/devices/{id}"),
                            Value::Null,
                            "remote/revoke",
                            true,
                        )
                    }),
            ),
        );
    }
    if let Some(error) = s.pages.errors.get("remote/revoke") {
        devices = devices.child(
            label(&s.theme, error, 13.0, 400.0, "error")
                .w_full()
                .min_h(52.0)
                .px(16.0)
                .py(10.0)
                .wrap()
                .role("alert"),
        );
    }
    body.child(devices)
}
fn save(s: &mut State, enabled: bool) {
    // React passes Number(input) through JSON; the gateway owns validation and
    // its actual message, including empty, fractional and out-of-range ports.
    let input = s.pages.remote.port.text.trim();
    let port = if input.is_empty() {
        json!(0)
    } else {
        input
            .parse::<f64>()
            .ok()
            .filter(|v| v.is_finite())
            .map(|v| json!(v))
            .unwrap_or(Value::Null)
    };
    let hostname = s.pages.remote.hostname.text.trim();
    let mut body = json!({"enabled":enabled,"hostname":if hostname.is_empty(){None}else{Some(hostname)},"port":port,"tunnel":if s.pages.remote.external{"external"}else{"token"}});
    if !s.pages.remote.token.text.trim().is_empty() {
        body["token"] = json!(s.pages.remote.token.text.trim());
    }
    s.page_write("remote", "PUT", body, "remote");
}
/// Presentation states for the screenshot-only delayed/error response fixture.
/// The ordinary route still reads actual remote status through the gateway.
pub fn capture(s: &mut State, page: &str) {
    match page {
        "settings-remote-dirty" | "settings-remote-saving" | "settings-remote-save-error" => {
            s.pages.remote.hostname = TextEdit::new("edited.example.test");
            s.pages.remote.dirty = true;
            if page.ends_with("saving") {
                s.pages.pending.insert("remote".into());
            }
        }
        "settings-remote-revoking" => {
            s.pages.pending.insert("remote/revoke".into());
        }
        "settings-remote-pair-loading" => {
            s.pages.remote.pairing_at = Some(chrono::Utc::now().timestamp_millis());
            s.pages.pending.insert("remote/codes".into());
        }
        _ => {}
    }
    let (method, path, key) = match page {
        "settings-remote-save-error" => ("PUT", "remote", "remote"),
        "settings-remote-revoke-error" => ("DELETE", "remote/devices/fixture-old", "remote/revoke"),
        _ => return,
    };
    let Some(base) = crate::OPTIONS.get().and_then(|o| o.gateway.clone()) else {
        return;
    };
    let error = std::thread::spawn(move || {
        let output = std::process::Command::new("/usr/bin/curl")
            .args([
                "--silent",
                "--max-time",
                "10",
                "-X",
                method,
                "-H",
                "Content-Type: application/json",
                "-d",
                r#"{"enabled":false,"hostname":null,"port":4517,"tunnel":"external"}"#,
                &format!("{base}/api/{path}"),
            ])
            .output()
            .ok()?;
        let value: Value = serde_json::from_slice(&output.stdout).ok()?;
        value["message"].as_str().map(str::to_owned)
    })
    .join()
    .ok()
    .flatten();
    if let Some(error) = error {
        s.pages.errors.insert(key.into(), error);
    }
}
fn tone(value: &Value) -> &'static str {
    if value["enabled"] != true {
        return "text-secondary";
    }
    if value["listener"]["state"] == "failed" {
        return "error";
    }
    if value["listener"]["state"] != "listening" {
        return "text-secondary";
    }
    if value["served"] != true {
        return "error";
    }
    if value["tunnel"] == "external" {
        return "text-secondary";
    }
    match value["connector"]["state"].as_str() {
        Some("connected") => "success",
        Some("missing" | "failed") => "error",
        _ => "text-secondary",
    }
}
fn device_date(device: &Value) -> String {
    let created = device["created"]
        .as_i64()
        .and_then(chrono::DateTime::from_timestamp_millis)
        .map(|d| d.with_timezone(&chrono::Local).format("%b %-d").to_string())
        .unwrap_or_default();
    let mut text = format!("Paired {created}");
    if let Some(seen) = device["seen"].as_i64().filter(|v| *v != 0) {
        let seconds = ((seen - chrono::Utc::now().timestamp_millis()) as f64 / 1000.0).round();
        let mut ago = "just now".to_owned();
        for (unit, size) in [("day", 86400.0), ("hr", 3600.0), ("min", 60.0)] {
            if seconds.abs() >= size {
                let n = (seconds / size).round() as i64;
                ago = if unit == "day" && n == -1 {
                    "yesterday".into()
                } else if unit == "day" && n == 1 {
                    "tomorrow".into()
                } else if n < 0 {
                    format!(
                        "{} {unit}{} ago",
                        -n,
                        if unit == "day" && n != -1 { "s" } else { "" }
                    )
                } else {
                    format!(
                        "in {n} {unit}{}",
                        if unit == "day" && n != 1 { "s" } else { "" }
                    )
                };
                break;
            }
        }
        text.push_str(&format!(" · Active {ago}"));
    }
    text
}
fn describe(value: &Value) -> String {
    if value["enabled"] != true {
        return "Off. Only this computer can use OpenCodex.".into();
    }
    let listener = &value["listener"];
    if listener["state"] == "failed" {
        return listener["message"]
            .as_str()
            .unwrap_or("Remote access couldn’t start.")
            .into();
    }
    if listener["state"] != "listening" {
        return "Starting…".into();
    }
    if value["served"] != true {
        return "This development gateway serves only the API, so remote devices can’t load the app. Use a built OpenCodex to add devices.".into();
    }
    let hostname = value["hostname"].as_str().unwrap_or("");
    if value["tunnel"] == "external" {
        return format!("Listening on 127.0.0.1:{} for {hostname}.", value["port"]);
    }
    let connector = &value["connector"];
    if connector["state"] == "connected" {
        return format!("Connected to Cloudflare at {hostname}.");
    }
    if connector["state"] == "missing" || connector["state"] == "failed" {
        return connector["message"]
            .as_str()
            .unwrap_or("cloudflared stopped.")
            .into();
    }
    match connector["message"].as_str() {
        Some(message) => format!("Connecting to Cloudflare… {message}"),
        None => "Connecting to Cloudflare…".into(),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn status_matrix_follows_listener_before_connector_and_never_enables_a_tunnel() {
        let mut v = json!({"enabled":false,"hostname":"remote.example.test","port":4317,"served":true,"tunnel":"token","listener":{"state":"listening"},"connector":{"state":"connected"}});
        assert_eq!(describe(&v), "Off. Only this computer can use OpenCodex.");
        v["enabled"] = json!(true);
        assert_eq!(tone(&v), "success");
        for state in ["missing", "failed"] {
            v["connector"] = json!({"state":state,"message":"Connector error"});
            assert_eq!(describe(&v), "Connector error");
            assert_eq!(tone(&v), "error");
        }
        v["connector"] = json!({"state":"connecting","message":"Retrying"});
        assert_eq!(describe(&v), "Connecting to Cloudflare… Retrying");
        v["tunnel"] = json!("external");
        assert_eq!(
            describe(&v),
            "Listening on 127.0.0.1:4317 for remote.example.test."
        );
        assert_eq!(tone(&v), "text-secondary");
        v["served"] = json!(false);
        assert_eq!(tone(&v), "error");
        assert!(describe(&v).starts_with("This development gateway"));
        v["listener"] = json!({"state":"starting"});
        assert_eq!(describe(&v), "Starting…");
        v["listener"] = json!({"state":"failed","message":"Listener error"});
        assert_eq!(describe(&v), "Listener error");
        assert_eq!(tone(&v), "error");
    }
}
