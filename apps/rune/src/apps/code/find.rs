//! Full-source search is independent of mounted virtual rows. Scans never run on scroll.
use super::*;
use rune::{Key, TextEdit, Tx, text_input};

#[derive(Default)]
pub struct Find {
    pub open: bool,
    focus_on_show: bool,
    query: TextEdit,
    requested_query: String,
    matches: Vec<Range<usize>>,
    current: usize,
    capped: bool,
    error: Option<String>,
    generation: u64,
    pending: bool,
    file: Option<Arc<File>>,
    worker: Option<SearchWorker>,
}
struct SearchWorker {
    input: Arc<Mutex<Option<Request>>>,
    signal: mpsc::SyncSender<()>,
    output: Arc<Mutex<Option<ResultRow>>>,
}
struct Request {
    generation: u64,
    file: Arc<File>,
    query: String,
}
struct ResultRow {
    generation: u64,
    matches: Vec<Range<usize>>,
    capped: bool,
    error: Option<String>,
}
impl SearchWorker {
    fn new(wake: Option<rune::Waker>) -> Result<Self, String> {
        let input = Arc::new(Mutex::new(None::<Request>));
        let requests = input.clone();
        let output = Arc::new(Mutex::new(None));
        let replies = output.clone();
        let (signal, receiver) = mpsc::sync_channel(1);
        std::thread::Builder::new()
            .name("app-code-find".into())
            .spawn(move || {
                while receiver.recv().is_ok() {
                    let Some(request) = requests.lock().expect("source find input").take() else {
                        continue;
                    };
                    *replies.lock().expect("source find output") = Some(scan(request));
                    if let Some(wake) = &wake {
                        wake();
                    }
                }
            })
            .map_err(|error| format!("Could not search app code. {error}"))?;
        Ok(Self {
            input,
            signal,
            output,
        })
    }
}
fn selected(s: &State) -> Option<Arc<File>> {
    let source = s.pages.apps.code.source.as_ref()?;
    source
        .files
        .iter()
        .find(|file| file.name == s.pages.apps.selected_file)
        .or(source.files.first())
        .cloned()
}
pub fn scoped(s: &State) -> bool {
    s.pages.route == pages::Route::Apps && s.pages.app.is_some() && s.pages.apps.tab == "code"
}
pub fn open(s: &mut State, tx: &mut Tx) {
    if let Some(selection) = tx.text_selection().filter(|selection| {
        selection
            .texts()
            .first()
            .and_then(|text| text.key())
            .is_some_and(|key| key.starts_with("app-code-text-"))
    }) {
        let text = selection.text();
        if !text.is_empty() && text.encode_utf16().count() <= 100 {
            s.pages.apps.code.find.query = TextEdit::new(text);
        }
    }
    s.pages.apps.code.find.open = true;
    let len = s.pages.apps.code.find.query.text.len();
    s.pages.apps.code.find.query.set_selection(0, len);
    tx.focus_when_shown("source-find", true);
    request(s, tx);
}
pub fn capture(s: &mut State, query: &str) {
    let Some(file) = selected(s) else {
        return;
    };
    let find = &mut s.pages.apps.code.find;
    find.open = true;
    find.focus_on_show = true;
    find.query = TextEdit::new(query);
    find.requested_query = query.into();
    find.file = Some(file.clone());
    let generation = find.generation;
    let query = query.to_owned();
    apply(
        find,
        std::thread::spawn(move || {
            scan(Request {
                generation,
                file,
                query,
            })
        })
        .join()
        .expect("source find capture"),
    );
}
fn close(s: &mut State, tx: &mut Tx) {
    s.pages.apps.code.find.open = false;
    tx.return_focus("app-code-reader", false);
}
fn scan(request: Request) -> ResultRow {
    // The gateway bounds each source to 512 KiB (index.html to 2 MiB).
    // Keep all occurrences for navigation; only the displayed counter is capped,
    // as in CodeMirror. Even a one-byte query is bounded by that source budget.
    let query = request.query.replace("\\n", "\n").replace("\\t", "\t");
    let mut matches = Vec::new();
    let mut capped = false;
    if !query.is_empty() {
        let pattern = match regex::RegexBuilder::new(&regex::escape(&query))
            .case_insensitive(true)
            .build()
        {
            Ok(pattern) => pattern,
            Err(error) => {
                return ResultRow {
                    generation: request.generation,
                    matches,
                    capped: false,
                    error: Some(format!("Could not search this query. {error}")),
                };
            }
        };
        for matched in pattern.find_iter(&request.file.text) {
            matches.push(matched.range());
        }
        capped = matches.len() > 2000;
    }
    ResultRow {
        generation: request.generation,
        matches,
        capped,
        error: None,
    }
}

#[cfg(test)]
#[test]
fn counter_cap_does_not_truncate_navigation() {
    let source = super::prepare(
        serde_json::json!({"files":[{"name":"server.ts","text":"needle\n".repeat(2100)}]}),
    )
    .unwrap();
    let result = scan(Request {
        generation: 1,
        file: source.files[0].clone(),
        query: "needle".into(),
    });
    assert!(result.capped);
    assert_eq!(result.matches.len(), 2100);
    assert_eq!(result.matches[2099], 14693..14699);
}
fn request(s: &mut State, tx: &mut Tx) {
    let file = selected(s);
    let wake = s.waker.clone();
    let find = &mut s.pages.apps.code.find;
    let same = find
        .file
        .as_ref()
        .zip(file.as_ref())
        .is_some_and(|(a, b)| Arc::ptr_eq(a, b));
    if same && find.requested_query == find.query.text {
        return;
    }
    find.requested_query = find.query.text.clone();
    find.generation = find.generation.wrapping_add(1);
    find.file = file.clone();
    find.matches.clear();
    find.current = 0;
    find.capped = false;
    find.error = None;
    find.pending = false;
    let Some(file) = file else {
        return;
    };
    if find.query.text.is_empty() {
        return;
    }
    let request = Request {
        generation: find.generation,
        file,
        query: find.query.text.clone(),
    };
    if crate::OPTIONS.get().is_some_and(|options| options.headless) {
        let result = std::thread::spawn(move || scan(request))
            .join()
            .expect("source find capture");
        apply(find, result);
        reveal(s, tx);
        return;
    }
    if find.worker.is_none() {
        match SearchWorker::new(wake) {
            Ok(worker) => find.worker = Some(worker),
            Err(error) => {
                s.error = Some(error);
                return;
            }
        }
    }
    find.pending = true;
    let worker = find.worker.as_ref().unwrap();
    *worker.input.lock().expect("source find input") = Some(request);
    let _ = worker.signal.try_send(());
}
fn apply(find: &mut Find, result: ResultRow) {
    find.matches = result.matches;
    find.capped = result.capped;
    find.error = result.error;
    find.pending = false;
    find.current = find.current.min(find.matches.len().saturating_sub(1));
}
pub fn poll(s: &mut State, tx: &mut Tx) -> bool {
    if !scoped(s) {
        return false;
    }
    let file = selected(s);
    let find = &mut s.pages.apps.code.find;
    if !find.open {
        return false;
    }
    if !find
        .file
        .as_ref()
        .zip(file.as_ref())
        .is_some_and(|(a, b)| Arc::ptr_eq(a, b))
        && file.is_some()
    {
        request(s, tx);
        return true;
    }
    let result = find
        .worker
        .as_ref()
        .and_then(|worker| worker.output.lock().expect("source find output").take());
    let Some(result) = result else {
        return false;
    };
    if result.generation != find.generation {
        return false;
    }
    apply(find, result);
    reveal(s, tx);
    true
}
fn reveal(s: &State, tx: &mut Tx) {
    let find = &s.pages.apps.code.find;
    let Some(range) = find.matches.get(find.current) else {
        return;
    };
    let Some(file) = &find.file else {
        return;
    };
    let line = file
        .lines
        .partition_point(|line| line.start <= range.start)
        .saturating_sub(1);
    tx.scroll_center_in(
        format!("app-code-scroll-{}", file.name),
        format!("code-{line}"),
    );
}
fn step(s: &mut State, tx: &mut Tx, back: bool) {
    let find = &mut s.pages.apps.code.find;
    let count = find.matches.len();
    if count == 0 {
        return;
    }
    find.current = (find.current + if back { count - 1 } else { 1 }) % count;
    let end = find.query.text.len();
    find.query.set_selection(end, end);
    reveal(s, tx);
}
pub fn highlights(s: &State, file: &File, n: usize) -> Vec<Span> {
    let find = &s.pages.apps.code.find;
    if !find.open
        || find.pending
        || find
            .file
            .as_ref()
            .is_none_or(|selected| !std::ptr::eq(selected.as_ref(), file))
    {
        return vec![];
    }
    let line = &file.lines[n];
    let first = find
        .matches
        .partition_point(|range| range.end <= line.start);
    find.matches[first..]
        .iter()
        .enumerate()
        .take_while(|(_, range)| range.start < line.end)
        .filter_map(|(index, range)| {
            let start = range.start.max(line.start);
            let end = range.end.min(line.end);
            if start >= end {
                return None;
            }
            let mut span = Span::new(start - line.start, end - line.start);
            span.bg = Some(s.theme.tint(
                "warning",
                if first + index == find.current {
                    0.7
                } else {
                    0.3
                },
            ));
            Some(span)
        })
        .collect()
}
pub fn key(s: &mut State, event: &rune::KeyEvent, tx: &mut Tx) -> bool {
    if event.key == Key::Escape {
        close(s, tx);
        true
    } else if event.key == Key::Enter
        || event.key == Key::Function(3)
        || event.key == Key::Command('g')
        || ((event.mods.cmd || event.mods.ctrl)
            && matches!(&event.key,Key::Text(value) if value.eq_ignore_ascii_case("g")))
    {
        step(s, tx, event.mods.shift);
        true
    } else {
        false
    }
}
pub fn view(s: &State) -> El {
    let find = &s.pages.apps.code.find;
    let status = if let Some(error) = &find.error {
        error.clone()
    } else if find.query.text.is_empty() || find.pending {
        String::new()
    } else if find.matches.is_empty() {
        "No results".into()
    } else {
        format!(
            "{}/{}{}",
            if find.current >= 2000 {
                "–".into()
            } else {
                (find.current + 1).to_string()
            },
            find.matches.len().min(2000),
            if find.capped { "+" } else { "" }
        )
    };
    let mut bar = row()
        .on_layout_tx(|s: &mut State, _, tx| {
            if s.pages.apps.code.find.focus_on_show {
                s.pages.apps.code.find.focus_on_show = false;
                tx.focus_when_shown("source-find", true);
                reveal(s, tx);
            } else {
                tx.live_only();
            }
        })
        .key("source-find-bar")
        .role("search")
        .label("Find in file")
        .w(340.0)
        .h(38.0)
        .pl(12.0)
        .pr(4.0)
        .gap(2.0)
        .center_y()
        .radius(10.0)
        .fill(s.theme.c("elevated"))
        .border(1.0, s.theme.c("border-heavy"))
        .child(
            text_input(&find.query, TextStyle::new(13.0, 400.0))
                .key("source-find")
                .label("Find in file")
                .single_line()
                .grow(1.0)
                .min_w(0.0)
                .color(s.theme.c("text"))
                .placeholder("Find in file", s.theme.c("text-tertiary"))
                .on_edit(|s: &mut State| &mut s.pages.apps.code.find.query)
                .on_input_change(request)
                .on_input_key(key),
        )
        .child(
            label(
                &s.theme,
                status,
                12.0,
                400.0,
                if !find.query.text.is_empty() && find.matches.is_empty() && !find.pending {
                    "error"
                } else {
                    "text-tertiary"
                },
            )
            .px(4.0),
        );
    for (icon, title, back) in [
        (&crate::icons::UP, "Previous match", true),
        (&crate::icons::DOWN, "Next match", false),
    ] {
        bar = bar.child(
            crate::sidebar::icon_button(&s.theme, icon, title)
                .size(26.0, 26.0)
                .disabled(find.matches.is_empty())
                .on_press_tx(move |s: &mut State, tx| step(s, tx, back)),
        );
    }
    bar = bar.child(
        crate::sidebar::icon_button(&s.theme, &crate::icons::CLOSE, "Close find")
            .size(26.0, 26.0)
            .on_press_tx(close),
    );
    row()
        .w(364.0)
        .px(12.0)
        .child(s.theme.shadow(bar, "shadow"))
        .anchored("app-code-reader", rune::Side::Top, rune::Align::End, -46.0)
}
