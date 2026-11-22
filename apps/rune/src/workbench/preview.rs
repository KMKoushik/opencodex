//! Read-only media guests: unprivileged WebKit; DOCX conversion runs in a disposable worker.
use crate::{State, sidebar::label};
use rune::{El, col};
use serde_json::Value;
use std::{cell::RefCell, rc::Rc};

pub struct Host {
    web: oc_webview::WebView,
    theme: RefCell<String>,
    error: RefCell<Option<String>>,
}
pub fn prepare(value: &Value) -> Option<String> {
    let kind = value["kind"].as_str()?;
    if kind == "docx" {
        return Some(crate::docx::page(
            value["data"].as_str().unwrap_or(""),
            false,
        ));
    }
    if !matches!(kind, "docx" | "video" | "pdf") {
        return None;
    }
    let body: String = {
        // The URL is set after the owning directory/path is known; no file:// or filesystem bridge.
        if kind == "pdf" {
            "<iframe id=media title=\"PDF preview\" class=wb-pdf-frame></iframe>".into()
        } else {
            r#"<div class="wb-video-viewport"><video id="media" controls playsinline preload="metadata"></video><div id="error" role="alert" hidden><p>This video could not be played. Its format or codec may not be supported, or the file may no longer be available. You can open it from your file manager in the desktop app.</p><button onclick="document.getElementById('error').hidden=true;document.getElementById('media').load()">Retry</button></div></div><script>document.getElementById('media').onerror=()=>document.getElementById('error').hidden=false;</script>"#.into()
        }
    };
    Some(format!(
        r#"<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; worker-src blob:; style-src 'unsafe-inline'; img-src data:; media-src http: https:; frame-src http: https:; connect-src 'none'"><style>
*{{box-sizing:border-box}}html,body{{margin:0;width:100%;height:100%;overflow:hidden;background:var(--surface);color:var(--text);font:13px -apple-system,BlinkMacSystemFont,sans-serif}}body{{display:flex;flex-direction:column}}#status,#error{{padding:24px}}.wb-docx-scroll{{min-height:0}}[hidden]{{display:none!important}}
{docx}
{media}
{find}
.find-bar .button{{display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer}}.find-bar .button:hover{{background:var(--hover)}}.find-bar .button:disabled{{opacity:.5;cursor:default}}
</style></head><body>{body}</body></html>"#,
        docx = include_str!("../../../web/src/features/workbench/docx-viewer.css"),
        media = include_str!("../../../web/src/features/workbench/video-viewer.css"),
        find = include_str!("../../../web/src/features/find/find.css")
    ))
}
pub fn create(s: &State, html: &str, directory: &str, path: &str) -> Option<Host> {
    let base = crate::sidecar::url()?;
    let base = url::Url::parse(base).ok()?;
    let wake = s.waker.clone();
    let web = oc_webview::WebView::new(oc_webview::Options {
        bridge: false,
        navigation: oc_webview::Navigation {
            origins: vec![base.origin().ascii_serialization()],
            external_links: false,
            ..Default::default()
        },
        wake: Rc::new(move || {
            if let Some(wake) = &wake {
                wake();
            }
        }),
        ..Default::default()
    });
    let mut media = base.join("/api/workspace/media").ok()?;
    media
        .query_pairs_mut()
        .append_pair("directory", directory)
        .append_pair("path", path);
    // evaluate queues until WebKit exists; after load use a single idempotent DOM-ready task.
    let title = serde_json::to_string(path).ok()?.replace('<', "\\u003c");
    let script = format!(
        "(()=>{{function init(){{let e=document.getElementById('media');if(e){{e.src={};e.setAttribute('aria-label',{});e.title={};}}}}if(document.readyState==='loading')addEventListener('DOMContentLoaded',init,{{once:true}});else init();}})()",
        serde_json::to_string(media.as_str()).ok()?,
        title,
        title
    );
    // load_html inserts the URL before load, rather than racing asynchronous evaluate/navigation.
    let initial_css = css(s);
    let html = html
        .replace(
            "</head>",
            &format!("<style>:root{{{initial_css}}}</style></head>"),
        )
        .replace("</body>", &format!("<script>{script}</script></body>"));
    if let Err(error) = web.load_html(&html, Some(base.as_str())) {
        eprintln!("Preview: {error}");
        return None;
    }
    Some(Host {
        web,
        theme: RefCell::new(initial_css),
        error: RefCell::new(None),
    })
}
pub fn poll(s: &State, tx: &mut rune::Tx) -> bool {
    let mut changed = false;
    for doc in &s.workbench.docs {
        let Some(host) = &doc.rich_preview else {
            continue;
        };
        for event in host.web.drain_events() {
            match event {
                oc_webview::Event::Error(error) => {
                    *host.error.borrow_mut() = Some(error);
                    changed = true;
                }
                oc_webview::Event::Focus(oc_webview::FocusRequest::Escape)
                    if doc.value["kind"] == "docx" =>
                {
                    let _ = host.web.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))", |_| {});
                    host.web.focus();
                }
                oc_webview::Event::Focus(_) => {
                    host.web.focus_rune();
                    tx.focus("file-actions", true);
                }
                _ => {}
            }
        }
    }
    changed
}
fn css(s: &State) -> String {
    let mut css = s
        .theme
        .tokens
        .iter()
        .map(|(key, value)| format!("--{key}:{value};"))
        .collect::<String>();
    css.push_str("--font-sans:-apple-system,BlinkMacSystemFont,sans-serif;");
    css
}
pub fn view(s: &State, index: usize, host: &Host) -> El {
    if let Some(error) = host.error.borrow().as_ref() {
        return super::view::empty(s, error);
    }
    if let Some(window) = &s.native.window {
        if let Err(error) = host.web.attach(window) {
            return super::view::empty(s, &error);
        }
    }
    let css = css(s);
    if *host.theme.borrow() != css {
        // Theme is authored data, not executable document content.
        let script = format!(
            "document.documentElement.style.cssText={}",
            serde_json::to_string(&css).unwrap()
        );
        let _ = host.web.evaluate(&script, |_| {});
        *host.theme.borrow_mut() = css;
    }
    let covered = s.workbench.file_actions.is_some()
        || s.workbench.apps_menu
        || s.chat.comment_editor.is_some()
        || s.native.tooltip
        || s.menus.open.is_some();
    host.web.set_covered(covered);
    let doc = &s.workbench.docs[index];
    let kind = doc.value["kind"].as_str().unwrap_or("");
    let title = if kind == "docx" {
        "Word document · Read-only preview".into()
    } else {
        format!(
            "{} MiB · {}",
            super::image::decimal(doc.value["bytes"].as_f64().unwrap_or(0.0) / (1024.0 * 1024.0)),
            if kind == "pdf" { "PDF" } else { "Video" }
        )
    };
    col()
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .child(
            label(&s.theme, title, 12.0, 400.0, "text-secondary")
                .px(16.0)
                .py(6.0)
                .min_h(32.0)
                .w_full()
                .border_sides([0.0, 0.0, 1.0, 0.0], s.theme.c("border")),
        )
        .child(
            host.web
                .host::<State>("file-preview")
                .grow(1.0)
                .min_h(0.0)
                .min_w(0.0),
        )
}
