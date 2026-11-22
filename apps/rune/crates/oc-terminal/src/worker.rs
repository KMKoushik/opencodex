use crate::{Engine, Frame, Size};
use futures_util::{SinkExt, StreamExt};
use oc_gateway::Gateway;
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{Message, client::IntoClientRequest, protocol::WebSocketConfig},
};

pub enum Command {
    Theme(crate::Palette),
    Input(String),
    Paste(String),
    Resize(Size),
    Scroll(i32),
    Select {
        col: usize,
        row: usize,
        start: Option<usize>,
    },
}
pub struct Worker {
    latest: Arc<Mutex<Option<Frame>>>,
    tx: mpsc::Sender<Command>,
    stop: Option<oneshot::Sender<()>>,
    pending: Arc<AtomicUsize>,
}
impl Worker {
    /// Start from the host's on_ready hook. Dropping detaches; it never kills the shell.
    pub fn start(
        gateway: Gateway,
        directory: String,
        id: Option<String>,
        size: Size,
        wake: impl Fn() + Send + Sync + 'static,
    ) -> Self {
        let latest = Arc::new(Mutex::new(None));
        let mailbox = latest.clone();
        let (tx, rx) = mpsc::channel(64);
        let (stop, stopped) = oneshot::channel();
        let pending = Arc::new(AtomicUsize::new(0));
        let queued = pending.clone();
        std::thread::Builder::new().name("terminal".into()).spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("terminal runtime");
            rt.block_on(async move {
                let mut engine = Engine::new(size);
                let publish = |frame: Frame| {
                    let first = mailbox.lock().unwrap().replace(frame).is_none();
                    if first { wake(); }
                };
                let run = async {
                    let id = match id { Some(id) => id, None => gateway.create_terminal(&directory).await?.id };
                    pump(&gateway, &directory, &id, size, &mut engine, rx, &queued, &publish).await
                };
                tokio::select! {
                    result = run => {
                        let mut frame = engine.snapshot();
                        frame.error = Some(result.err().unwrap_or_else(|| "Shell exited".into()));
                        publish(frame);
                    }
                    _ = stopped => {}
                }
            });
        }).expect("terminal worker");
        Self {
            latest,
            tx,
            stop: Some(stop),
            pending,
        }
    }
    pub fn take(&self) -> Option<Frame> {
        self.latest.lock().unwrap().take()
    }
    pub fn command(&self, command: Command) -> Result<(), String> {
        let bytes = input_len(&command);
        self.pending
            .try_update(Ordering::AcqRel, Ordering::Relaxed, |n| {
                n.checked_add(bytes).filter(|n| *n <= 1024 * 1024)
            })
            .map_err(|_| "Terminal input backlog exceeds 1 MiB".to_string())?;
        if let Err(e) = self.tx.try_send(command) {
            self.pending.fetch_sub(bytes, Ordering::Release);
            return Err(e.to_string());
        }
        Ok(())
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

async fn pump(
    gateway: &Gateway,
    directory: &str,
    id: &str,
    mut size: Size,
    engine: &mut Engine,
    mut commands: mpsc::Receiver<Command>,
    pending: &AtomicUsize,
    publish: &impl Fn(Frame),
) -> Result<(), String> {
    let mut cursor = 0u64;
    let mut failures = 0u32;
    loop {
        let target = gateway.terminal_socket(directory, id, cursor);
        let mut request = target
            .url
            .into_client_request()
            .map_err(|e| e.to_string())?;
        request
            .headers_mut()
            .insert("Origin", target.origin.parse().map_err(|e| format!("{e}"))?);
        if let Some(token) = target.token {
            request.headers_mut().insert(
                "Authorization",
                format!("Bearer {token}")
                    .parse()
                    .map_err(|e| format!("{e}"))?,
            );
        }
        let config = WebSocketConfig::default()
            .max_message_size(Some(4 * 1024 * 1024))
            .max_frame_size(Some(4 * 1024 * 1024));
        let connection = tokio::time::timeout(
            Duration::from_secs(10),
            connect_async_with_config(request, Some(config), false),
        )
        .await
        .map_err(|_| "Terminal handshake timed out".to_owned())
        .and_then(|result| result.map_err(|e| e.to_string()));
        let (mut socket, _) = match connection {
            Ok(connection) => connection,
            Err(error) => {
                failures += 1;
                if failures > 3 {
                    return Err(error);
                }
                let mut frame = engine.snapshot();
                frame.error = Some(format!("Reconnecting… {error}"));
                publish(frame);
                tokio::time::sleep(Duration::from_secs(1 << (failures - 1))).await;
                continue;
            }
        };
        gateway
            .resize_terminal(directory, id, size.cols, size.rows)
            .await?;
        let mut replay = true;
        let mut due = None;
        let mut resize_due = None;
        let error = loop {
            tokio::select! {
                message = socket.next() => match message {
                    Some(Ok(Message::Text(text))) => {
                        cursor += text.encode_utf16().count() as u64;
                        for chunk in text.as_bytes().chunks(256*1024) {
                            let replies = engine.feed(chunk);
                            if !replay { for reply in replies { socket.send(Message::Text(reply.into())).await.map_err(|e| e.to_string())?; } }
                        }
                        due.get_or_insert(tokio::time::Instant::now()+Duration::from_millis(8));
                    }
                    Some(Ok(Message::Binary(bytes))) if bytes.first() == Some(&0) => {
                        let value: serde_json::Value = serde_json::from_slice(&bytes[1..]).map_err(|_| "Invalid terminal replay metadata")?;
                        cursor = value["cursor"].as_u64().filter(|n| *n <= 9_007_199_254_740_991).ok_or("Invalid terminal replay cursor")?;
                        replay = false; failures = 0;
                    }
                    Some(Ok(Message::Close(frame))) => {
                        if frame.is_some_and(|f| u16::from(f.code) == 1000) { return Ok(()); }
                        break "Terminal disconnected".to_owned();
                    }
                    Some(Ok(Message::Ping(bytes))) => { socket.send(Message::Pong(bytes)).await.map_err(|e| e.to_string())?; }
                    Some(Ok(_)) => {},
                    Some(Err(e)) => break e.to_string(),
                    None => break "Terminal disconnected".into(),
                },
                command = commands.recv() => {
                    let Some(command) = command else { return Ok(()); };
                    pending.fetch_sub(input_len(&command), Ordering::Release);
                    match command {
                        Command::Theme(palette) => engine.palette=Some(palette),
                        Command::Input(text) => { engine.prepare_input(); send_text(&mut socket, &text).await?; }
                        Command::Paste(text) => { engine.prepare_input(); send_text(&mut socket, &crate::input::paste(&text, *engine.term.mode())).await?; }
                        Command::Resize(new) => { if size != new { size = new; engine.resize(size); resize_due = Some(tokio::time::Instant::now()+Duration::from_millis(100)); } }
                        Command::Scroll(lines) => engine.scroll(lines),
                        Command::Select { col, row, start } => engine.select(col, row, start),
                    }
                    due.get_or_insert(tokio::time::Instant::now()+Duration::from_millis(8));
                }
                _ = deadline(due) => { due = None; publish(engine.snapshot()); }
                _ = deadline(engine.sync_deadline().map(tokio::time::Instant::from_std)) => {
                    engine.stop_sync(); publish(engine.snapshot());
                }
                _ = deadline(resize_due) => {
                    resize_due = None;
                    gateway.resize_terminal(directory, id, size.cols, size.rows).await?;
                }
            }
        };
        publish(engine.snapshot());
        failures += 1;
        if failures > 3 {
            return Err(error);
        }
        tokio::time::sleep(Duration::from_secs(1 << (failures - 1))).await;
    }
}
fn input_len(command: &Command) -> usize {
    match command {
        Command::Input(s) | Command::Paste(s) => s.len(),
        _ => 0,
    }
}
async fn send_text(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    mut text: &str,
) -> Result<(), String> {
    while !text.is_empty() {
        let mut end = text.len().min(16_384);
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        socket
            .send(Message::Text(text[..end].to_owned().into()))
            .await
            .map_err(|e| e.to_string())?;
        text = &text[end..];
    }
    Ok(())
}
async fn deadline(at: Option<tokio::time::Instant>) {
    match at {
        Some(at) => tokio::time::sleep_until(at).await,
        None => std::future::pending().await,
    }
}
