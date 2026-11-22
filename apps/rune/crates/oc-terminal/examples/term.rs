//! OPENCODEX_GATEWAY=http://127.0.0.1:4461 OPENCODEX_DIRECTORY=/project cargo run --release -p oc-terminal --example term
use oc_terminal::{Command, Engine, Frame, Palette, Size, TerminalView, Worker};
use rune::{AppSpec, Cx, El, Tx};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

// Reuse the host's exact token derivation, without turning the application binary into a library.
#[allow(dead_code)]
#[path = "../../../src/theme/mod.rs"]
mod theme;

static CAPTURE: OnceLock<Frame> = OnceLock::new();
struct State {
    terminal: TerminalView,
    waker: Option<rune::Waker>,
}
fn gateway() -> oc_gateway::Gateway {
    oc_gateway::Gateway::new(
        &std::env::var("OPENCODEX_GATEWAY").expect("Set OPENCODEX_GATEWAY to the gateway URL"),
        std::env::var("OPENCODEX_TOKEN").ok(),
    )
    .expect("gateway URL")
}
fn directory() -> String {
    std::env::var("OPENCODEX_DIRECTORY").expect("Set OPENCODEX_DIRECTORY to the project directory")
}
fn initial() -> State {
    let theme = theme::Theme::new(
        std::env::var("OPENCODEX_THEME").as_deref() != Ok("light"),
        "ink",
    );
    let mut terminal = TerminalView::new(Palette::from_tokens(|name| theme.c(name)));
    if let Some(frame) = CAPTURE.get() {
        terminal.frame = frame.clone();
    }
    State {
        terminal,
        waker: None,
    }
}
fn view(state: &State, cx: &mut Cx<State>) -> El {
    state.terminal.element("terminal", cx, |s| &mut s.terminal)
}
fn poll(s: &mut State, clock: f64, tx: &mut Tx) -> bool {
    let changed = s.terminal.poll_tx(clock, tx);
    if changed {
        tx.instant();
    }
    changed
}
fn main() {
    let args: Vec<_> = std::env::args()
        .skip(1)
        .map(|a| {
            if a == "--screenshot" {
                "--snap".into()
            } else {
                a
            }
        })
        .collect();
    if args.iter().any(|a| a == "--bench") {
        bench();
        return;
    }
    if let Ok(command) = std::env::var("OPENCODEX_TERMINAL_CAPTURE_COMMAND") {
        let frame = std::thread::spawn(move || capture(command))
            .join()
            .expect("capture worker");
        CAPTURE.set(frame).ok();
    }
    let spec = AppSpec {
        poll: Some(poll),
        setup: Some(|s, w| s.waker = Some(w)),
        families: ("System Font, sans-serif", "Menlo, Consolas, monospace"),
        fonts: &[],
        ..AppSpec::new("Terminal", (800., 384.), initial, view)
    };
    let app = rune::App::new(spec)
        .args(args)
        .font_smoothing(rune::FontSmoothing::Off)
        .on_ime(|s, ime, _| s.terminal.ime(ime));
    let handle = app.handle();
    app.on_ready(move |_| {
        if CAPTURE.get().is_some() {
            return;
        }
        handle.update(|s, _| {
            let waker = s.waker.clone().expect("setup");
            s.terminal.attach(Worker::start(
                gateway(),
                directory(),
                std::env::var("OPENCODEX_TERMINAL_ID").ok(),
                Size {
                    cols: 102,
                    rows: 24,
                },
                move || waker(),
            ));
        });
    })
    .run();
}
fn capture(command: String) -> Frame {
    let wake = Arc::new((Mutex::new(false), Condvar::new()));
    let notify = wake.clone();
    let worker = Worker::start(
        gateway(),
        directory(),
        std::env::var("OPENCODEX_TERMINAL_ID").ok(),
        Size {
            cols: 102,
            rows: 24,
        },
        move || {
            *notify.0.lock().unwrap() = true;
            notify.1.notify_one();
        },
    );
    let end = Instant::now() + Duration::from_secs(20);
    let mut sent = false;
    let mut last = None;
    let mut last_change = Instant::now();
    loop {
        let mut ready = wake.0.lock().unwrap();
        if !*ready {
            ready = wake
                .1
                .wait_timeout(ready, Duration::from_millis(300))
                .unwrap()
                .0;
        }
        *ready = false;
        drop(ready);
        if let Some(frame) = worker.take() {
            if let Some(e) = &frame.error {
                panic!("Terminal capture failed: {e}");
            }
            last = Some(frame);
            last_change = Instant::now();
            if !sent {
                worker
                    .command(Command::Input(format!("{command}\r")))
                    .expect("input");
                sent = true;
            }
        }
        if sent && last_change.elapsed() > Duration::from_millis(900) {
            let frame = last.unwrap();
            eprintln!("Captured {} PTY bytes", frame.bytes);
            return frame;
        }
        assert!(Instant::now() < end, "Terminal capture timed out");
    }
}
fn bench() {
    use std::fmt::Write;
    let mut seq = String::new();
    for n in 1..=100_000 {
        write!(seq, "{n}\r\n").unwrap();
    }
    let start = Instant::now();
    let mut engine = Engine::new(Size {
        cols: 102,
        rows: 24,
    });
    let mut frames = 0;
    for chunk in seq.as_bytes().chunks(16 * 1024) {
        engine.feed(chunk);
        engine.snapshot();
        frames += 1;
    }
    let elapsed = start.elapsed().as_secs_f64();
    eprintln!(
        "{} bytes, {elapsed:.6}s, {:.2} MB/s, {frames} snapshots ({:.0}/s); excludes GPU upload/presentation",
        seq.len(),
        seq.len() as f64 / 1e6 / elapsed,
        frames as f64 / elapsed
    );
}
