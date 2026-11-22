//! Native cumulative usage events patch the cached traversal; no HTTP per step.
use serde_json::Value;
use std::collections::BTreeMap;
pub fn apply(
    values: &mut BTreeMap<String, Result<Value, String>>,
    root: &str,
    updates: BTreeMap<String, Value>,
) -> bool {
    let mut changed = false;
    for (id, usage) in updates {
        let Some(cost) = usage["cost"].as_f64() else {
            continue;
        };
        if id == root {
            if let Some(Ok(session)) = values.get_mut("session") {
                session["cost"] = Value::from(cost);
                if usage["tokens"].is_object() {
                    session["tokens"] = usage["tokens"].clone();
                }
                changed = true;
            }
        } else if let Some(Ok(costs)) = values.get_mut("costs") {
            if let (Some(old), Some(total)) = (costs["byID"][&id].as_f64(), costs["cost"].as_f64())
            {
                costs["cost"] = Value::from((total - old + cost).max(0.0));
                costs["byID"][&id] = Value::from(cost);
                if let Some(children) = costs["children"].as_array_mut() {
                    for child in children {
                        if child["id"] == id {
                            child["cost"] = Value::from(cost);
                        }
                    }
                }
                changed = true;
            }
        }
    }
    changed
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cumulative_usage_is_not_added_twice() {
        let mut values = BTreeMap::from([(
            "costs".into(),
            Ok(
                serde_json::json!({"cost":3.0,"byID":{"child":3.0},"children":[{"id":"child","cost":3.0}]}),
            ),
        )]);
        for _ in 0..2 {
            assert!(apply(
                &mut values,
                "root",
                BTreeMap::from([("child".into(), serde_json::json!({"cost":4.0}))])
            ));
        }
        assert_eq!(values["costs"].as_ref().unwrap()["cost"], 4.0);
    }
}
