//! HTML5 fragment parsing followed by the installed hast-util-sanitize 5.0.2 policy.
//! Never interpret HTML as native UI before this boundary. In particular unknown
//! elements unwrap, only `script` strips its descendants, and CSS/event handlers die.
use html5ever::{QualName, local_name, ns, tendril::TendrilSink};
use markup5ever_rcdom::{Handle, NodeData, RcDom};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Node {
    Text(String),
    Element {
        tag: String,
        attrs: BTreeMap<String, String>,
        children: Vec<Node>,
    },
}

const TAGS: &str = "a b blockquote br code dd del details div dl dt em h1 h2 h3 h4 h5 h6 hr i img input ins kbd li ol p picture pre q rp rt ruby s samp section source span strike strong sub summary sup table tbody td tfoot th thead tr tt ul var";
const GLOBAL: &str = "abbr accept acceptcharset accesskey action align alt axis border cellpadding cellspacing char charoff charset checked clear colspan color cols compact coords datetime dir enctype frame hspace headers height hreflang for id ismap itemprop label lang maxlength media method multiple name nohref noshade nowrap open prompt readonly rev rowspan rows rules scope selected shape size span start summary tabindex title usemap valign value width";
const ARIA: &str = "aria-describedby aria-label aria-labelledby";
fn has(words: &str, word: &str) -> bool {
    words.split_whitespace().any(|v| v == word)
}
fn allowed(tag: &str, key: &str, value: &str) -> bool {
    if key == "accept-charset" || has(GLOBAL, key) {
        return true;
    }
    if has("a dl img ol summary table ul", tag) && has(ARIA, key) {
        return true;
    }
    match (tag, key) {
        ("a", "href" | "data-footnote-ref" | "data-footnote-backref") => true,
        ("blockquote" | "del" | "ins" | "q", "cite") => true,
        ("div", "itemscope" | "itemtype")
        | ("img", "longdesc" | "src")
        | ("section", "data-footnotes")
        | ("source", "srcset") => true,
        ("input", "type") => value == "checkbox",
        ("input", "disabled") => true,
        (_, "class") => match tag {
            "a" => value == "data-footnote-backref",
            "code" => value.starts_with("language-") && value.len() > 9,
            "h2" => value == "sr-only",
            "li" => value == "task-list-item",
            "ol" | "ul" => value == "contains-task-list",
            "section" => value == "footnotes",
            _ => false,
        },
        _ => false,
    }
}
fn safe_protocol(key: &str, value: &str) -> bool {
    let schemes = match key {
        "href" => "http https irc ircs mailto xmpp file",
        "src" => "http https data",
        "cite" | "longdesc" => "http https",
        _ => return true,
    };
    let Some(colon) = value.find(':') else {
        return true;
    };
    // Exactly hast's relative-URL check (a slash, query, or hash before ':').
    if value[..colon].contains(['/', '?', '#']) {
        return true;
    }
    has(schemes, &value[..colon])
}

pub fn sanitize(source: &str) -> Vec<Node> {
    let dom = html5ever::parse_fragment(
        RcDom::default(),
        Default::default(),
        QualName::new(None, ns!(html), local_name!("div")),
        Vec::new(),
        false,
    )
    .one(source);
    fn walk(handle: &Handle, ancestors: &mut Vec<String>, out: &mut Vec<Node>) {
        match &handle.data {
            NodeData::Text { contents } => out.push(Node::Text(contents.borrow().to_string())),
            NodeData::Element { name, attrs, .. } => {
                let tag = name.local.to_string();
                if tag == "script" {
                    return;
                }
                // Match the desktop renderer's bounded element nesting. Flatten
                // only the pathological tail, without recursively walking an
                // attacker-controlled 100,000-element chain on a worker stack.
                if ancestors.len() >= 511 {
                    let mut pending = vec![handle.clone()];
                    while let Some(node) = pending.pop() {
                        match &node.data {
                            NodeData::Text { contents } => {
                                out.push(Node::Text(contents.borrow().to_string()))
                            }
                            NodeData::Element { name, .. } if name.local.as_ref() == "script" => {}
                            _ => pending.extend(node.children.borrow().iter().rev().cloned()),
                        }
                    }
                    return;
                }
                let valid = has(TAGS, &tag)
                    && (!has("tbody td th thead tfoot tr", &tag)
                        || ancestors.iter().any(|a| a == "table"));
                let mut children = Vec::new();
                ancestors.push(tag.clone());
                for child in handle.children.borrow().iter() {
                    walk(child, ancestors, &mut children);
                }
                ancestors.pop();
                if !valid {
                    out.extend(children);
                    return;
                }
                let mut clean = BTreeMap::new();
                for attr in attrs.borrow().iter().filter(|a| a.name.ns.is_empty()) {
                    let key = attr.name.local.to_string();
                    let mut value = attr.value.to_string();
                    if has(
                        "cols colspan height maxlength rows rowspan size span start tabindex width border hspace",
                        &key,
                    ) {
                        if let Ok(number) = value.trim().parse::<f64>() {
                            if number.is_finite() {
                                value = number.to_string();
                            }
                        }
                    }
                    if has("accept coords", &key) {
                        value = value
                            .split(',')
                            .map(str::trim)
                            .filter(|v| !v.is_empty())
                            .collect::<Vec<_>>()
                            .join(" ");
                    } else if has(
                        "accept-charset accesskey headers for itemprop itemtype",
                        &key,
                    ) {
                        value = value.split_whitespace().collect::<Vec<_>>().join(" ");
                    }
                    if key == "class" {
                        value = value
                            .split_whitespace()
                            .filter(|v| allowed(&tag, &key, v))
                            .collect::<Vec<_>>()
                            .join(" ");
                        if value.is_empty() {
                            continue;
                        }
                    } else if !allowed(&tag, &key, &value) || !safe_protocol(&key, &value) {
                        continue;
                    }
                    if has("id name aria-describedby aria-labelledby", &key) {
                        value = if key.starts_with("aria-") {
                            value
                                .split_whitespace()
                                .map(|v| format!("user-content-{v}"))
                                .collect::<Vec<_>>()
                                .join(" ")
                        } else {
                            format!("user-content-{value}")
                        };
                        if key == "id" && value.starts_with("user-content-user-content-") {
                            value = value[13..].to_owned();
                        }
                    }
                    clean.insert(key, value);
                }
                if tag == "input" {
                    clean.insert("disabled".into(), String::new());
                    clean.insert("type".into(), "checkbox".into());
                }
                out.push(Node::Element {
                    tag,
                    attrs: clean,
                    children,
                });
            }
            _ => {
                for child in handle.children.borrow().iter() {
                    walk(child, ancestors, out);
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(&dom.document, &mut Vec::new(), &mut out);
    out
}

/// Canonical sanitized tree, also used by the Bun oracle parity regression.
pub fn canonical(nodes: &[Node]) -> serde_json::Value {
    serde_json::Value::Array(
        nodes
            .iter()
            .map(|n| match n {
                Node::Text(t) => serde_json::json!(t),
                Node::Element {
                    tag,
                    attrs,
                    children,
                } => serde_json::json!([tag, attrs, canonical(children)]),
            })
            .collect(),
    )
}

pub fn markdown(source: &str) -> Vec<Node> {
    let opts = pulldown_cmark::Options::ENABLE_STRIKETHROUGH
        | pulldown_cmark::Options::ENABLE_TABLES
        | pulldown_cmark::Options::ENABLE_TASKLISTS;
    let mut html = String::new();
    pulldown_cmark::html::push_html(&mut html, pulldown_cmark::Parser::new_ext(source, opts));
    sanitize(&html)
}
/// Distinguish actual raw HTML from a '<' inside a code fence/autolink/prose.
pub fn has_html(source: &str) -> bool {
    super::parser::html_start(source).is_some()
}
pub fn fragment_start(source: &str) -> Option<usize> {
    super::parser::html_start(source).map(|at| if source.contains("]:") { 0 } else { at })
}

pub fn plain(nodes: &[Node]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            Node::Text(t) => out.push_str(t),
            Node::Element { tag, children, .. } => {
                if tag == "br" {
                    out.push('\n');
                }
                out.push_str(&plain(children));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn installed_web_sanitizer_parity() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("html-oracle.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let source = case["input"].as_str().unwrap();
            assert_eq!(
                super::canonical(&super::sanitize(source)),
                case["expected"],
                "{source}"
            );
        }
    }
}
