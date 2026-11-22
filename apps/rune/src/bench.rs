//! Opt-in diagnostics. Frames enqueue bounded records; one worker owns file I/O.
use std::sync::{OnceLock, mpsc};
static LOG: OnceLock<Option<mpsc::SyncSender<String>>> = OnceLock::new();
static INPUT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static CLOCK: OnceLock<std::time::Instant> = OnceLock::new();
pub fn input() {
    if LOG.get().is_some_and(Option::is_some) {
        INPUT.store(
            CLOCK.get().unwrap().elapsed().as_nanos() as u64,
            std::sync::atomic::Ordering::Relaxed,
        );
    }
}
pub fn drawn() {
    let input = INPUT.swap(0, std::sync::atomic::Ordering::Relaxed);
    if input != 0 {
        log(format!(
            "OPENCODEX_BENCH_INPUT {} {}",
            crate::unix_ms(),
            CLOCK
                .get()
                .unwrap()
                .elapsed()
                .as_nanos()
                .saturating_sub(input as u128) as f64
                / 1_000_000.0
        ));
    }
}
pub fn init() {
    LOG.get_or_init(|| {
        if std::env::var("OPENCODEX_BENCH").as_deref() != Ok("1") {
            return None;
        }
        CLOCK.get_or_init(std::time::Instant::now);
        let (tx, rx) = mpsc::sync_channel::<String>(8192);
        std::thread::spawn(move || {
            use std::io::Write;
            let mut file = std::env::var_os("OPENCODEX_BENCH_LOG").and_then(|p| {
                std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(p)
                    .ok()
            });
            for line in rx {
                eprintln!("{line}");
                if let Some(file) = &mut file {
                    let _ = writeln!(file, "{line}");
                }
            }
        });
        Some(tx)
    });
}
fn log(line: String) {
    if let Some(Some(tx)) = LOG.get() {
        let _ = tx.try_send(line);
    }
}
pub fn mark(name: &str) {
    log(format!("OPENCODEX_BENCH {name} {}", crate::unix_ms()));
}
pub struct Frames {
    previous: Option<rune::time::Instant>,
    enabled: bool,
}
impl Default for Frames {
    fn default() -> Self {
        Self {
            previous: None,
            enabled: std::env::var("OPENCODEX_BENCH_FRAMES").as_deref() == Ok("1"),
        }
    }
}
impl Frames {
    pub fn encoded(&mut self, frame: &rune::FrameEncoded) {
        if !self.enabled || frame.outcome() != rune::FrameOutcome::Drawn {
            return;
        }
        // Display-link target, not a hardware presentation timestamp.
        let at = frame
            .presents_at()
            .or(frame.started())
            .unwrap_or(frame.at());
        let interval = self
            .previous
            .replace(at)
            .map(|p| at.saturating_duration_since(p).as_secs_f64() * 1000.0);
        log(format!(
            "OPENCODEX_BENCH_FRAME {} {} {}",
            crate::unix_ms(),
            interval.unwrap_or(0.0),
            frame.update_ms().unwrap_or(0.0) + frame.encode_ms().unwrap_or(0.0)
        ));
    }
}
