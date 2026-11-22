//! Sanitized HTML inline nodes to native rich-text ranges.
use crate::markdown::{Inline, Style, html::Node, parser};

pub(super) fn inline(nodes: &[Node], out: &mut Inline, pre: bool) {
    for node in nodes {
        match node {
            Node::Text(t) => {
                if pre {
                    out.text.push_str(t);
                } else {
                    for c in t.chars() {
                        if matches!(c, ' ' | '\t' | '\n' | '\r' | '\u{c}') {
                            if !out.text.ends_with([' ', '\n']) {
                                out.text.push(' ');
                            }
                        } else {
                            out.text.push(c);
                        }
                    }
                }
            }
            Node::Element {
                tag,
                attrs,
                children,
            } => {
                if tag == "br" {
                    out.text.push('\n');
                    continue;
                }
                if tag == "source" || tag == "rp" {
                    continue;
                }
                let a = out.text.len();
                let code = tag == "code";
                if code {
                    out.text.push_str(parser::OPEN);
                }
                let start = out.text.len();
                if tag == "q" {
                    out.text.push('“');
                }
                inline(children, out, pre);
                if tag == "q" {
                    out.text.push('”');
                }
                let end = out.text.len();
                if code {
                    out.text.push_str(parser::CLOSE);
                    out.spans.extend([
                        (a, start, Style::CodePad),
                        (start, end, Style::Code),
                        (end, out.text.len(), Style::CodePad),
                    ]);
                }
                let style = match tag.as_str() {
                    "strong" => Some(Style::Strong),
                    "b" => Some(Style::Bold),
                    "em" | "i" | "var" => Some(Style::Em),
                    "s" | "strike" | "del" => Some(Style::Strike),
                    "ins" => Some(Style::Underline),
                    "kbd" | "samp" | "tt" => Some(Style::Mono),
                    "sub" => Some(Style::Sub),
                    "sup" => Some(Style::Sup),
                    "rt" => Some(Style::Small),
                    "a" => Some(Style::Link),
                    _ => None,
                };
                if let Some(style) = style {
                    out.spans.push((a, out.text.len(), style));
                }
                if tag == "a" {
                    out.links.push((
                        a,
                        out.text.len(),
                        attrs.get("href").cloned().unwrap_or_default(),
                    ));
                }
            }
        }
    }
}
