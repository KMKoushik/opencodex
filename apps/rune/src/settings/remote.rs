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
    pub pair: Option<Value>,
    pub qr: Vec<(usize, usize, usize)>,
    pub qr_size: usize,
}
pub fn receive(s: &mut State, path: &str, value: &Value) {
    if path == "remote" {
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
    let mut group = super::group(s, "Remote access").child(super::setting_row(
        s,
        "Status",
        if enabled {
            "Remote access is enabled."
        } else {
            "Off. Only this computer can use OpenCodex."
        },
    ));
    if let Some(value) = data(s, "remote") {
        for key in ["listener", "connector"] {
            if let Some(message) = value[key]["message"].as_str() {
                group = group
                    .child(label(&s.theme, message, 12.0, 400.0, "text-secondary").padding(16.0));
            }
        }
    }
    for (key, title) in [
        ("hostname", "Hostname"),
        ("port", "Local port"),
        ("token", "Cloudflare tunnel token"),
    ] {
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
            .w(260.0)
            .h(32.0)
            .px(8.0)
            .color(s.theme.c("text"))
            .border(1.0, s.theme.c("border"))
            .radius(6.0);
        group = group.child(super::setting_row(s, title, "").child(if key == "token" {
            input.secure()
        } else {
            input
        }));
    }
    group = group
        .child(
            super::setting_row(s, "Tunnel", "Use Cloudflare or your own external proxy.").child(
                button(
                    s,
                    if s.pages.remote.external {
                        "External"
                    } else {
                        "Cloudflare"
                    },
                )
                .on_press(|s: &mut State| s.pages.remote.external = !s.pages.remote.external),
            ),
        )
        .child(
            row()
                .w_full()
                .padding(16.0)
                .gap(8.0)
                .child(
                    button(s, if enabled { "Save" } else { "Enable" })
                        .on_press(|s: &mut State| save(s, true)),
                )
                .child(button(s, "Turn off").on_press(|s: &mut State| save(s, false))),
        );
    body = body.child(group);
    let mut devices = super::group(s, "Devices");
    if enabled {
        devices = devices.child(button(s, "Add device").on_press(|s: &mut State| {
            s.prompt_request(oc_gateway::prompt::Request::Mutate {
                tag: "page:remote/codes".into(),
                path: "remote/codes".into(),
                body: json!({}),
                delete: false,
            });
        }));
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
        s.error = Some("Enter a valid port".into());
        return;
    };
    let hostname = s.pages.remote.hostname.text.trim();
    let mut body = json!({"enabled":enabled,"hostname":if hostname.is_empty(){None}else{Some(hostname)},"port":port,"tunnel":if s.pages.remote.external{"external"}else{"token"}});
    if !s.pages.remote.token.text.trim().is_empty() {
        body["token"] = json!(s.pages.remote.token.text.trim());
    }
    s.page_write("remote", "PUT", body, "remote");
}
