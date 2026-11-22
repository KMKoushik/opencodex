use super::*;
use std::cell::RefCell;
#[derive(Default)]
pub struct Annotations {
    pub target: Option<String>,
    session: Option<String>,
    results: Rc<RefCell<Vec<(String, Value)>>>,
    captures: Rc<RefCell<Vec<(String, Value, Result<Vec<u8>, String>)>>>,
}
fn theme(s: &State) -> Value {
    let token = |name: &str| s.theme.tokens.get(name).cloned().unwrap_or_default();
    json!({"primary":token("primary"),"onPrimary":token("on-primary"),"surface":token("elevated"),"text":token("text"),"muted":token("text-tertiary"),"border":token("border-heavy"),"font":"-apple-system, BlinkMacSystemFont, sans-serif"})
}
pub fn toggle(s: &mut State, canvas: bool) {
    if s.native.annotations.target.is_some() {
        cancel(s);
        return;
    }
    let target = if canvas {
        s.native
            .selected_canvas
            .as_ref()
            .map(|id| format!("canvas:{id}"))
    } else {
        s.native
            .browsers
            .get(s.native.browser)
            .map(|_| format!("browser:{}", s.native.browser))
    };
    let Some(target) = target else { return };
    s.native.annotations.target = Some(target.clone());
    s.native.annotations.session = s.selected.clone();
    if canvas {
        if let Some(c) = &s.native.canvas {
            c.web.focus();
            c.web.post_message(
                &json!({"channel":"opencodex-canvas","type":"annotate","theme":theme(s)}),
            );
        }
    } else if let Some(b) = s.native.browsers.get(s.native.browser) {
        b.web.focus();
        let results = s.native.annotations.results.clone();
        let wake = s.waker.clone();
        let script = format!(
            "{}; return JSON.stringify(await globalThis.__ocAnnotation({}));",
            include_str!("annotation-overlay.js"),
            theme(s)
        );
        b.web.evaluate_isolated(&script, move |result| {
            results.borrow_mut().push((
                target,
                result
                    .ok()
                    .and_then(|v| serde_json::from_str(&v).ok())
                    .unwrap_or(Value::Null),
            ));
            if let Some(w) = wake {
                w();
            }
        });
    }
}
pub fn cancel(s: &mut State) {
    if let Some(target) = s.native.annotations.target.take() {
        if target.starts_with("canvas:") {
            if let Some(c) = &s.native.canvas {
                c.web.post_message(
                    &json!({"channel":"opencodex-canvas","type":"annotate-end","action":"cancel"}),
                );
            }
        } else if let Some(b) = target
            .strip_prefix("browser:")
            .and_then(|i| i.parse::<usize>().ok())
            .and_then(|i| s.native.browsers.get(i))
        {
            b.web
                .evaluate_isolated("globalThis.__opencodexAnnotation?.cancel();", |_| {});
        }
    }
}
pub fn canvas_result(s: &mut State, value: Value) {
    if let Some(target) = s
        .native
        .annotations
        .target
        .clone()
        .filter(|t| t.starts_with("canvas:"))
    {
        s.native
            .annotations
            .results
            .borrow_mut()
            .push((target, value));
    }
}
fn valid(v: &Value) -> bool {
    let a = &v["annotation"];
    a["comment"]
        .as_str()
        .is_some_and(|v| v.chars().count() <= 4000)
        && a["elements"].as_array().is_some_and(|es| {
            es.len() <= 20
                && es.iter().all(|e| {
                    [
                        ("tag", 100),
                        ("selector", 500),
                        ("text", 200),
                        ("html", 500),
                    ]
                    .iter()
                    .all(|(k, max)| e[k].as_str().is_some_and(|v| v.chars().count() <= *max))
                })
        })
        && ["regions", "drawings"]
            .iter()
            .all(|k| a[k].as_u64().is_some_and(|v| v <= 50))
}
pub fn poll(s: &mut State) -> bool {
    let mut changed = false;
    let results = std::mem::take(&mut *s.native.annotations.results.borrow_mut());
    for (target, mut value) in results {
        if s.native.annotations.target.as_ref() != Some(&target) {
            continue;
        }
        changed = true;
        if !valid(&value) {
            cancel(s);
            continue;
        }
        let web = if let Some(id) = target.strip_prefix("canvas:") {
            let c = s.native.canvases.iter().find(|c| c["id"] == id);
            value["annotation"]["url"] = json!(target);
            value["annotation"]["title"] = c.map(|c| c["title"].clone()).unwrap_or(json!("Canvas"));
            value["context"] = c.map(|c| c["path"].clone()).unwrap_or(Value::Null);
            s.native.canvas.as_ref().map(|c| c.web.clone())
        } else {
            s.native
                .browsers
                .get(s.native.browser)
                .map(|b| b.web.clone())
        };
        let Some(web) = web else {
            cancel(s);
            continue;
        };
        let crop = &value["crop"];
        let rect = [
            crop["x"].as_f64().unwrap_or(0.0),
            crop["y"].as_f64().unwrap_or(0.0),
            crop["width"].as_f64().unwrap_or(0.0),
            crop["height"].as_f64().unwrap_or(0.0),
        ];
        let captures = s.native.annotations.captures.clone();
        let wake = s.waker.clone();
        if rect.iter().all(|v| v.is_finite())
            && rect[0] >= 0.0
            && rect[1] >= 0.0
            && rect[2] > 0.0
            && rect[3] > 0.0
            && rect[2] <= 16384.0
            && rect[3] <= 16384.0
        {
            web.snapshot_region(rect, move |result| {
                captures.borrow_mut().push((target, value, result));
                if let Some(w) = wake {
                    w();
                }
            });
        } else {
            s.native.annotations.captures.borrow_mut().push((
                target,
                value,
                Err("No screenshot region".into()),
            ));
        }
    }
    let captures = std::mem::take(&mut *s.native.annotations.captures.borrow_mut());
    for (target, v, png) in captures {
        if s.native.annotations.target.as_ref() != Some(&target) {
            continue;
        }
        changed = true;
        let a = &v["annotation"];
        let mut quote = Vec::new();
        if let Some(path) = v["context"].as_str() {
            quote.push(format!("canvas folder: {path}"));
        }
        for e in a["elements"].as_array().into_iter().flatten() {
            quote.push(format!(
                "<{}>{}\n  selector: {}\n  html: {}",
                e["tag"].as_str().unwrap_or(""),
                e["text"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(|s| format!(" \"{s}\""))
                    .unwrap_or_default(),
                e["selector"].as_str().unwrap_or(""),
                e["html"]
                    .as_str()
                    .unwrap_or("")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
            ));
        }
        let marks = [("regions", "marked region"), ("drawings", "drawing")]
            .iter()
            .filter_map(|(k, label)| {
                a[k].as_u64()
                    .filter(|n| *n > 0)
                    .map(|n| format!("{n} {label}{}", if n > 1 { "s" } else { "" }))
            })
            .collect::<Vec<_>>()
            .join(", ");
        if !marks.is_empty() {
            quote.push(marks);
        }
        if let Some(session) = s.native.annotations.session.clone() {
            let draft = s.composer.drafts.edit(&session);
            if draft.comments.len() >= 32 {
                s.native.error = Some("Add up to 32 comments per message.".into());
                cancel(s);
                continue;
            }
            let id = format!("page-{}", crate::unix_ms());
            draft.comments.push(crate::chat::comments::Comment{id:id.clone(),target:json!({"url":a["url"],"title":a["title"],"quote":quote.join("\n"),"screenshot":png.is_ok()}),text:a["comment"].as_str().unwrap_or("").into()});
            s.composer.drafts.touch(&session);
            match png {
                Ok(bytes) => {
                    s.prompt_request(oc_gateway::prompt::Request::PrepareAttachment {
                        key: session,
                        item: oc_gateway::prompt::Attachment {
                            name: format!("{id}.png"),
                            mime: "image/png".into(),
                            bytes: std::sync::Arc::new(bytes),
                            thumbnail: None,
                        },
                    });
                }
                Err(_) => {
                    s.native.error = Some(
                        "The comment was added, but its screenshot could not be captured.".into(),
                    )
                }
            }
        }
        cancel(s);
    }
    changed
}
