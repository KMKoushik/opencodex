//! Sidebar frame and navigation. Virtual thread rows stay in the parent module.
use super::*;

pub fn view(s: &State) -> El {
    let t = &s.theme;
    let header = row()
        .key("sidebar-header")
        .h(40.0)
        .w_full()
        .pl(88.0)
        .pr(8.0)
        .center_y()
        .justify_between()
        .window_drag()
        .child(
            row()
                .gap(2.0)
                .child(
                    icon_button_size(t, &i::BACK, "Go back", 14.0)
                        .disabled(s.history_index == 0)
                        .on_press(|s: &mut State| s.navigate(false))
                        .dim(if s.history_index > 0 { 1.0 } else { 0.45 }),
                )
                .child(
                    icon_button_size(t, &i::FORWARD, "Go forward", 14.0)
                        .disabled(s.history_index + 1 >= s.history.len())
                        .on_press(|s: &mut State| s.navigate(true))
                        .dim(if s.history_index + 1 < s.history.len() {
                            1.0
                        } else {
                            0.45
                        }),
                ),
        )
        .child(
            icon_button(t, &i::SIDEBAR, "Hide sidebar").on_press(|s: &mut State| {
                s.prefs.sidebar_closed = true;
                s.save();
            }),
        );
    let mut identity = row()
        .key("identity")
        .h(44.0)
        .w_full()
        .mb(4.0)
        .pl(8.0)
        .gap(5.0)
        .center_y();
    if let Some(a) = &s.assets {
        identity = identity
            .child(el().size(24.0, 24.0).pixels(a.small.pixels()))
            .child(el().size(96.0, 16.4).pixels(a.wordmark.pixels()));
    } else {
        identity = identity.child(el().size(125.0, 24.0));
    }
    identity = identity
        .child(
            icon_button_ink(t, &i::DOWN, "App menu", 10.0, "text-tertiary")
                .size(10.0, 24.0)
                .on_press(|s: &mut State| s.menus.open = Some(crate::menus::Menu::Brand)),
        )
        .child(el().grow(1.0))
        .child(
            icon_button_size(t, &i::SEARCH, "Search threads", 15.0)
                .disabled(!crate::menus::search::connected(s))
                .dim(if crate::menus::search::connected(s) {
                    1.0
                } else {
                    0.45
                })
                .on_press_tx(|s: &mut State, tx| crate::menus::open_search(s, tx)),
        );
    if let crate::pages::Route::Settings(section) = &s.pages.route {
        return col()
            .key("sidebar")
            .w(s.sidebar_width())
            .h_full()
            .fill(t.c("surface-under"))
            .child(header)
            .child(
                col()
                    .w_full()
                    .px(10.0)
                    .child(identity)
                    .child(crate::settings::navigation(s, section)),
            );
    }
    let actions = col()
        .w_full()
        .mb(16.0)
        .child(
            nav(t, &i::EDIT, "New thread")
                .label("New chat")
                .disabled(s.project().is_none() || !crate::menus::search::connected(s))
                .dim(
                    if s.project().is_some() && crate::menus::search::connected(s) {
                        1.0
                    } else {
                        0.45
                    },
                )
                .on_press(|s: &mut State| {
                    if s.project().is_none() || !crate::menus::search::connected(s) {
                        return;
                    }
                    s.open_session(None);
                }),
        )
        .child(
            nav(t, &i::FOLDER_OPEN, "Open project")
                .on_press_tx(|s: &mut State, tx| crate::menus::open_projects(s, tx)),
        )
        .child(
            nav(t, &i::TASKS, "Tasks")
                .fill(if s.pages.route == crate::pages::Route::Tasks {
                    t.c("selected")
                } else {
                    Color::TRANSPARENT
                })
                .on_press(|s: &mut State| s.open_page(crate::pages::Route::Tasks)),
        )
        .child(
            nav(t, &i::APPS, "Apps")
                .key("sidebar-apps")
                .fill(
                    if s.pages.route == crate::pages::Route::Apps && s.pages.app.is_none() {
                        t.c("selected")
                    } else {
                        Color::TRANSPARENT
                    },
                )
                .on_press(|s: &mut State| {
                    s.pages.app = None;
                    s.open_page(crate::pages::Route::Apps)
                }),
        )
        .child(crate::apps::sidebar(s));
    let list = col()
        .key("project-list")
        .w_full()
        .grow(1.0)
        .min_h(0.0)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(
            col()
                .key("sidebar-rows")
                .w_full()
                .growth(GrowthSpec::default())
                .virtual_rows(
                    s.rows.len(),
                    32.0,
                    |s: &State, n| s.rows[n].key().into(),
                    render_item,
                )
                .virtual_rows_version(s.rows_revision),
        );
    let footer = row()
        .h(40.0)
        .pt(8.0)
        .gap(2.0)
        .center_y()
        .child(
            nav_ink(t, &i::SETTINGS, "Settings", "text-secondary")
                .key("sidebar-settings")
                .grow(1.0)
                .on_press(|s: &mut State| {
                    s.open_page(crate::pages::Route::Settings("general".into()))
                }),
        )
        .child(
            icon_button(t, &i::USAGE, "Usage limits").on_press(|s: &mut State| {
                s.open_page(crate::pages::Route::Settings("usage".into()))
            }),
        );
    col()
        .key("sidebar")
        .w(s.sidebar_width())
        .h_full()
        .min_h(0.0)
        .fill(t.c("surface-under"))
        .child(header)
        .child(
            col()
                .grow(1.0)
                .w_full()
                .min_h(0.0)
                .px(10.0)
                .pb(10.0)
                .child(identity)
                .child(actions)
                .child(list)
                .child(selection::toolbar(s))
                .child(footer),
        )
}
