//! AppKit writes with their actual BOOL result, isolated from the UI thread.
//! The application forbids unsafe Rust and this workstream cannot change Cargo
//! dependencies. JXA provides a narrow existing system Objective-C bridge instead.
use rune::{Latest, Waker};
use std::{
    io::Write,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct Writer {
    pending: Latest<(String, bool)>,
    pub result: Option<(String, bool)>,
    pub due: Option<Instant>,
}
impl Writer {
    pub fn request(&mut self, id: String, text: String, wake: Option<Waker>) {
        self.result = None;
        self.due = None;
        if let Some(wake) = wake {
            self.pending.set_waker(wake);
        }
        self.pending.request((id,text), |(id,text)| {
            // Text is input data, never executable source or visible in ps/argv.
            // Piping also avoids ARG_MAX for long answers. No history-suppression
            // flags, clipboard reads, or delayed destructive clearing.
            let script = "ObjC.import('AppKit'); const data=$.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile; const text=$.NSString.alloc.initWithDataEncoding(data,$.NSUTF8StringEncoding); const p=$.NSPasteboard.generalPasteboard; p.clearContents; p.setStringForType(text,$.NSPasteboardTypeString) ? 'true' : 'false'";
            let success = Command::new("/usr/bin/osascript").args(["-l","JavaScript","-e",script])
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().is_ok_and(|mut child| {
                    let written=child.stdin.take().is_some_and(|mut input|input.write_all(text.as_bytes()).is_ok());
                    if !written { let _=child.kill(); }
                    child.wait_with_output().is_ok_and(|out|written && out.status.success() && out.stdout==b"true\n")
                });
            (id,success)
        });
    }
    pub fn take(&mut self) -> bool {
        if let Some(result) = self.pending.take() {
            self.due = result.1.then(|| Instant::now() + Duration::from_secs(2));
            self.result = Some(result);
            return true;
        }
        if self.due.is_some_and(|due| Instant::now() >= due) {
            self.due = None;
            return true;
        }
        false
    }
}
