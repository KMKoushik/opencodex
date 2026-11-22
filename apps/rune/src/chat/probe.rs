//! Opt-in real-gateway CPU profiler. Headless numbers explicitly exclude GPU/presentation.
use crate::{Gateway, State, Worker, view};
use std::{
    sync::{Arc, mpsc},
    time::{Duration, Instant},
};

pub fn run(url: &str, id: String, duration: Duration) -> Result<(), String> {
    let client = Gateway::new(url, None)?;
    let snapshot = oc_gateway::capture(client.clone())?;
    let mut s = State::new();
    s.snapshot = Arc::new(snapshot);
    let (send, receive) = mpsc::sync_channel(1);
    let send2 = send.clone();
    s.waker = Some(Arc::new(move || {
        let _ = send2.try_send(());
    }));
    s.worker = Some(Worker::start(client, s.prefs.project.clone(), move || {
        let _ = send.try_send(());
    }));
    crate::sidebar::rebuild(&mut s);
    let mut rt = rune::Runtime::new(s, view, (1280.0, 800.0), rune::Env::new(true, 2.0));
    rt.frame(0.0);
    let start = Instant::now();
    rt.update(|s, tx| {
        s.open_session(Some(id));
        tx.settle();
    });
    let mut first = None;
    let mut frames = Vec::new();
    let mut last_revision = 0;
    let mut rendered = false;
    let mut updates = 0;
    while start.elapsed() < duration {
        let remaining = duration.saturating_sub(start.elapsed());
        if receive.recv_timeout(remaining).is_err() {
            break;
        }
        let clock = start.elapsed().as_secs_f64();
        let began = Instant::now();
        if rt.update_if(|s, tx| crate::poll(s, clock, tx)) {
            rt.frame(1.0 / 60.0);
            let elapsed = began.elapsed().as_secs_f64() * 1000.0;
            frames.push(elapsed);
            if rt.state.chat.data.revision != last_revision {
                updates += 1;
                last_revision = rt.state.chat.data.revision;
            }
            if first.is_none() && !rt.state.chat.rows.is_empty() {
                first = Some(start.elapsed().as_secs_f64() * 1000.0);
                let mounted = rt
                    .elements()
                    .iter()
                    .filter(|e| {
                        e.key
                            .as_ref()
                            .is_some_and(|key| rt.state.chat.rows.iter().any(|r| &r.id == key))
                    })
                    .count();
                println!(
                    "OPENCODEX_HEADLESS first_rows_ms {:.3} mounted_rows {mounted} loaded_messages {}",
                    first.unwrap(),
                    rt.state.chat.data.messages.len()
                );
            }
            if !rendered
                && rt.elements().iter().any(|e| {
                    e.path.contains(":text:")
                        && e.visible[2] > 0.0
                        && e.visible[3] > 0.0
                        && e.text.as_deref().is_some_and(|t| t.contains("BENCH-END"))
                })
            {
                println!(
                    "OPENCODEX_HEADLESS reply_rendered_ms {:.3}",
                    start.elapsed().as_secs_f64() * 1000.0
                );
                rendered = true;
            }
            if rendered && !rt.state.chat.data.running {
                break;
            }
        }
    }
    frames.sort_by(f64::total_cmp);
    let quantile = |p: f64| {
        frames
            .get(((frames.len().saturating_sub(1)) as f64 * p).round() as usize)
            .copied()
            .unwrap_or(0.0)
    };
    println!(
        "OPENCODEX_HEADLESS cpu_commit_ms p50 {:.3} p95 {:.3} max {:.3} frames {} message_updates {updates} messages {} rows {} reply_rendered {rendered} (no GPU upload/presentation)",
        quantile(0.5),
        quantile(0.95),
        quantile(1.0),
        frames.len(),
        rt.state.chat.data.messages.len(),
        rt.state.chat.rows.len()
    );
    Ok(())
}
