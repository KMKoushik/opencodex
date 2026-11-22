use super::*;

#[test]
fn origin_policy_cannot_escape_through_ports_subdomains_or_native_schemes() {
    let mut policy = Navigation {
        origins: vec!["http://127.0.0.1:4310".into()],
        external_links: true,
        ..Default::default()
    };
    assert_eq!(
        policy.decide("http://127.0.0.1:4310/api/canvas-runtime/frame.html", true),
        Decision::Allow
    );
    assert_eq!(
        policy.decide("http://127.0.0.1:4311/", true),
        Decision::External
    );
    assert_eq!(
        policy.decide("http://127.0.0.1:4311/", false),
        Decision::Block
    );
    assert_eq!(
        policy.decide("http://127.0.0.1.attacker.test:4310/", true),
        Decision::External
    );
    assert_eq!(policy.decide("about:srcdoc", false), Decision::Allow);
    assert_eq!(policy.decide("about:srcdoc", true), Decision::Block);
    policy.hook = Some(Rc::new(|_, _| Decision::Allow));
    for url in [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/html,x",
        "custom-native:open",
    ] {
        assert_eq!(policy.decide(url, true), Decision::Block);
    }
}
