//! Real gateway throughput and a ten-second idle-worker CPU measurement (no GPU).
use oc_terminal::{Command, Size, Worker};
use std::{
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
fn main() {
    let gateway =
        oc_gateway::Gateway::new(&std::env::var("OPENCODEX_GATEWAY").unwrap(), None).unwrap();
    let directory = std::env::var("OPENCODEX_DIRECTORY").unwrap();
    let wake = Arc::new((Mutex::new(false), Condvar::new()));
    let notify = wake.clone();
    let worker = Worker::start(
        gateway,
        directory,
        None,
        Size {
            cols: 102,
            rows: 24,
        },
        move || {
            *notify.0.lock().unwrap() = true;
            notify.1.notify_one();
        },
    );
    let wait = |duration| {
        let mut ready = wake.0.lock().unwrap();
        if !*ready {
            ready = wake.1.wait_timeout(ready, duration).unwrap().0;
        }
        *ready = false;
    };
    let mut baseline = 0;
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        wait(Duration::from_secs(1));
        if let Some(frame) = worker.take() {
            assert!(frame.error.is_none(), "{:?}", frame.error);
            baseline = frame.bytes;
        } else if baseline > 0 {
            break;
        }
        assert!(Instant::now() < deadline, "initial prompt timeout");
    }
    let start = Instant::now();
    worker
        .command(Command::Input("seq 1 100000\r".into()))
        .unwrap();
    let mut snapshots = 0;
    let mut bytes = baseline;
    let mut elapsed = Duration::ZERO;
    loop {
        wait(Duration::from_secs(1));
        if let Some(frame) = worker.take() {
            bytes = frame.bytes;
            snapshots += 1;
            elapsed = start.elapsed();
        } else if snapshots > 0 {
            break;
        }
        assert!(start.elapsed() < Duration::from_secs(30), "seq timeout");
    }
    println!(
        "PTY seq: {} bytes, {} snapshots, {:.4}s, {:.2} MB/s (includes shell/WebSocket)",
        bytes - baseline,
        snapshots,
        elapsed.as_secs_f64(),
        (bytes - baseline) as f64 / 1e6 / elapsed.as_secs_f64()
    );
    let start = Instant::now();
    let cpu = cpu_time::ProcessTime::now();
    let mut wakes = 0;
    while start.elapsed() < Duration::from_secs(10) {
        wait(Duration::from_secs(10).saturating_sub(start.elapsed()));
        if worker.take().is_some() {
            wakes += 1;
        }
    }
    let cpu = cpu.elapsed().as_secs_f64();
    println!(
        "Idle: {:.6}s process CPU / {:.3}s wall = {:.4}% CPU, {wakes} published frames; no UI/GPU",
        cpu,
        start.elapsed().as_secs_f64(),
        100. * cpu / start.elapsed().as_secs_f64()
    );
}
