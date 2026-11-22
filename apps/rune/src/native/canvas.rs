use super::*;
use std::collections::BTreeMap;
pub struct Canvas {
    pub id: String,
    pub web: WebView,
    source: Option<Value>,
    data: Option<Value>,
    ready: bool,
    initialized: bool,
    theme: BTreeMap<String, String>,
    dark: bool,
    scroll: f64,
    writes: BTreeMap<String, Value>,
    busy: BTreeMap<String, Value>,
    tasks: bool,
    running: Vec<Value>,
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 68
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}
fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 64
        && key
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn shell(s: &State) -> String {
    let origin = OPTIONS.get().unwrap().gateway.as_deref().unwrap_or("");
    let url = format!(
        "{}/api/canvas-runtime/frame.html",
        origin.trim_end_matches('/')
    );
    // An opaque runtime iframe, exactly the web sandbox; never load agent HTML at gateway origin.
    format!(
        r#"<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{{margin:0;border:0;width:100%;height:100%;overflow:hidden;background:{}}}</style><iframe sandbox="allow-scripts" src={}></iframe>"#,
        s.theme
            .tokens
            .get("surface")
            .map(String::as_str)
            .unwrap_or("transparent"),
        serde_json::to_string(&url).unwrap()
    )
}
pub fn open(s: &mut State, id: String) {
    if !valid_id(&id) {
        return;
    }
    s.native.epoch = s.native.epoch.wrapping_add(1);
    s.native.pending.clear();
    s.native.error = None;
    let web = super::web(s, true);
    if let Err(e) = web.load_html(&shell(s), OPTIONS.get().unwrap().gateway.as_deref()) {
        s.native.error = Some(e);
    }
    s.native.canvas = Some(Canvas {
        id,
        web,
        source: None,
        data: None,
        ready: false,
        initialized: false,
        theme: BTreeMap::new(),
        dark: s.theme.dark,
        scroll: 0.0,
        writes: Default::default(),
        busy: Default::default(),
        tasks: false,
        running: vec![],
    });
    s.native.revision[1] = s.snapshot.native_revisions[1];
    s.native.revision[2] = s.snapshot.native_revisions[2];
    refresh(s);
}
pub fn refresh(s: &mut State) {
    let Some(c) = &s.native.canvas else {
        return;
    };
    let id = c.id.clone();
    let tasks = c.tasks;
    s.native_get("source", format!("canvases/{id}"));
    s.native_get("data", format!("canvases/{id}/data"));
    if tasks {
        s.native_get("tasks", "tasks".into());
    }
}
pub fn refresh_changed(s: &mut State) {
    if s.native.revision[1..5] == s.snapshot.native_revisions[1..5] {
        return;
    }
    let Some(c) = &s.native.canvas else {
        return;
    };
    let id = c.id.clone();
    let tasks = c.tasks;
    let server = c.source.as_ref().is_some_and(|v| v["server"] == true);
    if s.native.revision[1] == s.snapshot.native_revisions[1]
        && s.native.revision[2] == s.snapshot.native_revisions[2]
        && (!server || s.native.revision[3] == s.snapshot.native_revisions[3])
        && (!tasks || s.native.revision[4] == s.snapshot.native_revisions[4])
    {
        return;
    }
    for (index, tag, path, enabled) in [
        (1, "source", format!("canvases/{id}"), true),
        (2, "data", format!("canvases/{id}/data"), true),
        (3, "running", "apps".into(), server),
        (4, "tasks", "tasks".into(), tasks),
    ] {
        if enabled
            && s.native.revision[index] != s.snapshot.native_revisions[index]
            && s.native_get(tag, path)
        {
            s.native.revision[index] = s.snapshot.native_revisions[index];
        }
    }
}
fn post(c: &Canvas, mut value: Value) {
    value["channel"] = json!("opencodex-canvas");
    c.web.post_message(&value);
}
pub(super) fn request_failed(native: &mut Native, tag: &str, error: &str) {
    let Some(c) = &mut native.canvas else {
        return;
    };
    if let Some(key) = tag.strip_prefix("write:") {
        c.busy.remove(key);
    }
    if let Some(call) = tag
        .strip_prefix("call:")
        .or_else(|| tag.strip_prefix("task:"))
        .and_then(|n| n.parse::<u64>().ok())
    {
        post(c, json!({"type":"result","call":call,"error":error}));
    }
}
fn canvas_theme(s: &State) -> Value {
    let mut vars: serde_json::Map<String, Value> = s
        .theme
        .tokens
        .iter()
        .map(|(k, v)| (format!("--{k}"), json!(v)))
        .collect();
    vars.insert(
        "--font-sans".into(),
        json!("-apple-system, BlinkMacSystemFont, sans-serif"),
    );
    vars.insert(
        "--font-mono".into(),
        json!("SFMono-Regular, Menlo, monospace"),
    );
    json!({"scheme":if s.theme.dark{"dark"}else{"light"},"vars":vars})
}
pub fn theme(s: &mut State) {
    let Some(c) = &s.native.canvas else {
        return;
    };
    if (!c.ready && !c.initialized)
        || (c.initialized && c.dark == s.theme.dark && c.theme == s.theme.tokens)
    {
        return;
    }
    let theme = canvas_theme(s);
    let Some(c) = &mut s.native.canvas else {
        return;
    };
    if !c.initialized {
        if !c.ready {
            return;
        }
        let (Some(source), Some(data)) = (&c.source, &c.data) else {
            return;
        };
        if source["errors"].as_array().is_some_and(|e| !e.is_empty()) {
            s.native.error = Some(source["errors"].to_string());
            return;
        }
        let Some(html) = source["html"].as_str() else {
            return;
        };
        let values: serde_json::Map<String, Value> = data["values"]
            .as_object()
            .into_iter()
            .flatten()
            .map(|(k, v)| (k.clone(), v["value"].clone()))
            .collect();
        post(
            c,
            json!({"type":"init","theme":theme,"html":html,"data":values,"running":c.running,"scroll":c.scroll}),
        );
        c.initialized = true;
        c.theme = s.theme.tokens.clone();
        c.dark = s.theme.dark;
    } else {
        post(c, json!({"type":"theme","theme":theme}));
        c.theme = s.theme.tokens.clone();
        c.dark = s.theme.dark;
    }
}
pub fn reply(s: &mut State, tag: &str, result: Result<Value, String>) {
    let Some(c) = &mut s.native.canvas else {
        return;
    };
    if let Some(call) = tag
        .strip_prefix("call:")
        .and_then(|n| n.parse::<u64>().ok())
    {
        post(
            c,
            match result {
                Ok(v) => json!({"type":"result","call":call,"value":v["value"]}),
                Err(e) => json!({"type":"result","call":call,"error":e}),
            },
        );
        return;
    }
    if let Some(call) = tag
        .strip_prefix("task:")
        .and_then(|n| n.parse::<u64>().ok())
    {
        post(
            c,
            match result {
                Ok(v) => json!({"type":"result","call":call,"value":v}),
                Err(e) => json!({"type":"result","call":call,"error":e}),
            },
        );
        s.native_get("tasks", "tasks".into());
        return;
    }
    let value = match result {
        Ok(v) => v,
        Err(e) => {
            if tag == "tasks" {
                post(c, json!({"type":"tasks","error":e}));
            }
            s.native.error = Some(e);
            if let Some(k) = tag.strip_prefix("write:") {
                c.busy.remove(k);
            }
            return;
        }
    };
    if tag == "source" {
        let server = value["server"] == true;
        let reload = c.initialized
            && c.source
                .as_ref()
                .is_some_and(|v| v["version"] != value["version"]);
        c.source = Some(value);
        if reload {
            post(c, json!({"type":"reload"}));
        }
        if server && s.native_get("running", "apps".into()) {
            s.native.revision[3] = s.snapshot.native_revisions[3];
        }
    } else if tag == "data" {
        if c.initialized {
            for (key, item) in value["values"].as_object().into_iter().flatten() {
                if c.data
                    .as_ref()
                    .is_none_or(|d| d["values"][key]["rev"] != item["rev"])
                {
                    post(c, json!({"type":"data","key":key,"value":item["value"]}));
                }
            }
            if let Some(old) = &c.data {
                for key in old["values"]
                    .as_object()
                    .into_iter()
                    .flatten()
                    .map(|(k, _)| k)
                {
                    if value["values"].get(key).is_none() {
                        post(c, json!({"type":"data","key":key}));
                    }
                }
            }
        }
        if let Some(errors) = value["errors"].as_array().filter(|v| !v.is_empty()) {
            s.native.error = Some(json!(errors).to_string());
        }
        c.data = Some(value);
    } else if tag == "running" {
        c.running = value
            .as_array()
            .into_iter()
            .flatten()
            .find(|v| v["id"] == c.id)
            .and_then(|v| v["running"].as_array())
            .cloned()
            .unwrap_or_default();
        if c.initialized {
            post(c, json!({"type":"running","names":c.running}));
        }
    } else if tag == "tasks" {
        post(c, json!({"type":"tasks","tasks":value}));
    } else if let Some(key) = tag.strip_prefix("write:") {
        let saved = c.busy.remove(key).unwrap_or(Value::Null);
        if value["ok"] == false {
            c.writes.remove(key);
            post(c, json!({"type":"data","key":key,"value":value["value"]}));
        }
        if let Some(data) = &mut c.data {
            data["values"][key] = json!({"rev":value["rev"],"value":if value["ok"]==false {value["value"].clone()}else{saved}});
        }
        flush(s, key);
    }
    theme(s);
}
fn flush(s: &mut State, key: &str) {
    let Some(c) = &mut s.native.canvas else {
        return;
    };
    if c.busy.contains_key(key) {
        return;
    }
    let Some(value) = c.writes.remove(key) else {
        return;
    };
    let rev = c
        .data
        .as_ref()
        .map(|d| d["values"][key]["rev"].clone())
        .unwrap_or(Value::Null);
    c.busy.insert(key.into(), value.clone());
    let path = format!("canvases/{}/data/{key}", c.id);
    s.native_request(
        format!("write:{key}"),
        Operation::CanvasWrite {
            path,
            body: json!({"value":value,"rev":rev}),
        },
    );
}
pub fn event(s: &mut State, event: Event, tx: &mut Tx) {
    match event {
        Event::Message {
            json,
            url: _,
            main_frame: true,
        } => {
            if json.len() > 1024 * 1024 {
                return;
            }
            let Ok(m) = serde_json::from_str::<Value>(&json) else {
                return;
            };
            if m["channel"] != "opencodex-canvas" {
                return;
            }
            let Some(c) = &mut s.native.canvas else {
                return;
            };
            match m["type"].as_str().unwrap_or("") {
                "ready" => {
                    c.ready = true;
                    c.initialized = false;
                    theme(s);
                }
                "reload" => {
                    c.scroll = m["scroll"].as_f64().unwrap_or(0.0).max(0.0);
                    c.ready = false;
                    c.initialized = false;
                    let web = c.web.clone();
                    let _ = web.load_html(&shell(s), OPTIONS.get().unwrap().gateway.as_deref());
                }
                "error" => {
                    s.native.error = m["message"]
                        .as_str()
                        .map(|m| m.chars().take(4096).collect());
                }
                "set" => {
                    if let Some(key) = m["key"].as_str().filter(|k| valid_key(k)) {
                        if c.writes.len() < 128 {
                            c.writes.insert(key.into(), m["value"].clone());
                            flush(s, key);
                        }
                    }
                }
                "call" => {
                    if let (Some(call), Some(name), Some(args)) =
                        (m["call"].as_u64(), m["name"].as_str(), m["args"].as_array())
                    {
                        if name.len() <= 256
                            && !name.contains('/')
                            && !name.contains('%')
                            && args.len() <= 32
                        {
                            let path = format!("canvases/{}/functions/{name}", c.id);
                            s.native_request(
                                format!("call:{call}"),
                                Operation::Post {
                                    path,
                                    body: json!({"args":args}),
                                },
                            );
                        }
                    }
                }
                "tasks-watch" => {
                    c.tasks = true;
                    s.native_get("tasks", "tasks".into());
                }
                "task" => {
                    if let Some(call) = m["call"].as_u64() {
                        let id = m["id"].as_str().filter(|id| {
                            !id.is_empty()
                                && id.len() < 256
                                && !id.contains('/')
                                && !id.contains('%')
                        });
                        let op = match m["op"].as_str() {
                            Some("add") => Some(Operation::Post {
                                path: "tasks".into(),
                                body: m["input"].clone(),
                            }),
                            Some("start") => id.map(|id| Operation::Post {
                                path: format!("tasks/{id}/start"),
                                body: json!({}),
                            }),
                            Some("update") => id.map(|id| Operation::Patch {
                                path: format!("tasks/{id}"),
                                body: m["input"].clone(),
                            }),
                            Some("remove") => id.map(|id| Operation::Delete(format!("tasks/{id}"))),
                            _ => None,
                        };
                        if let Some(op) = op {
                            s.native_request(format!("task:{call}"), op);
                        }
                    }
                }
                "open" => {
                    if let Some(id) = m["target"]["session"].as_str() {
                        s.open_session(Some(id.into()));
                    } else if let Some(href) = m["target"].as_str() {
                        s.open_link(href, tx);
                    }
                }
                _ => {}
            }
        }
        Event::Focus(f) => {
            if let Some(c) = &s.native.canvas {
                c.web.focus_rune();
            }
            tx.focus(
                if matches!(f, FocusRequest::Location) {
                    "message"
                } else {
                    "canvas-page-focus"
                },
                true,
            );
        }
        Event::NewWindow(url) => s.open_link(&url, tx),
        // oc-webview already handed External navigations to NSWorkspace.
        Event::External(_) => {}
        Event::Error(e) => s.native.error = Some(e),
        _ => {}
    }
}
pub fn host(s: &State, id: &str, key: &'static str) -> El {
    let mut body = col().grow(1.0).w_full().min_h(0.0);
    if let Some(e) = &s.native.error {
        body = body.child(label(&s.theme, e, 12.0, 400.0, "error").wrap().padding(8.0));
    }
    if let Some(c) = s.native.canvas.as_ref().filter(|c| c.id == id) {
        body = body.child(
            c.web
                .host::<State>(key)
                .grow(1.0)
                .min_h(0.0)
                .w_full()
                .key("canvas-page-focus")
                .focusable(true)
                .on_press(|s: &mut State| {
                    if let Some(c) = &s.native.canvas {
                        c.web.focus();
                    }
                }),
        );
    } else {
        body = body.child(label(
            &s.theme,
            "Loading canvas…",
            13.0,
            400.0,
            "text-secondary",
        ));
    }
    body
}
pub fn app_host(s: &State, id: &str) -> El {
    host(s, id, "app-canvas")
}
