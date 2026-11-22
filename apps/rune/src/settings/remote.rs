use crate::{
    State,
    pages::{self, button, data},
    sidebar::label,
};
use rune::{El, TextEdit, TextStyle, col, el, row, text_input};
use serde_json::{Value, json};
#[derive(Default)]
pub struct Remote {
    pub hostname: TextEdit,
    pub port: TextEdit,
    pub token: TextEdit,
    pub external: bool,
    pub dirty: bool,
    pub pair: Option<Value>,
    pub qr: Vec<(usize, usize, usize)>,
    pub qr_size: usize,
}
pub fn receive(s: &mut State, path: &str, value: &Value) {
    if path == "remote" && !s.pages.remote.dirty {
        s.pages.remote.hostname = TextEdit::new(value["hostname"].as_str().unwrap_or(""));
        s.pages.remote.port = TextEdit::new(&value["port"].as_u64().unwrap_or(4317).to_string());
        s.pages.remote.external = value["tunnel"] == "external";
        s.pages.remote.token.clear();
    }
    if path == "remote/codes" {
        s.pages.remote.qr.clear();
        if let Some(url) = value["url"].as_str() {
            if let Ok(code) = qrcode::QrCode::new(url.as_bytes()) {
                let size = code.width();
                s.pages.remote.qr_size = size + 8;
                for y in 0..size {
                    let mut x = 0;
                    while x < size {
                        if code[(x, y)] == qrcode::Color::Dark {
                            let start = x;
                            while x < size && code[(x, y)] == qrcode::Color::Dark {
                                x += 1;
                            }
                            s.pages.remote.qr.push((start + 4, y + 4, x - start));
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
    if let Some(status) = pages::status(s, "remote") {
        return body.child(status);
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
    .child(super::setting_row(s, "Status", &status));
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
            let mut choices = row().gap(2.0).padding(2.0).radius(9.0);
            choices = s
                .theme
                .shadow(s.theme.paint(choices, "well"), "well-shadow");
            for (external, name) in [(false, "Token"), (true, "My own")] {
                let choice = el()
                    .role("radio")
                    .label(name)
                    .focusable(true)
                    .h(26.0)
                    .px(10.0)
                    .center()
                    .radius(7.0)
                    .child(label(&s.theme, name, 12.0, 500.0, "text-secondary"));
                let choice = if external == s.pages.remote.external {
                    s.theme
                        .shadow(s.theme.paint(choice, "glaze"), "glaze-shadow")
                } else {
                    choice
                };
                choices = choices.child(choice.on_press(move |s: &mut State| {
                    s.pages.remote.external = external;
                    s.pages.remote.dirty = true;
                }));
            }
            group = group.child(super::setting_row(s, title, &description).child(choices));
            continue;
        }
        let edit = match key {
            "hostname" => &s.pages.remote.hostname,
            "port" => &s.pages.remote.port,
            _ => &s.pages.remote.token,
        };
        let input = text_input(edit, TextStyle::new(13.0, 400.0))
            .key(format!("remote-{key}"))
            .on_edit(move |s: &mut State| match key {
                "hostname" => &mut s.pages.remote.hostname,
                "port" => &mut s.pages.remote.port,
                _ => &mut s.pages.remote.token,
            })
            .single_line()
            .on_input_change(|s: &mut State, _| s.pages.remote.dirty = true)
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
        group = group.child(
            row()
                .w_full()
                .padding(16.0)
                .gap(8.0)
                .child(
                    label(
                        &s.theme,
                        s.pages
                            .errors
                            .get("remote")
                            .map(String::as_str)
                            .unwrap_or(""),
                        12.0,
                        400.0,
                        "error",
                    )
                    .grow(1.0)
                    .wrap()
                    .role("alert"),
                )
                .child(
                    button(s, "Cancel")
                        .disabled(busy)
                        .on_press(|s: &mut State| {
                            s.pages.remote.dirty = false;
                            s.pages.errors.remove("remote");
                            if let Some(value) = data(s, "remote").cloned() {
                                receive(s, "remote", &value);
                            }
                        }),
                )
                .child(
                    button(s, if busy { "Saving…" } else { "Save" })
                        .disabled(busy)
                        .on_press(move |s: &mut State| save(s, enabled)),
                ),
        );
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
                .dim(if ready { 1.0 } else { 0.45 })
                .on_press(|s: &mut State| {
                    s.prompt_request(oc_gateway::prompt::Request::Mutate {
                        tag: "page:remote/codes".into(),
                        path: "remote/codes".into(),
                        body: json!({}),
                        delete: false,
                    });
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
            super::setting_row(s, device["name"].as_str().unwrap_or("Device"), "").child(
                button(s, "Revoke").on_press(move |s: &mut State| {
                    s.page_mutate(&format!("remote/devices/{id}"), Value::Null, "remote", true)
                }),
            ),
        );
    }
    body = body.child(devices);
    if let Some(pair) = &s.pages.remote.pair {
        let mut qr = el().size(224.0, 224.0).fill(rune::Color::WHITE);
        let scale = 224.0 / s.pages.remote.qr_size.max(1) as f32;
        for &(x, y, width) in &s.pages.remote.qr {
            qr = qr.child(
                el().absolute(x as f32 * scale, y as f32 * scale)
                    .size(width as f32 * scale, scale)
                    .fill(rune::Color::BLACK),
            );
        }
        body = body.child(
            col()
                .gap(12.0)
                .child(label(&s.theme, "Scan to pair", 15.0, 500.0, "text"))
                .child(qr)
                .child(
                    label(
                        &s.theme,
                        pair["code"].as_str().unwrap_or(""),
                        20.0,
                        600.0,
                        "text",
                    )
                    .selectable(true),
                )
                .child(
                    label(
                        &s.theme,
                        pair["url"].as_str().unwrap_or(""),
                        12.0,
                        400.0,
                        "text-secondary",
                    )
                    .selectable(true),
                )
                .child(button(s, "Done").on_press(|s: &mut State| {
                    s.pages.remote.pair = None;
                    s.pages.remote.qr.clear();
                    s.page_get("remote");
                })),
        );
    }
    body
}
fn save(s: &mut State, enabled: bool) {
    let Ok(port) = s.pages.remote.port.text.parse::<u16>() else {
        s.pages
            .errors
            .insert("remote".into(), "Enter a valid port".into());
        return;
    };
    let hostname = s.pages.remote.hostname.text.trim();
    let mut body = json!({"enabled":enabled,"hostname":if hostname.is_empty(){None}else{Some(hostname)},"port":port,"tunnel":if s.pages.remote.external{"external"}else{"token"}});
    if !s.pages.remote.token.text.trim().is_empty() {
        body["token"] = json!(s.pages.remote.token.text.trim());
    }
    s.page_write("remote", "PUT", body, "remote");
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
