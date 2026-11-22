//! One native integration check, not a screenshot-only placeholder. Uses Rune's actual
//! headless layout/motion runtime so it also drives real spring frames with a locked screen.
use oc_webview::{Event, WebView};
use rune::{Cx, El, Env, Runtime, Tx, col, el, row};
use std::{
    cell::RefCell,
    path::PathBuf,
    rc::Rc,
    sync::mpsc,
    time::{Duration, Instant},
};

type ResultSlot = Rc<RefCell<Option<Result<(), String>>>>;
type EvalSlot = Rc<RefCell<Option<Result<String, String>>>>;
struct Layout {
    web: WebView,
    side: f32,
    mounted: bool,
}
fn layout(s: &Layout, _: &mut Cx<Layout>) -> El {
    row()
        .w_full()
        .h_full()
        .child(el().w(s.side).h_full())
        .child(
            col()
                .grow(1.0)
                .h_full()
                .child(el().h(48.0))
                .child(if s.mounted {
                    s.web.host::<Layout>("check-panel").grow(1.0)
                } else {
                    el().grow(1.0)
                }),
        )
}
enum Stage {
    Ready,
    Initial(EvalSlot),
    Isolated(EvalSlot),
    RetainedWorld(EvalSlot),
    PageWorld(EvalSlot),
    Dates(EvalSlot),
    HistoryLoad,
    History(EvalSlot),
    HistoryWait,
    Restored,
    Original,
    Snapshot(mpsc::Receiver<Result<PathBuf, String>>),
    Move {
        step: u32,
        expected: [f32; 4],
        moving_frames: u32,
    },
    Resized(EvalSlot),
    Policy,
    FinalSnapshot(mpsc::Receiver<Result<PathBuf, String>>),
    Done,
}
pub struct Check {
    stage: Stage,
    started: Instant,
    result: ResultSlot,
    ack: bool,
    blocked: bool,
    new_tab: bool,
    runtime: Runtime<Layout>,
    output: PathBuf,
    last: [f32; 4],
    restored: WebView,
}
impl Check {
    pub fn new(result: ResultSlot, web: WebView, restored: WebView) -> Self {
        let output = std::env::var_os("OC_WEBVIEW_PNG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("oc-webview-check"));
        Self {
            stage: Stage::Ready,
            started: Instant::now(),
            result,
            ack: false,
            blocked: false,
            new_tab: false,
            output,
            last: [0.0; 4],
            restored,
            runtime: Runtime::new(
                Layout {
                    web,
                    side: 266.0,
                    mounted: true,
                },
                layout,
                (1100.0, 700.0),
                Env {
                    system_dark: true,
                    scale: 2.0,
                },
            ),
        }
    }
    pub fn event(&mut self, event: &Event) {
        if matches!(event, Event::Error(_) | Event::Blocked(_)) {
            eprintln!("check native event: {event:?}");
        }
        match event {
            Event::Message { json, .. } if json.contains("\"ack\"") => self.ack = true,
            Event::Blocked(url) if url == "https://disallowed.invalid/blocked" => {
                self.blocked = true
            }
            Event::NewWindow(url) if url == "about:blank" => self.new_tab = true,
            _ => {}
        }
    }
    pub fn step(&mut self, web: &WebView, tx: &mut Tx) {
        if self.started.elapsed() > Duration::from_secs(30) {
            self.finish(
                Err(format!(
                    "timed out; ack={}, blocked={}, new_tab={}",
                    self.ack, self.blocked, self.new_tab
                )),
                tx,
            );
            return;
        }
        if let Err(error) = self.advance(web) {
            self.finish(Err(error), tx);
        } else if matches!(self.stage, Stage::Done) {
            self.finish(Ok(()), tx);
        }
    }
    fn advance(&mut self, web: &WebView) -> Result<(), String> {
        match &mut self.stage {
            Stage::Ready => {
                self.runtime.frame(0.0);
                if !self.ack || web.state().loading {
                    return Ok(());
                }
                println!("PASS: opaque sandbox iframe → native → iframe message round-trip");
                self.stage = Stage::Initial(evaluate(web, viewport()));
            }
            Stage::Initial(slot) => {
                let Some(result) = slot.borrow_mut().take() else {
                    return Ok(());
                };
                dimensions(&result?, 834.0, 652.0)?;
                if web.state().title != "Canvas bridge check" {
                    return Err("title KVO observation failed".into());
                }
                println!("PASS: title/loading observation; initial viewport and backing scale");
                let slot = Rc::new(RefCell::new(None));
                let out = slot.clone();
                web.evaluate_isolated(
                    "globalThis.__ocPrivateCheck = 'private'; return await Promise.resolve('isolated-ready');",
                    move |result| *out.borrow_mut() = Some(result),
                );
                self.stage = Stage::Isolated(slot);
            }
            Stage::Isolated(slot) => {
                let Some(result) = slot.borrow_mut().take() else {
                    return Ok(());
                };
                if result? != "isolated-ready" {
                    return Err("isolated async evaluation did not await its result".into());
                }
                let slot = Rc::new(RefCell::new(None));
                let out = slot.clone();
                web.evaluate_isolated("return globalThis.__ocPrivateCheck;", move |result| {
                    *out.borrow_mut() = Some(result)
                });
                self.stage = Stage::RetainedWorld(slot);
            }
            Stage::RetainedWorld(slot) => {
                let Some(result) = slot.borrow_mut().take() else {
                    return Ok(());
                };
                if result? != "private" {
                    return Err("private content world was released between evaluations".into());
                }
                self.stage = Stage::PageWorld(evaluate(web, "typeof globalThis.__ocPrivateCheck"));
            }
            Stage::PageWorld(slot) => {
                let Some(result) = slot.borrow_mut().take() else {
                    return Ok(());
                };
                if result? != "undefined" {
                    return Err("annotation globals leaked into the page world".into());
                }
                println!(
                    "PASS: annotation evaluation awaits promises without exposing globals to page scripts"
                );
                let locale = serde_json::to_string(&oc_webview::browser_locale()).unwrap();
                self.stage = Stage::Dates(evaluate(
                    web,
                    &format!(
                        "JSON.stringify([new Intl.DateTimeFormat({locale},{{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}}).format(new Date(1795348860000)),new Intl.DateTimeFormat({locale},{{timeStyle:'short'}}).format(new Date(1795348860000))])"
                    ),
                ));
            }
            Stage::Dates(slot) => {
                let Some(result) = slot.borrow_mut().take() else {
                    return Ok(());
                };
                let mut values: Vec<String> =
                    serde_json::from_str(&result?).map_err(|e| e.to_string())?;
                if let Ok(expected) = std::env::var("OC_WEBVIEW_DATE_EXPECTED") {
                    values = serde_json::from_str(&expected).map_err(|e| e.to_string())?;
                } else if oc_webview::browser_locale().starts_with("en") {
                    values[0] = values[0].replace(" at ", ", ");
                }
                if values
                    != vec![
                        oc_webview::updated_label(1795348860000.0),
                        oc_webview::short_time(1795348860000.0),
                    ]
                {
                    return Err(format!("Intl date parity failed: {values:?}"));
                }
                println!(
                    "PASS: canvas timestamp and side-chat short time match the selected locale oracle byte-for-byte"
                );
                if let Ok(url) = std::env::var("OC_WEBVIEW_HISTORY_URL") {
                    web.load_url(&url)?;
                    self.stage = Stage::HistoryLoad;
                } else {
                    self.stage =
                        Stage::Snapshot(snapshot(web, self.output.join("panel-before.png")));
                }
            }
            Stage::HistoryLoad => {
                if web.state().loading {
                    return Ok(());
                }
                self.stage = Stage::History(evaluate(
                    web,
                    "history.pushState({},'', '#one'); history.pushState({},'', '#two'); history.back(); JSON.stringify({length:history.length,url:location.href})",
                ));
            }
            Stage::History(slot) => {
                let Some(result) = slot.borrow_mut().take() else {
                    return Ok(());
                };
                println!("History script: {}", result?);
                self.stage = Stage::HistoryWait;
            }
            Stage::HistoryWait => {
                if !web.state().can_go_forward {
                    return Ok(());
                }
                let data = web
                    .interaction_state()
                    .ok_or("WebKit did not return bounded NSData interactionState")?;
                println!(
                    "History before fresh restore: {:?}, {} bytes",
                    web.state(),
                    data.len()
                );
                self.restored.restore_interaction(&data)?;
                self.restored.load_url(&web.state().url)?;
                self.restored
                    .present([0.0, 0.0, 320.0, 200.0], [0.0, 0.0, 320.0, 200.0])?;
                println!("Fresh restored state: {:?}", self.restored.state());
                self.stage = Stage::Restored;
            }
            Stage::Restored => {
                let state = self.restored.state();
                if !state.can_go_back || !state.can_go_forward {
                    return Ok(());
                }
                println!(
                    "PASS: fresh WKWebView restores backward AND forward history from opaque interactionState"
                );
                self.restored.hide();
                web.load_html(super::PAGE, Some("http://127.0.0.1/"))?;
                self.stage = Stage::Original;
            }
            Stage::Original => {
                if web.state().loading || web.state().title != "Canvas bridge check" {
                    return Ok(());
                }
                self.stage = Stage::Snapshot(snapshot(web, self.output.join("panel-before.png")));
            }
            Stage::Snapshot(receiver) => {
                let Ok(result) = receiver.try_recv() else {
                    return Ok(());
                };
                println!("PNG: {}", result?.display());
                self.runtime.update(|s, _| s.side = 406.0);
                self.last = self
                    .runtime
                    .presented("check-panel")
                    .ok_or("missing Rune layout")?
                    .0;
                self.stage = Stage::Move {
                    step: 0,
                    expected: self.last,
                    moving_frames: 0,
                };
            }
            Stage::Move {
                step,
                expected,
                moving_frames,
            } => {
                // The prior iteration's Rune draw must have reached the real native view via
                // the runloop observer, without any app-side present() call.
                let frame = web.native_frame().ok_or("missing native frame")?;
                if (frame[0] - f64::from(expected[0])).abs() > 0.6
                    || (frame[2] - f64::from(expected[2])).abs() > 0.6
                {
                    return Err(format!(
                        "frame tracking mismatch: native={frame:?}, Rune={expected:?}"
                    ));
                }
                self.runtime.frame(0.04);
                *expected = self.runtime.presented("check-panel").unwrap().0;
                if expected[0] > 267.0 && expected[0] < 405.0 {
                    *moving_frames += 1;
                }
                *step += 1;
                if *step >= 30 {
                    if *moving_frames < 2 {
                        return Err(
                            "splitter did not produce intermediate Rune spring frames".into()
                        );
                    }
                    self.last = *expected;
                    println!(
                        "PASS: 30 real Rune spring frames tracked by NSView (splitter 266 → 406 pt)"
                    );
                    self.stage = Stage::Resized(evaluate(web, viewport()));
                }
            }
            Stage::Resized(slot) => {
                let Some(result) = slot.borrow_mut().take() else {
                    return Ok(());
                };
                dimensions(&result?, f64::from(self.last[2]), f64::from(self.last[3]))?;
                web.set_covered(true);
                if web.is_visible() {
                    return Err("covered surface remained visible".into());
                }
                web.focus_rune();
                web.set_covered(false);
                if !web.is_visible() {
                    return Err("uncovered surface did not restore".into());
                }
                println!("PASS: overlay hides/restores the actual native NSView");
                if web.load_url("file:///etc/passwd").is_ok() {
                    return Err("file URL accepted".into());
                }
                web.evaluate("document.getElementById('blocked').click(); document.getElementById('new-tab').click()", |_| {});
                self.stage = Stage::Policy;
            }
            Stage::Policy => {
                if !self.blocked || !self.new_tab {
                    return Ok(());
                }
                if web.state().url.contains("disallowed") {
                    return Err("disallowed navigation committed".into());
                }
                println!(
                    "PASS: real WebKit navigation delegate blocked disallowed origin; new-window surfaced"
                );
                self.stage =
                    Stage::FinalSnapshot(snapshot(web, self.output.join("panel-after.png")));
            }
            Stage::FinalSnapshot(receiver) => {
                let Ok(result) = receiver.try_recv() else {
                    return Ok(());
                };
                println!("PNG: {}", result?.display());
                // Removing the final Rune element must hide the retained native view.
                self.runtime.update(|s, tx| {
                    s.mounted = false;
                    tx.settle();
                });
                self.runtime.frame(0.04);
                self.runtime.frame(0.04);
                if web.is_visible() {
                    return Err("unmounted native host remained visible".into());
                }
                println!("PASS: removing Rune host hides the retained native view");
                self.stage = Stage::Done;
            }
            Stage::Done => {}
        }
        Ok(())
    }
    fn finish(&mut self, result: Result<(), String>, tx: &mut Tx) {
        match &result {
            Ok(()) => println!("PASS: oc-webview native integration check"),
            Err(error) => {
                eprintln!("FAIL: {error}");
                // AppKit termination may exit from winit before App::run returns.
                std::process::exit(1);
            }
        }
        *self.result.borrow_mut() = Some(result);
        self.stage = Stage::Done;
        tx.quit();
    }
}
fn viewport() -> &'static str {
    "JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})"
}
fn evaluate(web: &WebView, js: &str) -> EvalSlot {
    let slot = Rc::new(RefCell::new(None));
    let out = slot.clone();
    web.evaluate(js, move |result| *out.borrow_mut() = Some(result));
    slot
}
fn dimensions(json: &str, width: f64, height: f64) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let w = value["width"].as_f64().ok_or("missing innerWidth")?;
    let h = value["height"].as_f64().ok_or("missing innerHeight")?;
    let dpr = value["dpr"].as_f64().ok_or("missing devicePixelRatio")?;
    if (w - width).abs() > 1.0 || (h - height).abs() > 1.0 || dpr < 1.0 {
        return Err(format!("viewport {json}, expected {width}×{height}"));
    }
    println!("viewport: {w}×{h} @ {dpr}×");
    Ok(())
}
fn snapshot(web: &WebView, path: PathBuf) -> mpsc::Receiver<Result<PathBuf, String>> {
    let (send, receive) = mpsc::channel();
    web.snapshot(move |result| {
        std::thread::spawn(move || {
            let result = result.and_then(|bytes| {
                std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
                std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
                Ok(path)
            });
            let _ = send.send(result);
        });
    });
    receive
}
