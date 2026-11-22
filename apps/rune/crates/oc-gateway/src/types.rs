use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelRef {
    pub id: String,
    #[serde(rename = "providerID")]
    pub provider_id: String,
    pub variant: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Project {
    pub id: String,
    pub name: Option<String>,
    pub canonical: String,
    pub icon: Option<ProjectIcon>,
    pub vcs: Option<String>,
}
impl Project {
    pub fn display_name(&self) -> &str {
        self.name
            .as_deref()
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| {
                self.canonical
                    .rsplit('/')
                    .find(|n| !n.is_empty())
                    .unwrap_or(&self.canonical)
            })
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ProjectIcon {
    pub url: Option<String>,
    pub r#override: Option<String>,
    pub color: Option<String>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct Times {
    pub created: f64,
    pub updated: Option<f64>,
    pub idle: Option<f64>,
    pub viewed: Option<f64>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub directory: String,
    #[serde(rename = "projectID")]
    pub project_id: Option<String>,
    pub updated_at: f64,
    pub time: Times,
    pub unread: Option<String>,
    pub pinned: Option<f64>,
    pub done: Option<f64>,
    pub muted: Option<bool>,
    pub model: Option<String>,
    pub fork: Option<Value>,
}
impl Session {
    pub fn activity(&self) -> f64 {
        self.time.idle.unwrap_or(self.time.created)
    }
    pub fn unread(&self) -> bool {
        self.unread.is_some() || self.time.idle.unwrap_or(0.0) > self.time.viewed.unwrap_or(0.0)
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPage {
    pub sessions: Vec<Session>,
    pub next_cursor: Option<String>,
    pub search_notice: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Location {
    pub directory: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: Option<String>,
    #[serde(rename = "projectID")]
    pub project_id: Option<String>,
    #[serde(rename = "parentID")]
    pub parent_id: Option<String>,
    pub location: Location,
    pub time: Times,
    pub model: Option<ModelRef>,
    pub metadata: Option<Value>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Connection {
    pub status: String,
    pub version: Option<String>,
    pub message: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MessagePage {
    pub data: Vec<Message>,
    pub cursor: Option<Cursor>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Cursor {
    pub previous: Option<String>,
    pub next: Option<String>,
}
/// Unknown message/part kinds and fields survive decoding for future capabilities.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Message {
    pub id: String,
    pub r#type: String,
    pub time: Times,
    #[serde(flatten)]
    pub fields: BTreeMap<String, Value>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Event {
    pub r#type: String,
    #[serde(default)]
    pub created: f64,
    #[serde(default)]
    pub data: Value,
    pub location: Option<Location>,
}
pub type Active = BTreeMap<String, Value>;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalog {
    pub data: Vec<Model>,
    pub default_model: Option<ModelRef>,
    #[serde(default)]
    pub providers: Vec<Provider>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Model {
    pub id: String,
    pub name: String,
    #[serde(rename = "providerID", default)]
    pub provider_id: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub variants: Vec<Variant>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Variant {
    pub id: String,
}
