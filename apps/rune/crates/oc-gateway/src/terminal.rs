//! Gateway-owned PTYs. No OpenCode credentials or connect tickets leave the gateway.
use super::Gateway;
use reqwest::Method;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Terminal {
    pub id: String,
    pub cwd: String,
    pub title: String,
    pub status: String,
    pub exit_code: Option<i32>,
}

pub struct SocketRequest {
    pub url: String,
    pub origin: String,
    pub token: Option<String>,
}

impl Gateway {
    pub async fn terminals(&self, directory: &str) -> Result<Vec<Terminal>, String> {
        self.get("terminals", &[("directory", directory)]).await
    }
    pub async fn create_terminal(&self, directory: &str) -> Result<Terminal, String> {
        self.response(
            "terminals",
            &[("directory", directory)],
            Method::POST,
            None,
            false,
        )
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
    }
    pub async fn resize_terminal(
        &self,
        directory: &str,
        id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Terminal, String> {
        if !(2..=1000).contains(&cols) || !(1..=500).contains(&rows) {
            return Err("Invalid terminal dimensions".into());
        }
        self.response(
            &format!("terminals/{id}"),
            &[("directory", directory)],
            Method::PATCH,
            Some(json!({"size": {"cols": cols, "rows": rows}})),
            false,
        )
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
    }
    pub async fn close_terminal(&self, directory: &str, id: &str) -> Result<(), String> {
        self.response(
            &format!("terminals/{id}"),
            &[("directory", directory)],
            Method::DELETE,
            None,
            false,
        )
        .await?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn terminal_socket(&self, directory: &str, id: &str, cursor: u64) -> SocketRequest {
        let mut url = self.url(
            &format!("terminals/{id}/connect"),
            &[("directory", directory), ("cursor", &cursor.to_string())],
        );
        let origin = url.origin().ascii_serialization();
        let scheme = if url.scheme() == "https" { "wss" } else { "ws" };
        url.set_scheme(scheme).expect("WebSocket scheme");
        SocketRequest {
            url: url.into(),
            origin,
            token: self.token.clone(),
        }
    }
}
