use crate::{State, shortcuts};
use rune::{App, MenuItem};
/// Rune's first-responder Edit/Window menus keep IME, undo, copy and paste native.
pub fn install(app: App<State>) -> App<State> {
    app.standard_menus()
        .menu_item(
            MenuItem::new("Settings…", |s, tx| {
                shortcuts::execute(s, "settings.open", tx);
            })
            .id("settings")
            .key_equivalent("cmd+,".parse().unwrap()),
        )
        .menu_item(
            MenuItem::new("New Chat", |s, tx| {
                shortcuts::execute(s, "chat.new", tx);
            })
            .id("new-chat")
            .menu("File")
            .key_equivalent("cmd+n".parse().unwrap()),
        )
        .menu_item(
            MenuItem::new("Open Project…", |s, tx| {
                shortcuts::execute(s, "project.open", tx);
            })
            .id("open-project")
            .menu("File")
            .key_equivalent("cmd+o".parse().unwrap()),
        )
        .menu_item(
            MenuItem::new("Toggle Sidebar", |s, tx| {
                shortcuts::execute(s, "sidebar.toggle", tx);
            })
            .id("sidebar")
            .menu("View")
            .key_equivalent("cmd+b".parse().unwrap()),
        )
        .menu_item(
            MenuItem::new("Tasks", |s, tx| {
                shortcuts::execute(s, "tasks.open", tx);
            })
            .id("tasks")
            .menu("View")
            .key_equivalent("cmd+shift+d".parse().unwrap()),
        )
        .menu_item(
            MenuItem::new("Apps", |s: &mut State, _| {
                s.open_page(crate::pages::Route::Apps)
            })
            .id("apps")
            .menu("View"),
        )
        .menu_item(
            MenuItem::new("Find", |s, tx| {
                shortcuts::execute(s, "find.open", tx);
            })
            .id("find")
            .menu("Edit")
            .key_equivalent("cmd+f".parse().unwrap()),
        )
        .menu_item(
            MenuItem::new("Keyboard Shortcuts", |s, tx| {
                shortcuts::execute(s, "shortcuts.open", tx);
            })
            .id("shortcuts")
            .menu("Help")
            .key_equivalent("cmd+/".parse().unwrap()),
        )
}
