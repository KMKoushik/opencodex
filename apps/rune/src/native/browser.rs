use super::*;
pub(super) fn limit_live(s: &mut State) {
    s.native.browser_lru.retain(|key| {
        s.native
            .browsers
            .iter()
            .chain(
                s.native
                    .retained
                    .values()
                    .flat_map(|tabs| tabs.browsers.iter()),
            )
            .any(|b| b.key == *key)
    });
    let Some(key) = s.native.browsers.get(s.native.browser).map(|b| b.key) else {
        return;
    };
    if s.native.browser_lru.last() == Some(&key) {
        return;
    }
    let b = &s.native.browsers[s.native.browser];
    if b.web.state().url.is_empty() && b.address.text.starts_with("file:") {
        let url = b.address.text.clone();
        s.native_request(format!("browser-file:{key}"), Operation::LocalHTML(url));
    }
    s.native.browser_lru.retain(|k| *k != key);
    s.native.browser_lru.push(key);
    if s.native.browser_lru.len() <= 4 {
        return;
    }
    let old = s.native.browser_lru.remove(0);
    let web = super::web(s, false);
    let b = s
        .native
        .browsers
        .iter_mut()
        .chain(
            s.native
                .retained
                .values_mut()
                .flat_map(|t| t.browsers.iter_mut()),
        )
        .find(|b| b.key == old);
    if let Some(b) = b {
        let url = b.web.state().url;
        if !url.is_empty() {
            b.address = TextEdit::new(url.clone());
        }
        b.web = web;
        if !url.starts_with("file:") {
            b.error = b.web.load_url(&url).err();
        }
    }
}
pub fn browser_panel(s: &State) -> El {
    let mut body = col().grow(1.0).w_full().min_h(0.0);
    let Some(b) = s.native.browsers.get(s.native.browser) else {
        return body
            .child(
                row()
                    .w_full()
                    .h(40.0)
                    .px(8.0)
                    .gap(4.0)
                    .center_y()
                    .child(
                        crate::sidebar::icon_button(&s.theme, &crate::icons::BACK, "Back")
                            .disabled(true),
                    )
                    .child(
                        crate::sidebar::icon_button(&s.theme, &crate::icons::FORWARD, "Forward")
                            .disabled(true),
                    )
                    .child(
                        crate::sidebar::icon_button(&s.theme, &icons::REFRESH, "Reload")
                            .disabled(true),
                    )
                    .child(
                        text_input(&s.native.empty_address, TextStyle::new(12.0, 400.0))
                            .key("browser-address")
                            .label("Address")
                            .placeholder(
                                "Search or enter address, e.g. localhost:3000",
                                s.theme.c("text-tertiary"),
                            )
                            .grow(1.0)
                            .h(28.0)
                            .px(8.0)
                            .radius(6.0)
                            .fill(s.theme.c("control"))
                            .color(s.theme.c("text"))
                            .on_edit(|s: &mut State| &mut s.native.empty_address)
                            .on_submit(|s: &mut State, _| {
                                let value = s.native.empty_address.text.clone();
                                s.open_browser(&value);
                            }),
                    ),
            )
            .child(empty(s));
    };
    let p = b.web.state();
    body = body.child(
        row()
            .w_full()
            .h(40.0)
            .px(8.0)
            .gap(4.0)
            .center_y()
            .child(
                crate::sidebar::icon_button(&s.theme, &crate::icons::BACK, "Back")
                    .disabled(!p.can_go_back)
                    .on_press(|s: &mut State| s.native.browsers[s.native.browser].web.back()),
            )
            .child(
                crate::sidebar::icon_button(&s.theme, &crate::icons::FORWARD, "Forward")
                    .disabled(!p.can_go_forward)
                    .on_press(|s: &mut State| s.native.browsers[s.native.browser].web.forward()),
            )
            .child(
                crate::sidebar::icon_button(
                    &s.theme,
                    if p.loading {
                        &crate::icons::CLOSE
                    } else {
                        &icons::REFRESH
                    },
                    if p.loading { "Stop loading" } else { "Reload" },
                )
                .disabled(b.address.text.is_empty())
                .on_press(|s: &mut State| {
                    let b = &s.native.browsers[s.native.browser];
                    if b.web.state().loading {
                        b.web.stop()
                    } else if b.error.is_some() && b.address.text.starts_with("file:") {
                        s.navigate_browser()
                    } else {
                        b.web.reload()
                    }
                }),
            )
            .child(
                text_input(&b.address, TextStyle::new(12.0, 400.0))
                    .key("browser-address")
                    .label("Address")
                    .placeholder(
                        "Search or enter address, e.g. localhost:3000",
                        s.theme.c("text-tertiary"),
                    )
                    .grow(1.0)
                    .min_w(0.0)
                    .h(28.0)
                    .px(8.0)
                    .radius(6.0)
                    .fill(s.theme.c("control"))
                    .color(s.theme.c("text"))
                    .on_edit(|s: &mut State| &mut s.native.browsers[s.native.browser].address)
                    .on_submit(|s: &mut State, _| s.navigate_browser()),
            )
            .child(
                crate::sidebar::icon_button(
                    &s.theme,
                    &icons::COMMENT,
                    if s.native.annotations.target.is_some() {
                        "Cancel comment"
                    } else {
                        "Comment on page"
                    },
                )
                .disabled(p.loading || b.address.text.is_empty())
                .on_press(|s: &mut State| annotations::toggle(s, false)),
            )
            .child(
                crate::sidebar::icon_button(
                    &s.theme,
                    &crate::chat::icons::OPEN,
                    "Open in system browser",
                )
                .disabled(b.address.text.is_empty() || b.address.text.starts_with("file:"))
                .on_press_tx(|s: &mut State, tx| {
                    if let Err(e) =
                        tx.open_url(&s.native.browsers[s.native.browser].web.state().url)
                    {
                        s.native.error = Some(e.to_string());
                    }
                }),
            ),
    );
    if let Some(e) = &b.error {
        return body.child(
            crate::workbench::empty_state(
                s,
                &crate::chat::icons::BROWSER,
                "This page could not be loaded",
                e,
            )
            .child(label(&s.theme, &b.address.text, 12.0, 400.0, "text-tertiary").wrap())
            .child(
                crate::pages::button(s, "Try again").on_press(|s: &mut State| s.navigate_browser()),
            ),
        );
    }
    if b.address.text.is_empty() {
        return body.child(empty(s));
    }
    body.child(
        b.web
            .host::<State>("browser-page")
            .grow(1.0)
            .min_h(0.0)
            .w_full()
            .focusable(true)
            .key("browser-page-focus")
            .on_press(|s: &mut State| s.native.browsers[s.native.browser].web.focus()),
    )
}
fn empty(s: &State) -> El {
    crate::workbench::empty_state(
        s,
        &crate::chat::icons::BROWSER,
        "Preview your app",
        "Enter a local server such as localhost:3000, a web address, or a search.",
    )
    .child(
        label(
            &s.theme,
            "Local server and HTML links in chat open here too.",
            12.0,
            400.0,
            "text-tertiary",
        )
        .wrap(),
    )
}
pub fn browser_tabs(s: &State) -> El {
    use crate::workbench::panel_tabs as tabs;
    let mut strip = tabs::strip("Browser tabs");
    for (i, b) in s.native.browsers.iter().enumerate() {
        let p = b.web.state();
        let host = url::Url::parse(&b.address.text)
            .ok()
            .and_then(|u| {
                if u.scheme() == "file" {
                    u.to_file_path()
                        .ok()
                        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
                } else {
                    u.host_str().map(str::to_owned)
                }
            })
            .unwrap_or_default();
        let title = if !p.title.is_empty() {
            p.title.as_str()
        } else if !host.is_empty() {
            &host
        } else {
            "New tab"
        };
        let active = s.native.browser == i;
        let button = tabs::button(s, title, &crate::chat::icons::BROWSER, active)
            .key(format!("browser-tab-{i}"))
            .help(&b.address.text)
            .on_press(move |s: &mut State| {
                s.native.browser = i;
                s.native.tabs_dirty = true;
            })
            .on_key(move |s: &mut State, key, tx| {
                let Some(next) = tabs::next(&key.key, i, s.native.browsers.len()) else {
                    return false;
                };
                s.native.browser = next;
                s.native.tabs_dirty = true;
                tx.focus(format!("browser-tab-{next}"), false);
                true
            });
        strip = strip.child(tabs::pill(
            s,
            active,
            button,
            tabs::close(s, &format!("Close {title}")).on_press(move |s: &mut State| {
                annotations::cancel(s);
                s.native.browsers.remove(i);
                if s.native.browser > i {
                    s.native.browser -= 1;
                } else if s.native.browser == i {
                    s.native.browser = i.min(s.native.browsers.len().saturating_sub(1));
                }
                s.native.tabs_dirty = true;
            }),
        ));
    }
    strip.child(
        crate::sidebar::icon_button(&s.theme, &crate::icons::PLUS, "New tab").on_press_tx(
            |s: &mut State, tx| {
                s.new_browser_tab("about:blank");
                tx.focus("browser-address", true);
            },
        ),
    )
}
