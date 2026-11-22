//! Incremental, bounded SSE framing. UTF-8 is decoded only after a complete byte line.
#[derive(Default)]
pub struct Parser {
    buffer: Vec<u8>,
    name: String,
    data: String,
}
impl Parser {
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<(String, String)>, String> {
        const LIMIT: usize = 4 * 1024 * 1024;
        if self.buffer.len() + self.data.len() + bytes.len() > LIMIT {
            return Err("Gateway event exceeds 4 MiB".into());
        }
        self.buffer.extend_from_slice(bytes);
        let mut events = Vec::new();
        let mut consumed = 0;
        for (index, byte) in self.buffer.iter().enumerate() {
            if *byte != b'\n' {
                continue;
            }
            let line = std::str::from_utf8(&self.buffer[consumed..index])
                .map_err(|e| e.to_string())?
                .trim_end_matches('\r');
            consumed = index + 1;
            if line.is_empty() {
                if !self.data.is_empty() {
                    self.data.pop();
                    events.push((
                        if self.name.is_empty() {
                            "message".into()
                        } else {
                            std::mem::take(&mut self.name)
                        },
                        std::mem::take(&mut self.data),
                    ));
                }
                self.name.clear();
            } else if !line.starts_with(':') {
                let (field, value) = line.split_once(':').unwrap_or((line, ""));
                let value = value.strip_prefix(' ').unwrap_or(value);
                match field {
                    "event" => self.name = value.into(),
                    "data" => {
                        self.data.push_str(value);
                        self.data.push('\n');
                    }
                    _ => {}
                }
            }
        }
        self.buffer.drain(..consumed);
        Ok(events)
    }
}
