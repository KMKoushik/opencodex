// DEBUG only: lets `-terminal <directory>` open the terminal at launch without touching the
// app's root view. See TerminalDebugLaunch.swift.
#if DEBUG
extern void opencodex_terminal_debug_launch(void);

__attribute__((constructor)) static void opencodex_terminal_debug_constructor(void) {
  opencodex_terminal_debug_launch();
}
#endif
