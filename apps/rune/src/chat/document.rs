//! Attachment DOCX viewer. Same Mammoth worker and DOMPurify policy as Files.
//! The guest has no host bridge, filesystem access, network, or navigation.
use crate::{
    State,
    sidebar::{icon_button, label},
};
use rune::{El, Latest, col, el, row};
use serde_json::Value;
use std::{cell::RefCell, rc::Rc};

#[derive(Default)]
pub struct Preview {
    pub file: Option<Value>,
    pending: Latest<String>,
    html: Option<String>,
    host: RefCell<Option<oc_webview::WebView>>,
    error: RefCell<Option<String>>,
}
impl Preview {
    pub fn take(&mut self) -> bool {
        let events = self
            .host
            .borrow()
            .as_ref()
            .map(|web| web.drain_events())
            .unwrap_or_default();
        let mut changed = false;
        for event in events {
            match event {
                oc_webview::Event::Focus(oc_webview::FocusRequest::Escape) => {
                    *self = Self::default();
                    return true;
                }
                oc_webview::Event::Focus(_) => {
                    if let Some(web) = self.host.borrow().as_ref() {
                        web.focus_rune();
                    }
                }
                oc_webview::Event::Error(error) => {
                    *self.error.borrow_mut() = Some(error);
                    changed = true;
                }
                _ => {}
            }
        }
        if let Some(html) = self.pending.take() {
            self.html = Some(html);
            true
        } else {
            changed
        }
    }
}
pub fn open(s: &mut State, file: Value) {
    let mut preview = Preview::default();
    if let Some(wake) = s.waker.clone() {
        preview.pending.set_waker(wake);
    }
    preview
        .pending
        .request(file["data"].as_str().unwrap_or("").to_owned(), |data| {
            crate::docx::page(&data, true)
        });
    preview.file = Some(file);
    s.chat.media.document = preview;
}
pub fn close(s: &mut State) {
    s.chat.media.document = Preview::default();
}
pub fn view(s: &State, width: f32, height: f32) -> Option<El> {
    let preview = &s.chat.media.document;
    let file = preview.file.as_ref()?;
    let name = file["name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("attachment");
    let mut body =
        label(&s.theme, "Loading document…", 13.0, 400.0, "text-secondary").padding(24.0);
    if let Some(html) = &preview.html {
        let mut host = preview.host.borrow_mut();
        if host.is_none() {
            let wake = s.waker.clone();
            let web = oc_webview::WebView::new(oc_webview::Options {
                bridge: false,
                navigation: oc_webview::Navigation {
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
            let css = s
                .theme
                .tokens
                .iter()
                .map(|(k, v)| format!("--{k}:{v};"))
                .collect::<String>()
                + "--font-sans:-apple-system,BlinkMacSystemFont,sans-serif;";
            let html = html.replace("</head>", &format!("<style>:root{{{css}}}</style></head>"));
            match web.load_html(&html, None) {
                Err(error) => *preview.error.borrow_mut() = Some(error),
                Ok(()) => *host = Some(web),
            }
        }
        if let Some(web) = host.as_ref() {
            if let Some(window) = &s.native.window {
                if let Err(error) = web.attach(window) {
                    *preview.error.borrow_mut() = Some(error);
                }
            }
            web.set_covered(false);
            body = web
                .host::<State>("attachment-docx")
                .w_full()
                .grow(1.0)
                .min_h(0.0);
        }
    }
    if let Some(error) = preview.error.borrow().as_ref() {
        body = label(&s.theme, error, 13.0, 400.0, "error")
            .role("alert")
            .padding(24.0)
            .wrap();
    }
    let download = file.clone();
    let panel = col()
        .w((width - 32.0).min(1000.0))
        .h((height - 32.0).min(900.0))
        .radius(12.0)
        .border(1.0, s.theme.c("border-heavy"))
        .border_layout()
        .fill(s.theme.c("surface"))
        .child(
            row()
                .w_full()
                .px(16.0)
                .py(8.0)
                .gap(12.0)
                .center_y()
                .border_sides([0.0, 0.0, 1.0, 0.0], s.theme.c("border"))
                .child(
                    label(&s.theme, name, 14.0, 400.0, "text")
                        .truncate()
                        .grow(1.0),
                )
                .child(
                    label(&s.theme, "Download", 13.0, 400.0, "text")
                        .px(12.0)
                        .h(28.0)
                        .role("button")
                        .focusable(true)
                        .on_press_tx(move |_: &mut State, tx| {
                            super::attachments::download(&download, tx)
                        }),
                )
                .child(
                    icon_button(&s.theme, &crate::icons::CLOSE, "Close document preview")
                        .on_press(close),
                ),
        )
        .child(body);
    Some(
        el().absolute(0.0, 0.0)
            .size(width, height)
            .fill(s.theme.c("scrim"))
            .center()
            .role("dialog")
            .label(format!("Document preview: {name}"))
            .modal(true, close)
            .child(s.theme.shadow(panel, "shadow")),
    )
}
