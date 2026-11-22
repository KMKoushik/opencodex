use crate::{
    messages::Messages,
    timeline::{Kind, Projector},
    types::{Event, MessagePage},
};
use serde_json::json;
use std::collections::BTreeMap;

fn event(kind: &str, data: serde_json::Value) -> Event {
    let mut data = data;
    data["sessionID"] = "fixture".into();
    Event {
        r#type: kind.into(),
        data,
        created: 2000.0,
        location: None,
    }
}
#[test]
fn streaming_reduction_preserves_full_prefix_and_finished_message_identity() {
    let mut store = Messages {
        session_id: "fixture".into(),
        ..Default::default()
    };
    let page: MessagePage = serde_json::from_value(json!({"data":[
        {"id":"old","type":"user","time":{"created":1},"text":"Hello"}
    ]}))
    .unwrap();
    store.merge(page, false);
    let old = store.messages[0].clone();
    // Missing started never presents a suffix.
    assert_eq!(
        store.reduce(&event(
            "session.text.delta",
            json!({"assistantMessageID":"reply","ordinal":0,"delta":"suffix"})
        )),
        (false, false)
    );
    store.reduce(&event(
        "session.text.started",
        json!({"assistantMessageID":"reply","ordinal":0}),
    ));
    store.reduce(&event(
        "session.text.delta",
        json!({"assistantMessageID":"reply","ordinal":0,"delta":"Hello"}),
    ));
    assert_eq!(store.messages[1].fields["content"][0]["text"], "Hello");
    let page: MessagePage=serde_json::from_value(json!({"data":[
        {"id":"reply","type":"assistant","time":{"created":2},"content":[{"type":"text","text":"Hello wo"}]},
        {"id":"old","type":"user","time":{"created":1},"text":"Hello"}
    ]})).unwrap();
    store.merge(page, false);
    store.reduce(&event(
        "session.text.delta",
        json!({"assistantMessageID":"reply","ordinal":0,"delta":" world"}),
    ));
    assert_eq!(
        store.messages[1].fields["content"][0]["text"],
        "Hello world"
    );
    // Updating the tail does not clone/redecode earlier messages.
    let before = store.messages[0].clone();
    store.reduce(&event(
        "session.tool.input.started",
        json!({"assistantMessageID":"reply","id":"tool","name":"read"}),
    ));
    store.reduce(&event(
        "session.tool.called",
        json!({"assistantMessageID":"reply","id":"tool","input":{"path":"file.rs"}}),
    ));
    store.reduce(&event("session.tool.success",json!({"assistantMessageID":"reply","id":"tool","content":[{"type":"text","text":"output"}],"metadata":{"lines":4}})));
    assert_eq!(
        store.messages[1].fields["content"][1]["state"]["status"],
        "completed"
    );
    assert!(std::sync::Arc::ptr_eq(&before, &store.messages[0]));
    assert_eq!(old.id, "old");
}
#[test]
fn turns_choose_last_answer_skip_empty_reasoning_and_retain_header_across_prepending() {
    let mut store = Messages::default();
    store.merge(serde_json::from_value(json!({"data":[
        {"id":"idle","type":"idle","time":{"created":5000},"outcome":"interrupted"},
        {"id":"answer","type":"assistant","time":{"created":3000,"completed":4000},"content":[{"type":"text","text":"Final"},{"type":"reasoning","text":""}]},
        {"id":"work","type":"assistant","time":{"created":2000,"completed":3000},"content":[{"type":"reasoning","text":"Reason"},{"type":"tool","id":"read","name":"read","state":{"status":"completed"}},{"type":"text","text":"Progress"}]},
        {"id":"user","type":"user","time":{"created":1000},"text":"Question"}
    ]})).unwrap(),false);
    let mut project = Projector::default();
    let rows = project.project(&store, &BTreeMap::new());
    assert_eq!(rows.len(), 3);
    assert!(matches!(
        rows[1].kind,
        Kind::Turn {
            status: "stopped",
            open: false,
            start: 1000.0,
            end: Some(5000.0)
        }
    ));
    assert!(matches!(&rows[2].kind,Kind::Text {text,copyable:true,..} if text=="Final"));
    let id = rows[1].id.clone();
    let rows = project.project(&store, &BTreeMap::from([(id.clone(), true)]));
    assert_eq!(rows.len(), 5);
    assert_eq!(rows[1].id, id);
    assert!(
        matches!(&rows[2].kind,Kind::Activity {entries,summary,..} if entries.len()==2 && summary=="Read 1 file")
    );
    store.merge(
        serde_json::from_value(
            json!({"data":[{"id":"earlier","type":"user","time":{"created":0},"text":"Older"}]}),
        )
        .unwrap(),
        true,
    );
    let rows = project.project(&store, &BTreeMap::new());
    assert_eq!(rows[2].id, id);
    store.info=Some(serde_json::from_value(json!({"id":"fixture","location":{"directory":"/fixture"},"time":{"created":0},"revert":{"messageID":"user"}})).unwrap());
    let rows = project.project(&store, &BTreeMap::new());
    assert_eq!(
        rows.len(),
        1,
        "revert hides the staged boundary and later responses, not older history"
    );
}
