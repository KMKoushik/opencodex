//! Native layout of sanitized HTML. No webview, CSS, or executable attributes.
use super::super::*;
use crate::markdown::html::{Node, plain};
#[path = "html_inline.rs"]
mod inline_nodes;
use inline_nodes::inline;

fn block(node: &Node) -> bool {
    matches!(node, Node::Element { tag, .. } if matches!(tag.as_str(), "blockquote" | "dd" | "details" | "div" | "dl" | "dt" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "hr" | "li" | "ol" | "p" | "pre" | "section" | "summary" | "table" | "ul" | "img" | "picture"))
}
impl Renderer {
    pub(in crate::markdown) fn html_nodes(&self, nodes: &[Node], root: bool, path: &str) -> El {
        let mut result = col().w_full();
        let mut run = Vec::new();
        let mut count = 0;
        let flush = |run: &mut Vec<Node>, result: El, count: &mut usize| {
            if run.is_empty() {
                return result;
            }
            if run
                .iter()
                .any(|n| matches!(n,Node::Element {tag,..} if tag=="input"||tag=="ruby"))
            {
                let mut line = row().flex_wrap().center_y();
                let mut text = Vec::new();
                for n in run.drain(..) {
                    if matches!(&n,Node::Element {tag,..} if tag=="input"||tag=="ruby") {
                        if !text.is_empty() {
                            let mut inl = Inline::default();
                            inline(&text, &mut inl, false);
                            line = line.child(self.html_piece(&inl));
                            text.clear();
                        }
                        line = line.child(self.html_element(&n, path));
                    } else {
                        text.push(n);
                    }
                }
                if !text.is_empty() {
                    let mut inl = Inline::default();
                    inline(&text, &mut inl, false);
                    line = line.child(self.html_piece(&inl));
                }
                *count += 1;
                return result.child(line);
            }
            let mut inl = Inline::default();
            inline(run, &mut inl, false);
            run.clear();
            if inl.text.trim().is_empty() {
                return result;
            }
            *count += 1;
            result.child(self.html_inline(&inl, self.s.body))
        };
        for (i, node) in nodes.iter().enumerate() {
            if !block(node) {
                run.push(node.clone());
                continue;
            }
            result = flush(&mut run, result, &mut count);
            let top = if root && count > 0 {
                if matches!(node, Node::Element {tag, ..} if matches!(tag.as_str(), "h1"|"h2"|"h3"|"h4"))
                {
                    24.0
                } else {
                    16.0
                }
            } else {
                0.0
            };
            result = result.child(self.html_element(node, &format!("{path}/{i}")).mt(top));
            count += 1;
        }
        flush(&mut run, result, &mut count)
    }

    fn html_inline(&self, inl: &Inline, font: TextStyle) -> El {
        if self.s.web_inline.is_some() {
            return self.para(inl, None, font, self.flow.get().ink.unwrap_or(self.s.text));
        }
        // Baseline-shifted runs are emitted as native text pieces. Ordinary
        // paragraphs retain one rich-text node and its selection/link geometry.
        if !inl
            .spans
            .iter()
            .any(|s| matches!(s.2, Style::Sub | Style::Sup | Style::Small))
        {
            return self.para(inl, None, font, self.flow.get().ink.unwrap_or(self.s.text));
        }
        let mut row = row().flex_wrap().w_full();
        let mut cuts = vec![0, inl.text.len()];
        for &(a, b, _) in &inl.spans {
            cuts.extend([a, b]);
        }
        cuts.sort_unstable();
        cuts.dedup();
        for edge in cuts.windows(2) {
            let (a, b) = (edge[0], edge[1]);
            if a == b {
                continue;
            }
            let mut part = Inline {
                text: inl.text[a..b].into(),
                ..Inline::default()
            };
            let mut shift = 0.0;
            for &(x, y, st) in &inl.spans {
                if x <= a && b <= y {
                    part.spans.push((0, b - a, st));
                    shift = match st {
                        Style::Sub => font.size * 0.2,
                        Style::Sup => -font.size * 0.35,
                        Style::Small => -font.size * 0.5,
                        _ => shift,
                    };
                }
            }
            for (x, y, url) in &inl.links {
                if *x <= a && b <= *y {
                    part.links.push((0, b - a, url.clone()));
                }
            }
            row = row.child(
                self.select_inline(
                    rich(part.text.clone(), self.spans(&part, font))
                        .font(font)
                        .color(self.s.text)
                        .offset(0.0, shift),
                    &part,
                    None,
                ),
            );
        }
        row
    }
    fn html_piece(&self, inl: &Inline) -> El {
        let width =
            rune::text::measure(&inl.text, &self.spans(inl, self.s.body), self.s.body, None).0;
        self.html_inline(inl, self.s.body).w(width).shrink()
    }

    fn html_element(&self, node: &Node, path: &str) -> El {
        let Node::Element {
            tag,
            attrs,
            children,
        } = node
        else {
            return el();
        };
        if tag == "h2"
            && attrs
                .get("class")
                .is_some_and(|c| c.split_whitespace().any(|c| c == "sr-only"))
        {
            return el()
                .absolute(-1.0, -1.0)
                .size(1.0, 1.0)
                .opacity(0.0)
                .role("heading")
                .level(2)
                .label(plain(children));
        }
        let s = &self.s;
        let content = || self.html_nodes(children, false, path);
        let mut e = match tag.as_str() {
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                let level = tag[1..].parse::<usize>().unwrap();
                let mut inl = Inline::default();
                inline(children, &mut inl, false);
                // Tailwind preflight resets h5/h6 to inherited size and weight.
                self.html_inline(
                    &inl,
                    if level <= 4 {
                        s.headings[level - 1]
                    } else {
                        s.body
                    },
                )
                .role("heading")
                .level(level as u32)
            }
            "p" | "summary" => {
                if children.iter().any(block)
                    || children
                        .iter()
                        .any(|n| matches!(n,Node::Element {tag,..} if tag=="input"||tag=="ruby"))
                {
                    content()
                } else {
                    let mut inl = Inline::default();
                    inline(children, &mut inl, false);
                    self.html_inline(&inl, s.body)
                }
            }
            "pre" => self
                .code(plain(children).trim_end_matches('\n'), None, None, false)
                .radius(10.0)
                .border(1.0, s.code_block_border)
                .border_layout(),
            "hr" => el().w_full().h(1.0).fill(s.text),
            "img" => {
                // StreamText's img component explicitly drops width/height/title;
                // the sanitizer allows them, the 96x76 ImageAttachment ignores them.
                let src = attrs.get("src").map(String::as_str).unwrap_or("");
                let src = if src.starts_with("data:")
                    && !["png", "jpeg", "gif", "webp", "svg+xml"]
                        .iter()
                        .any(|t| src.starts_with(&format!("data:image/{t};base64,")))
                {
                    ""
                } else {
                    src
                };
                self.image(src, attrs.get("alt").map(String::as_str).unwrap_or(""), "")
            }
            "input" => el()
                .size(13.0, 13.0)
                .border(1.0, s.muted.alpha(0.35))
                .radius(2.0)
                .fill(s.muted.alpha(if attrs.contains_key("checked") {
                    0.45
                } else {
                    0.1
                }))
                .center()
                .child(if attrs.contains_key("checked") {
                    icon(s.task.check, 10.0).color(s.text.alpha(0.5))
                } else {
                    el()
                })
                .role("checkbox")
                .checked(attrs.contains_key("checked"))
                .read_only(true),
            "ruby" => {
                let base: Vec<_> = children
                    .iter()
                    .filter(|n| !matches!(n,Node::Element {tag,..} if tag=="rt"||tag=="rp"))
                    .cloned()
                    .collect();
                let annotation: Vec<_> = children
                    .iter()
                    .filter_map(|n| match n {
                        Node::Element { tag, children, .. } if tag == "rt" => Some(plain(children)),
                        _ => None,
                    })
                    .collect();
                let base = plain(&base);
                let annotation = annotation.join("");
                let small = TextStyle {
                    size: s.body.size * 0.5,
                    ..s.body
                };
                let width = rune::text::measure(&base, &[], s.body, None)
                    .0
                    .max(rune::text::measure(&annotation, &[], small, None).0);
                el().w(width)
                    .h(s.body.line_height)
                    .child(
                        text(base)
                            .font(s.body)
                            .color(s.text)
                            .w_full()
                            .align(Align::Center),
                    )
                    .child(
                        text(annotation)
                            .font(small)
                            .color(s.text)
                            .w(width)
                            .align(Align::Center)
                            .absolute(0.0, -s.body.size * 0.65),
                    )
            }
            "blockquote" => {
                let old = self.flow.get();
                self.flow.set(super::Flow {
                    ink: s.quote.text.or(old.ink),
                    ..old
                });
                let body = content();
                self.flow.set(old);
                row()
                    .w_full()
                    .child(el().w(s.quote.width).h_full().fill(s.quote_rule))
                    .child(body.pl(s.quote.pad).grow(1.0).shrink())
            }
            "ol" | "ul" => {
                let mut list = col().w_full().role("list");
                let start = if tag == "ol" {
                    Some(
                        attrs
                            .get("start")
                            .and_then(|v| v.parse::<i64>().ok())
                            .unwrap_or(1),
                    )
                } else {
                    None
                };
                let mut index = 0;
                let mut counter = start.unwrap_or(1);
                for (i, child) in children.iter().enumerate() {
                    if matches!(child, Node::Text(t) if t.trim().is_empty()) {
                        continue;
                    }
                    let old = self.flow.get();
                    self.flow.set(super::Flow {
                        inset: old.inset + s.list_indent,
                        ..old
                    });
                    let body = self.html_element(child, &format!("{path}/{i}"));
                    self.flow.set(old);
                    if let Node::Element { attrs, .. } = child {
                        if let Some(value) = attrs.get("value").and_then(|v| v.parse::<i64>().ok())
                        {
                            counter = value;
                        }
                    }
                    let marker = start.map_or_else(
                        || {
                            el().w(s.list_indent)
                                .h(s.body.line_height)
                                .child(el().outside_list_disc(s.body).fill(s.text))
                        },
                        |_| {
                            text(format!("{counter}."))
                                .font(s.body)
                                .w(s.list_indent)
                                .pr(6.0)
                                .align(Align::End)
                                .color(s.text)
                        },
                    );
                    list = list.child(
                        row()
                            .w_full()
                            .mt(if index == 0 { 0.0 } else { s.list_gap })
                            .child(marker.a11y_hidden())
                            .child(body.grow(1.0).shrink()),
                    );
                    index += 1;
                    counter = counter.saturating_add(1);
                }
                list
            }
            "details" => {
                let summary = children
                    .iter()
                    .position(|n| matches!(n,Node::Element {tag,..} if tag == "summary"));
                let header = summary.map_or_else(
                    || text("Details").font(s.body).color(s.text),
                    |i| self.html_element(&children[i], &format!("{path}/summary")),
                );
                let body: Vec<_> = children
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| Some(*i) != summary)
                    .map(|(_, n)| n.clone())
                    .collect();
                let body = self.html_nodes(&body, false, path);
                if let Some(f) = &self.html_details {
                    f(header, body, path, attrs.contains_key("open"))
                } else {
                    col()
                        .w_full()
                        .child(header)
                        .child(if attrs.contains_key("open") {
                            body
                        } else {
                            el()
                        })
                }
            }
            "table" => self.html_table(children, path),
            _ => content(),
        };
        if tag == "table" || tag == "img" {
            return e.key(path.to_owned());
        }
        if let Some(label) = attrs.get("aria-label") {
            e = e.label(label.clone());
        }
        if let Some(title) = attrs.get("title") {
            e = e.help(title.clone());
        }
        if let Some(dir) = attrs.get("dir") {
            if let Some(dir) = match dir.to_ascii_lowercase().as_str() {
                "rtl" => Some(rune::Direction::Rtl),
                "ltr" => Some(rune::Direction::Ltr),
                "auto" => Some(rune::Direction::Auto),
                _ => None,
            } {
                e = e.dir(dir);
            }
        }
        e.key(path.to_owned())
    }

    fn html_table(&self, nodes: &[Node], path: &str) -> El {
        fn rows<'a>(nodes: &'a [Node], out: &mut Vec<&'a Vec<Node>>) {
            for n in nodes {
                if let Node::Element { tag, children, .. } = n {
                    if tag == "tr" {
                        out.push(children);
                    } else {
                        rows(children, out);
                    }
                }
            }
        }
        let mut rs = Vec::new();
        rows(nodes, &mut rs);
        if rs.iter().flat_map(|r|r.iter()).any(|n|matches!(n,Node::Element {attrs,..} if attrs.get("colspan").is_some_and(|v|v!="1")||attrs.get("rowspan").is_some_and(|v|v!="1"))) {
            return self.html_spanned_table(&rs,path);
        }
        let mut widths: Vec<f32> = Vec::new();
        for cells in &rs {
            for (i, cell) in cells
                .iter()
                .filter(|n| matches!(n,Node::Element {tag,..} if tag=="td"||tag=="th"))
                .enumerate()
            {
                if widths.len() <= i {
                    widths.push(0.0);
                }
                let Node::Element { tag, children, .. } = cell else {
                    continue;
                };
                let font = if tag == "th" {
                    TextStyle {
                        weight: 600.0,
                        ..self.s.body
                    }
                } else {
                    self.s.body
                };
                widths[i] = widths[i].max(self.html_intrinsic(children, font) + 24.0);
            }
        }
        let total: f32 = widths.iter().sum();
        let avail = self.s.text_width.unwrap_or(total);
        if total < avail && total > 0.0 {
            for w in &mut widths {
                *w *= avail / total;
            }
        }
        let mut table = col();
        for (r, cells) in rs.iter().enumerate() {
            let mut row = row();
            for (c, cell) in cells
                .iter()
                .filter(|n| matches!(n,Node::Element {tag,..} if tag=="td"||tag=="th"))
                .enumerate()
            {
                let Node::Element { tag, children, .. } = cell else {
                    continue;
                };
                let old = self.flow.get();
                self.flow.set(super::Flow {
                    inset: self.s.text_width.unwrap_or(avail) - (widths[c] - 24.0),
                    ..old
                });
                let body = if tag == "th" && !children.iter().any(block) {
                    let mut inl = Inline::default();
                    inline(children, &mut inl, false);
                    self.html_inline(
                        &inl,
                        TextStyle {
                            weight: 600.0,
                            ..self.s.body
                        },
                    )
                } else {
                    self.html_nodes(children, false, &format!("{path}/{r}/{c}"))
                };
                self.flow.set(old);
                row = row.child(
                    col()
                        .w(widths[c])
                        .px(12.0)
                        .pt(10.0)
                        .pb(if r == 0 { 10.5 } else { 11.0 })
                        .border_sides(
                            [0.0, 0.0, 1.0, 0.0],
                            if tag == "th" {
                                self.s.table_head_rule.unwrap_or(self.s.table_rule)
                            } else {
                                self.s.table_rule
                            },
                        )
                        .child(body),
                );
            }
            table = table.child(row);
        }
        el().w_full()
            .scroll_x()
            .role("region")
            .label("Table")
            .focusable(true)
            .focus_ring(2.0, 2.0, self.s.accent)
            .child(table)
    }

    fn html_intrinsic(&self, nodes: &[Node], font: TextStyle) -> f32 {
        let mut max = 0.0f32;
        let mut run = Vec::new();
        let flush = |run: &mut Vec<Node>, max: &mut f32| {
            let mut inl = Inline::default();
            inline(run, &mut inl, false);
            run.clear();
            *max = max.max(
                rune::text::content_widths(
                    inl.text.trim_end_matches([' ', '\n', '\r', '\t']),
                    &self.spans(&inl, font),
                    font,
                )
                .1,
            );
        };
        for n in nodes {
            if block(n) {
                flush(&mut run, &mut max);
                if let Node::Element { tag, children, .. } = n {
                    max = max.max(
                        self.html_intrinsic(children, font)
                            + if tag == "ul" || tag == "ol" {
                                self.s.list_indent
                            } else {
                                0.0
                            },
                    );
                }
            } else {
                run.push(n.clone());
            }
        }
        flush(&mut run, &mut max);
        max
    }

    fn html_height(&self, nodes: &[Node], width: f32, font: TextStyle) -> f32 {
        let mut height = 0.0;
        let mut run = Vec::new();
        let flush = |run: &mut Vec<Node>, height: &mut f32| {
            let mut inl = Inline::default();
            inline(run, &mut inl, false);
            run.clear();
            if inl.text.trim().is_empty() {
                return;
            }
            *height += rune::text::measure(
                &inl.text,
                &self.spans(&inl, font),
                font,
                Some(width.max(1.0)),
            )
            .1;
            if inl.spans.iter().any(|s| s.2 == Style::Code) {
                *height += self.s.web_inline.map_or(0.0, |v| v[0]);
            }
        };
        for node in nodes {
            if !block(node) {
                run.push(node.clone());
                continue;
            }
            flush(&mut run, &mut height);
            if let Node::Element {
                tag,
                children,
                attrs,
            } = node
            {
                height += match tag.as_str() {
                    "ul" | "ol" => children
                        .iter()
                        .filter_map(|n| match n {
                            Node::Element { tag, children, .. } if tag == "li" => {
                                Some(self.html_height(children, width - self.s.list_indent, font))
                            }
                            _ => None,
                        })
                        .enumerate()
                        .map(|(i, h)| h + if i > 0 { self.s.list_gap } else { 0.0 })
                        .sum(),
                    "blockquote" => self.html_height(
                        children,
                        width - self.s.quote.width - self.s.quote.pad,
                        font,
                    ),
                    "img" => attrs
                        .get("src")
                        .and_then(|src| self.images.as_ref().and_then(|f| f(src)))
                        .and_then(|i| i.size())
                        .map_or(0.0, |[w, h]| {
                            h as f32 * (width / w as f32).min(560.0 / h as f32).min(1.0)
                        }),
                    "hr" => 1.0,
                    _ => self.html_height(children, width, font),
                };
            }
        }
        flush(&mut run, &mut height);
        height
    }

    fn html_spanned_table(&self, rows: &[&Vec<Node>], path: &str) -> El {
        struct Cell<'a> {
            tag: &'a str,
            nodes: &'a [Node],
            row: usize,
            col: usize,
            rs: usize,
            cs: usize,
        }
        let mut cells = Vec::new();
        let mut occupied = Vec::new();
        let mut columns = 0;
        for (r, nodes) in rows.iter().enumerate() {
            let mut col = 0;
            for node in nodes.iter() {
                let Node::Element {
                    tag,
                    attrs,
                    children,
                } = node
                else {
                    continue;
                };
                if tag != "td" && tag != "th" {
                    continue;
                }
                while occupied.get(col).is_some_and(|until| *until > r) {
                    col += 1;
                }
                let cs = attrs
                    .get("colspan")
                    .and_then(|v| v.parse::<usize>().ok())
                    .unwrap_or(1)
                    .clamp(1, 1000);
                let rs = attrs
                    .get("rowspan")
                    .and_then(|v| v.parse::<usize>().ok())
                    .map(|v| if v == 0 { rows.len() - r } else { v })
                    .unwrap_or(1)
                    .clamp(1, rows.len() - r);
                occupied.resize(occupied.len().max(col + cs), 0);
                for slot in &mut occupied[col..col + cs] {
                    *slot = r + rs;
                }
                cells.push(Cell {
                    tag,
                    nodes: children,
                    row: r,
                    col,
                    rs,
                    cs,
                });
                col += cs;
                columns = columns.max(col);
            }
        }
        let mut widths = vec![0.0f32; columns];
        for c in &cells {
            let font = TextStyle {
                weight: if c.tag == "th" {
                    600.0
                } else {
                    self.s.body.weight
                },
                ..self.s.body
            };
            let need = self.html_intrinsic(c.nodes, font) + 24.0;
            let old: f32 = widths[c.col..c.col + c.cs].iter().sum();
            if need > old {
                for w in &mut widths[c.col..c.col + c.cs] {
                    *w += (need - old) / c.cs as f32;
                }
            }
        }
        let total: f32 = widths.iter().sum();
        let avail = self.s.text_width.unwrap_or(total);
        if total > 0.0 && total < avail {
            for w in &mut widths {
                *w *= avail / total;
            }
        }
        let mut heights = vec![0.0f32; rows.len()];
        for c in &cells {
            let width: f32 = widths[c.col..c.col + c.cs].iter().sum();
            let font = TextStyle {
                weight: if c.tag == "th" {
                    600.0
                } else {
                    self.s.body.weight
                },
                ..self.s.body
            };
            let need = self.html_height(c.nodes, width - 24.0, font)
                + 20.0
                + if c.row == 0 { 0.5 } else { 1.0 };
            let old: f32 = heights[c.row..c.row + c.rs].iter().sum();
            if need > old {
                for h in &mut heights[c.row..c.row + c.rs] {
                    *h += (need - old) / c.rs as f32;
                }
            }
        }
        let mut grid = el().w(widths.iter().sum()).h(heights.iter().sum());
        for (i, c) in cells.iter().enumerate() {
            let x: f32 = widths[..c.col].iter().sum();
            let y: f32 = heights[..c.row].iter().sum();
            let width: f32 = widths[c.col..c.col + c.cs].iter().sum();
            let height: f32 = heights[c.row..c.row + c.rs].iter().sum();
            let old = self.flow.get();
            self.flow.set(super::Flow {
                inset: self.s.text_width.unwrap_or(avail) - width + 24.0,
                ..old
            });
            let body = if c.tag == "th" && !c.nodes.iter().any(block) {
                let mut inl = Inline::default();
                inline(c.nodes, &mut inl, false);
                self.html_inline(
                    &inl,
                    TextStyle {
                        weight: 600.0,
                        ..self.s.body
                    },
                )
            } else {
                self.html_nodes(c.nodes, false, &format!("{path}/{i}"))
            };
            self.flow.set(old);
            grid = grid.child(
                col()
                    .absolute(x, y)
                    .size(width, height)
                    .px(12.0)
                    .py(10.0)
                    .border_sides(
                        [0.0, 0.0, 1.0, 0.0],
                        if c.tag == "th" {
                            self.s.table_head_rule.unwrap_or(self.s.table_rule)
                        } else {
                            self.s.table_rule
                        },
                    )
                    .child(body),
            );
        }
        el().w_full()
            .scroll_x()
            .role("region")
            .label("Table")
            .focusable(true)
            .focus_ring(2.0, 2.0, self.s.accent)
            .child(grid)
    }
}
