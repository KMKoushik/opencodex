//! The desktop's resolveFileLink algorithm: resolve against the service filesystem,
//! percent-decode before normalizing, and allow links outside the current checkout.
pub fn file_target(href: &str, directory: &str) -> Option<(String, String)> {
    if href.is_empty() || href.starts_with('#') || href.starts_with("//") {
        return None;
    }
    let base = url::Url::from_directory_path(directory).ok()?;
    let url = base.join(href).ok()?;
    if url.scheme() != "file" || url.host_str().is_some_and(|host| host != "localhost") {
        return None;
    }
    let path = url.to_file_path().ok()?;
    let decoded = path.to_str()?;
    if decoded.contains(['\0', '\\']) || decoded.ends_with('/') {
        return None;
    }
    let mut segments = Vec::new();
    for part in decoded.split('/') {
        match part {
            ".." => {
                segments.pop();
            }
            "" | "." => {}
            _ => segments.push(part),
        }
    }
    let absolute = format!("/{}", segments.join("/"));
    let root = directory.trim_end_matches('/');
    if let Some(relative) = absolute.strip_prefix(&format!("{root}/")) {
        return Some((directory.into(), relative.into()));
    }
    let name = segments.pop()?;
    Some((format!("/{}", segments.join("/")), name.into()))
}

#[test]
fn links_use_service_paths_and_normalize_encoded_traversal() {
    for (href, expected) in [
        ("src/main.rs#L12", Some(("/project", "src/main.rs"))),
        (
            "../other/notes%20file.md",
            Some(("/other", "notes file.md")),
        ),
        ("file:///outside/README.md", Some(("/outside", "README.md"))),
        ("src/%2e%2e/%2e%2e/other.txt", Some(("/", "other.txt"))),
        ("https://example.org", None),
        ("file://remote/share/file", None),
        ("src/%00secret", None),
        ("src/%5csecret", None),
        ("#section", None),
        ("//example.org/file", None),
    ] {
        assert_eq!(
            file_target(href, "/project"),
            expected.map(|(d, p)| (d.into(), p.into())),
            "{href}"
        );
    }
}
