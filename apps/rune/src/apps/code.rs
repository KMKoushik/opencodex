//! App source is read-only. Index and lex on a coalescing worker, never on scroll.
pub(crate) mod find;
use super::*;
use rune::{Span, TextStyle, el, row, text};
use rune_kit::syntax::{Paint, Syntax};
use std::{
    ops::Range,
    sync::{Arc, Mutex, mpsc},
};

pub struct File {
    name: String,
    text: String,
    lines: Vec<Range<usize>>,
    tokens: Vec<Vec<(Range<usize>, Syntax)>>,
}
pub struct Source {
    files: Vec<Arc<File>>,
}
#[derive(Default)]
pub struct Code {
    pub find: find::Find,
    pub source: Option<Arc<Source>>,
    error: Option<String>,
    worker: Option<Worker>,
    generation: u64,
    pending: bool,
}
type Prepared = Result<Arc<Source>, String>;
type Reply = (u64, Prepared);
struct Worker {
    input: Arc<Mutex<Option<(u64, Value)>>>,
    signal: mpsc::SyncSender<()>,
    output: Arc<Mutex<Option<Reply>>>,
}
impl Worker {
    fn new(wake: Option<rune::Waker>) -> Result<Self, String> {
        let input = Arc::new(Mutex::new(None::<(u64, Value)>));
        let requests = input.clone();
        let output = Arc::new(Mutex::new(None));
        let replies = output.clone();
        let (signal, receiver) = mpsc::sync_channel(1);
        std::thread::Builder::new()
            .name("app-code".into())
            .spawn(move || {
                while receiver.recv().is_ok() {
                    let request = requests.lock().expect("app code request").take();
                    let Some((generation, value)) = request else {
                        continue;
                    };
                    let result = prepare(value).map(Arc::new);
                    *replies.lock().expect("app code reply") = Some((generation, result));
                    if let Some(wake) = &wake {
                        wake();
                    }
                }
            })
            .map_err(|e| format!("Could not prepare app code. {e}"))?;
        Ok(Self {
            input,
            signal,
            output,
        })
    }
    fn send(&self, generation: u64, value: Value) {
        *self.input.lock().expect("app code request") = Some((generation, value));
        let _ = self.signal.try_send(());
    }
}
pub fn receive(s: &mut State, result: Result<Value, String>) {
    let code = &mut s.pages.apps.code;
    code.generation = code.generation.wrapping_add(1);
    code.pending = false;
    let value = match result {
        Ok(value) => value,
        Err(error) => {
            code.error = Some(error);
            return;
        }
    };
    if crate::OPTIONS.get().is_some_and(|o| o.headless) {
        // Captures advance only after the same real source has finished indexing.
        let result = std::thread::spawn(move || prepare(value).map(Arc::new))
            .join()
            .unwrap_or_else(|_| Err("Could not prepare app code.".into()));
        accept(code, result);
        return;
    }
    if code.worker.is_none() {
        match Worker::new(s.waker.clone()) {
            Ok(worker) => code.worker = Some(worker),
            Err(error) => {
                code.error = Some(error);
                return;
            }
        }
    }
    code.error = None;
    code.pending = true;
    code.worker.as_ref().unwrap().send(code.generation, value);
}
fn accept(code: &mut Code, result: Prepared) {
    code.pending = false;
    match result {
        Ok(source) => {
            code.source = Some(source);
            code.error = None;
        }
        Err(error) => code.error = Some(error),
    }
}
pub fn poll(s: &mut State) -> bool {
    let code = &mut s.pages.apps.code;
    let result = code
        .worker
        .as_ref()
        .and_then(|w| w.output.lock().expect("app code reply").take());
    let Some((generation, result)) = result else {
        return false;
    };
    if generation != code.generation {
        return false;
    }
    accept(code, result);
    true
}
pub fn prepare(mut value: Value) -> Result<Source, String> {
    let Some(files) = value["files"].as_array_mut() else {
        return Err("The app source response did not contain a file list.".into());
    };
    let mut prepared = Vec::with_capacity(files.len());
    for file in files {
        let name = file["name"]
            .as_str()
            .ok_or("An app source file has no name.")?
            .to_owned();
        let text = match file["text"].take() {
            Value::String(text) => text,
            _ => return Err(format!("The source for {name} was not text.")),
        };
        let mut lines = Vec::new();
        let mut at = 0;
        for line in text.split('\n') {
            let end = at + line.len();
            let displayed_end = if line.ends_with('\r') { end - 1 } else { end };
            lines.push(at..displayed_end);
            at = end + 1;
        }
        let mut tokens = vec![Vec::new(); lines.len()];
        let language = match name
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "ts" | "mts" | "cts" => Some("typescript"),
            "tsx" => Some("tsx"),
            "js" | "mjs" | "cjs" | "jsx" => Some("javascript"),
            "json" | "jsonc" => Some("json"),
            "css" => Some("css"),
            "html" | "htm" => Some("html"),
            _ => None,
        };
        if let Some(language) = language {
            let highlighted = rune_kit::syntax::highlight(Some(language), &text);
            for (range, paint) in highlighted.iter() {
                let Paint::Kind(kind) = paint else {
                    continue;
                };
                let first = lines
                    .partition_point(|line| line.end <= range.start)
                    .min(lines.len());
                for n in first..lines.len() {
                    let line = &lines[n];
                    if line.start >= range.end {
                        break;
                    }
                    let start = range.start.max(line.start);
                    let end = range.end.min(line.end);
                    if start < end {
                        tokens[n].push((start - line.start..end - line.start, *kind));
                    }
                }
            }
        }
        prepared.push(Arc::new(File {
            name,
            text,
            lines,
            tokens,
        }));
    }
    let rank = |file: &File| match file.name.as_str() {
        "app.tsx" => 0,
        "server.ts" => 1,
        _ => 2,
    };
    prepared.sort_by(|a, b| rank(a).cmp(&rank(b)).then_with(|| a.name.cmp(&b.name)));
    Ok(Source { files: prepared })
}
fn spans(s: &State, tokens: &[(Range<usize>, Syntax)]) -> Vec<Span> {
    tokens
        .iter()
        .map(|(range, kind)| {
            let token = match kind {
                Syntax::Keyword | Syntax::Type => "syntax-keyword",
                Syntax::String | Syntax::Regex => "syntax-string",
                Syntax::Comment => "syntax-comment",
                Syntax::Punctuation | Syntax::Operator => "syntax-punctuation",
                _ => "text",
            };
            let mut span = Span::new(range.start, range.end);
            span.color = Some(s.theme.c(token));
            if matches!(kind, Syntax::Keyword | Syntax::Type) {
                span.weight = s.theme.tokens["syntax-keyword-weight"].parse().ok();
            }
            span
        })
        .collect()
}
fn line(s: &State, file: &File, n: usize) -> El {
    let mut decorations = spans(s, &file.tokens[n]);
    decorations.extend(find::highlights(s, file, n));
    row()
        .key(format!("app-code-line-{n}"))
        .min_w(0.0)
        .w_full()
        .h(20.4)
        .gap(6.0)
        .child(
            label(&s.theme, (n + 1).to_string(), 12.0, 400.0, "text-tertiary")
                .font(TextStyle::new(12.0, 400.0).mono().lh(20.4))
                .w(file.lines.len().to_string().len() as f32 * 7.2 + 12.0)
                .pr(4.0)
                .fill(s.theme.c("surface"))
                .border_sides([0.0, 1.0, 0.0, 0.0], s.theme.c("border"))
                .align(rune::Align::End),
        )
        .child(
            text(file.text[file.lines[n].clone()].to_owned())
                .key(format!("app-code-text-{n}"))
                .font(TextStyle::new(12.0, 400.0).mono().lh(20.4))
                .color(s.theme.c("text"))
                .spans(decorations)
                .selectable(true),
        )
}
pub fn view(s: &State, id: &str) -> El {
    let code = &s.pages.apps.code;
    let mut body = col()
        .key(format!("app-code-{id}"))
        .w_full()
        .grow(1.0)
        .min_h(0.0);
    if let Some(error) = &code.error {
        body = body.child(
            label(&s.theme, error, 13.0, 400.0, "text-tertiary")
                .w_full()
                .wrap()
                .padding(24.0)
                .role("alert"),
        );
    }
    let Some(source) = &code.source else {
        if code.error.is_some() {
            return body;
        }
        return body.child(
            label(&s.theme, "Loading code…", 13.0, 400.0, "text-tertiary")
                .padding(24.0)
                .role("status"),
        );
    };
    let selected = source
        .files
        .iter()
        .find(|f| f.name == s.pages.apps.selected_file)
        .or(source.files.first());
    let mut tabs = row()
        .w_full()
        .px(12.0)
        .py(6.0)
        .gap(2.0)
        .border_sides([0.0, 0.0, 1.0, 0.0], s.theme.c("border"))
        .scroll_x()
        .role("tablist")
        .label("Files");
    for file in &source.files {
        let name = file.name.clone();
        let active = selected.is_some_and(|f| f.name == name);
        tabs = tabs.child(
            el().key(format!("app-code-file-{name}"))
                .label(&name)
                .focusable(true)
                .h(26.0)
                .px(10.0)
                .radius(7.0)
                .center()
                .hover(s.theme.c("hover"))
                .child(
                    label(
                        &s.theme,
                        &name,
                        12.0,
                        400.0,
                        if active { "text" } else { "text-secondary" },
                    )
                    .font(TextStyle::new(12.0, 400.0).mono()),
                )
                .role("tab")
                .checked(active)
                .fill(if active {
                    s.theme.c("selected")
                } else {
                    rune::Color::TRANSPARENT
                })
                .on_press(move |s: &mut State| s.pages.apps.selected_file = name.clone()),
        );
    }
    body = body.child(tabs);
    if let Some(file) = selected {
        let file = file.clone();
        let copy = file.clone();
        let count = file.lines.len();
        let name = file.name.clone();
        let lines = col()
            .key(format!("app-code-lines-{name}"))
            .w_full()
            .py(4.0)
            .selection_group(true)
            .selection_copy(move |selection| {
                let mut selected = selection.texts().iter().filter(|text| text.is_selected());
                let first = selected.next()?;
                let last = selected.last().unwrap_or(first);
                let index = |text: &rune::SelectedText| {
                    text.key()?
                        .strip_prefix("app-code-text-")?
                        .parse::<usize>()
                        .ok()
                };
                let start = copy.lines.get(index(first)?)?.start + first.range().start;
                let end = copy.lines.get(index(last)?)?.start + last.range().end;
                copy.text.get(start..end).map(str::to_owned)
            })
            .growth(rune::GrowthSpec::default())
            .virtual_rows(
                count,
                20.4,
                move |_: &State, n| std::borrow::Cow::Owned(format!("code-{n}")),
                move |s: &State, n| line(s, &file, n),
            );
        body = body.child(
            col()
                .key("app-code-reader")
                .label("Source code")
                .role("region")
                .read_only(true)
                .focusable(true)
                .on_secondary_press(crate::menus::native::selected_text)
                .on_key(|s: &mut State, event, tx| {
                    if s.pages.apps.code.find.open {
                        find::key(s, event, tx)
                    } else {
                        false
                    }
                })
                .w_full()
                .grow(1.0)
                .min_h(0.0)
                .child(
                    col()
                        .key(format!("app-code-scroll-{name}"))
                        .w_full()
                        .grow(1.0)
                        .min_h(0.0)
                        .scroll_xy()
                        .child(lines),
                ),
        );
    } else {
        body = body.child(el().grow(1.0));
    }
    if code.find.open {
        body = body.child(find::view(s));
    }
    body
}
