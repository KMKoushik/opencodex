//! Bounded, coalescing HTML parse worker. Neither HTML5 tree construction nor
//! sanitization runs on the UI/streaming interaction thread.
use oc_markdown::html::Node;
use std::collections::{BTreeMap, VecDeque};
use std::sync::{
    Arc, Condvar, LazyLock, Mutex,
    atomic::{AtomicU64, Ordering},
};

pub struct Fragment {
    pub nodes: Arc<Vec<Node>>,
    pub start: usize,
}
type Tree = Arc<Fragment>;
type Ready = Option<Tree>;
#[derive(Default)]
struct Cache {
    ready: VecDeque<(String, Ready)>,
    bytes: usize,
    pending: BTreeMap<String, (String, Option<rune::Waker>)>,
    last: VecDeque<(String, String)>,
}
static CACHE: LazyLock<(Mutex<Cache>, Condvar)> =
    LazyLock::new(|| (Mutex::new(Cache::default()), Condvar::new()));
static REVISION: AtomicU64 = AtomicU64::new(0);
static WORKER: LazyLock<()> = LazyLock::new(|| {
    std::thread::Builder::new()
        .name("markdown-html".into())
        .spawn(|| {
            loop {
                let (key, (source, wake)) = {
                    let (lock, ready) = &*CACHE;
                    let mut cache = lock.lock().unwrap();
                    while cache.pending.is_empty() {
                        cache = ready.wait(cache).unwrap();
                    }
                    cache.pending.pop_first().unwrap()
                };
                let _ = prepare(&source);
                {
                    let mut cache = CACHE.0.lock().unwrap();
                    cache.last.retain(|(k, _)| k != &key);
                    if cache.last.len() >= 32 {
                        cache.last.pop_front();
                    }
                    cache.last.push_back((key, source));
                }
                REVISION.fetch_add(1, Ordering::Release);
                if let Some(wake) = wake {
                    wake();
                }
            }
        })
        .expect("HTML parse worker");
});

pub fn revision() -> u64 {
    REVISION.load(Ordering::Acquire)
}
fn cached(source: &str) -> Option<Ready> {
    CACHE
        .0
        .lock()
        .unwrap()
        .ready
        .iter()
        .rev()
        .find(|(s, _)| s == source)
        .map(|(_, t)| t.clone())
}
/// Capture/media workers prepare snapshots synchronously, before the first frame.
pub fn prepare(source: &str) -> Ready {
    if let Some(tree) = cached(source) {
        return tree;
    }
    let tree = oc_markdown::html::fragment_start(source).map(|start| {
        Arc::new(Fragment {
            nodes: Arc::new(oc_markdown::html::markdown(&source[start..])),
            start,
        })
    });
    let mut cache = CACHE.0.lock().unwrap();
    let bytes = source.len() * 8;
    while cache.bytes + bytes > 16 << 20 || cache.ready.len() >= 64 {
        let Some((old, _)) = cache.ready.pop_front() else {
            break;
        };
        cache.bytes = cache.bytes.saturating_sub(old.len() * 8);
    }
    cache.bytes += bytes;
    cache.ready.push_back((source.to_owned(), tree.clone()));
    tree
}
pub fn request(source: &str, key: &str, wake: Option<rune::Waker>) -> Option<Ready> {
    if let Some(tree) = cached(source) {
        return Some(tree);
    }
    LazyLock::force(&WORKER);
    let mut cache = CACHE.0.lock().unwrap();
    if cache.pending.len() < 32 || cache.pending.contains_key(key) {
        // A later token replaces the unfinished job for this response, rather
        // than retaining an unbounded queue of superseded token snapshots.
        cache
            .pending
            .insert(key.to_owned(), (source.to_owned(), wake));
        CACHE.1.notify_one();
    }
    cache
        .last
        .iter()
        .rev()
        .find(|(k, old)| k == key && source.starts_with(old))
        .and_then(|(_, source)| cache.ready.iter().rev().find(|(s, _)| s == source))
        .map(|(_, tree)| tree.clone())
}
