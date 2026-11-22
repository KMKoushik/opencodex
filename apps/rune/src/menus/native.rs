use crate::State;
use rune::App;

/// Electron main installs no application-specific menu template. Keep native
/// first-responder menus; app commands are dispatched by the shared shortcuts.
pub fn install(app: App<State>) -> App<State> {
    app.standard_menus()
}
