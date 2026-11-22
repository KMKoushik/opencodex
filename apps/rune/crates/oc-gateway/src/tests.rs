use super::*;
use serde_json::json;

#[test]
fn failed_page_preserves_cursors_rows_and_live_connection() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let client = Gateway::new(&format!("http://{}", listener.local_addr().unwrap()), None).unwrap();
    drop(listener);
    let mut snapshot = Snapshot {
        live: true,
        ..Default::default()
    };
    snapshot.cursors.insert("/fixture".into(), "next".into());
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(snapshot.more(&client, "/fixture"));
    assert_eq!(snapshot.cursors["/fixture"], "next");
    assert!(snapshot.live);
    assert_eq!(snapshot.page_results["/fixture"].0, 1);
    assert!(snapshot.page_results["/fixture"].1.is_some());
    assert!(snapshot.error.is_none());
}

#[test]
fn live_rows_reduce_without_refetch_or_token_delta_wakes() {
    let mut s = Snapshot::default();
    let event = |kind: &str, created, data| types::Event {
        r#type: kind.into(),
        created,
        data,
        location: None,
    };
    assert!(s.reduce(event(
        "session.created",
        100.0,
        json!({"sessionID":"thread", "title":"First", "location":{"directory":"/fixture"}})
    )));
    assert!(!s.reduce(event(
        "session.created",
        101.0,
        json!({"sessionID":"child", "parentID":"thread", "location":{"directory":"/fixture"}})
    )));
    assert!(s.reduce(event(
        "session.renamed",
        102.0,
        json!({"sessionID":"thread", "title":"Renamed"})
    )));
    assert_eq!(s.sessions["thread"].title, "Renamed");
    assert!(s.reduce(event(
        "session.execution.started",
        103.0,
        json!({"sessionID":"thread"})
    )));
    assert!(s.active.contains("thread"));
    assert!(!s.reduce(event(
        "session.text.delta",
        104.0,
        json!({"sessionID":"thread", "delta":"token"})
    )));
    assert!(s.reduce(event(
        "session.execution.succeeded",
        105.0,
        json!({"sessionID":"thread"})
    )));
    assert!(!s.active.contains("thread"));
    assert!(s.sessions["thread"].unread());
    assert!(s.reduce(event(
        "session.viewed",
        106.0,
        json!({"sessionID":"thread", "idle":105})
    )));
    assert!(!s.sessions["thread"].unread());
    assert!(s.reduce(event(
        "session.deleted",
        107.0,
        json!({"sessionID":"thread"})
    )));
    assert!(s.sessions.is_empty());
    assert_eq!(
        s.workspace_revision, 0,
        "token deltas never invalidate workspace data"
    );
    assert!(s.reduce(event(
        "filesystem.changed",
        108.0,
        json!({"path":"source.rs"})
    )));
    assert_eq!(s.workspace_revision, 1);
}

#[test]
fn sse_survives_fragmented_utf8_crlf_comments_and_multiline_data() {
    let mut parser = sse::Parser::default();
    let raw = ": heartbeat\r\nevent: opencode\r\ndata: café\r\ndata: second\r\n\r\n";
    let mut events = Vec::new();
    for byte in raw.bytes() {
        events.extend(parser.push(&[byte]).unwrap());
    }
    assert_eq!(events, vec![("opencode".into(), "café\nsecond".into())]);
}
