use crate::types::*;
use reqwest::{Client, Method, Response, Url};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Clone)]
pub struct Gateway {
    http: Client,
    base: Url,
    token: Option<String>,
}
impl Gateway {
    pub fn new(base: &str, token: Option<String>) -> Result<Self, String> {
        let mut base = Url::parse(base).map_err(|e| e.to_string())?;
        if !matches!(base.scheme(), "http" | "https") || base.host_str().is_none() {
            return Err("OPENCODEX_GATEWAY must be an HTTP(S) gateway URL".into());
        }
        base.set_path(&format!("{}/api/", base.path().trim_end_matches('/')));
        base.set_query(None);
        base.set_fragment(None);
        Ok(Self {
            http: Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .user_agent("OpenCodex Rune")
                .build()
                .map_err(|e| e.to_string())?,
            base,
            token,
        })
    }
    fn url(&self, path: &str, query: &[(&str, &str)]) -> Url {
        let mut url = self.base.clone();
        // Push segments rather than joining URLs: ids can never replace the origin/path.
        url.path_segments_mut()
            .expect("HTTP URL")
            .pop_if_empty()
            .extend(path.trim_start_matches('/').split('/'));
        url.query_pairs_mut().extend_pairs(query.iter().copied());
        url
    }
    pub(crate) async fn response(
        &self,
        path: &str,
        query: &[(&str, &str)],
        method: Method,
        body: Option<Value>,
        stream: bool,
    ) -> Result<Response, String> {
        let mut req = self.http.request(method, self.url(path, query));
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        if let Some(body) = body {
            req = req.json(&body);
        }
        if stream {
            req = req.header("Accept", "text/event-stream");
        } else {
            req = req.timeout(Duration::from_secs(30));
        }
        let res = req.send().await.map_err(|e| e.to_string())?;
        if res.status().is_success() {
            return Ok(res);
        }
        let status = res.status();
        let message = res
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| v["message"].as_str().map(str::to_owned));
        Err(format!(
            "Gateway {status}: {}",
            message.as_deref().unwrap_or("request failed")
        ))
    }
    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, String> {
        self.response(path, query, Method::GET, None, false)
            .await?
            .json()
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn post<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T, String> {
        self.response(path, &[], Method::POST, Some(body), false)
            .await?
            .json()
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn connection(&self) -> Result<Connection, String> {
        self.get("connection", &[]).await
    }
    pub async fn connect(&self) -> Result<Connection, String> {
        self.post("connection", json!({})).await
    }
    pub async fn projects(&self) -> Result<Vec<Project>, String> {
        self.get("projects", &[]).await
    }
    pub async fn add_project(&self, directory: &str) -> Result<Project, String> {
        self.post("projects", json!({"directory": directory})).await
    }
    pub async fn sessions(
        &self,
        directory: &str,
        cursor: Option<&str>,
    ) -> Result<SessionPage, String> {
        let mut q = vec![("directory", directory)];
        if let Some(cursor) = cursor {
            q.push(("cursor", cursor));
        }
        self.get("sessions", &q).await
    }
    pub async fn project_sessions(
        &self,
        project: &str,
        cursor: Option<&str>,
    ) -> Result<SessionPage, String> {
        let mut q = vec![("project", project)];
        if let Some(cursor) = cursor {
            q.push(("cursor", cursor));
        }
        self.get("sessions", &q).await
    }
    pub async fn active(&self) -> Result<Active, String> {
        self.get("sessions/active", &[]).await
    }
    pub async fn session(&self, id: &str) -> Result<SessionInfo, String> {
        self.get(&format!("sessions/{id}"), &[]).await
    }
    pub async fn messages(&self, id: &str, cursor: Option<&str>) -> Result<MessagePage, String> {
        let q = cursor.map(|c| vec![("cursor", c)]).unwrap_or_default();
        self.get(&format!("sessions/{id}/messages"), &q).await
    }
    pub async fn events(&self) -> Result<Response, String> {
        self.response("events", &[], Method::GET, None, true).await
    }
}
