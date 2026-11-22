//! Opaque per-surface local preview origins. Never grant WebKit a file:// directory.
use super::*;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

type Grants = Rc<RefCell<Vec<(String, String)>>>;
pub struct Ivars {
    grants: Grants,
    tasks: RefCell<HashMap<usize, Arc<Mutex<(bool, bool)>>>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "OpenCodexLocalPages"]
    #[thread_kind = MainThreadOnly]
    #[ivars = Ivars]
    pub struct Handler;
    unsafe impl NSObjectProtocol for Handler {}
    impl Handler {
        #[unsafe(method(webView:startURLSchemeTask:))]
        unsafe fn start(&self, _view: *mut AnyObject, task: *mut AnyObject) {
            unsafe {
                self.ivars().tasks.borrow_mut().retain(|_, state| !state.lock().unwrap().1);
                let request: *mut AnyObject = msg_send![task, request];
                let method = string(msg_send![request,HTTPMethod]);
                let value = url_string(msg_send![request,URL]);
                let grant = url::Url::parse(&value).ok().and_then(|url| {
                    self.ivars().grants.borrow().iter().find(|(token, _)| url.host_str() == Some(token.as_str())).map(|(_, root)| root.clone())
                });
                if self.ivars().tasks.borrow().len() >= 16 {
                    fail(task);
                    return;
                }
                let state = Arc::new(Mutex::new((false, false)));
                self.ivars().tasks.borrow_mut().insert(task as usize, state.clone());
                // WKURLSchemeTask's response/data/finish callbacks are documented thread-safe.
                // Retain only that task across the worker boundary, never WKWebView/AppKit.
                let held = Retained::into_raw(Retained::retain(task).unwrap()) as usize;
                std::thread::spawn(move || {
                    let response = read(grant, &value, &method);
                    let held = Retained::from_raw(held as *mut AnyObject).unwrap();
                    let mut state = state.lock().unwrap();
                    if !state.0 {
                        match response {
                            Ok((data, mime)) => {
                                let request: *mut AnyObject = msg_send![&*held,request];
                                let url: *mut AnyObject = msg_send![request,URL];
                                let alloc: *mut AnyObject = msg_send![AnyClass::get(c"NSURLResponse").unwrap(),alloc];
                                let response: *mut AnyObject = msg_send![alloc,initWithURL:url,MIMEType:&*NSString::from_str(mime),expectedContentLength:data.len() as isize,textEncodingName:std::ptr::null::<AnyObject>()];
                                let response = Retained::from_raw(response).unwrap();
                                let _: () = msg_send![&*held,didReceiveResponse:&*response];
                                if method != "HEAD" {
                                    let bytes: Retained<AnyObject> = msg_send![AnyClass::get(c"NSData").unwrap(),dataWithBytes:data.as_ptr().cast::<std::ffi::c_void>(),length:data.len()];
                                    let _: () = msg_send![&*held,didReceiveData:&*bytes];
                                }
                                let _: () = msg_send![&*held,didFinish];
                            }
                            Err(_) => fail(&*held as *const _ as *mut _),
                        }
                    }
                    state.1 = true;
                });
            }
        }
        #[unsafe(method(webView:stopURLSchemeTask:))]
        unsafe fn stop(&self, _view: *mut AnyObject, task: *mut AnyObject) {
            if let Some(state) = self.ivars().tasks.borrow_mut().remove(&(task as usize)) {
                state.lock().unwrap().0 = true;
            }
        }
    }
);

impl Handler {
    pub fn new(grants: Grants) -> Retained<Self> {
        let this = Self::alloc(MainThreadMarker::new().unwrap()).set_ivars(Ivars {
            grants,
            tasks: Default::default(),
        });
        unsafe { msg_send![super(this), init] }
    }
}

unsafe fn fail(task: *mut AnyObject) {
    unsafe {
        let error: Retained<AnyObject> = msg_send![AnyClass::get(c"NSError").unwrap(),errorWithDomain:&*NSString::from_str("OpenCodex local preview"),code:404isize,userInfo:std::ptr::null::<AnyObject>()];
        let _: () = msg_send![task,didFailWithError:&*error];
    }
}

fn read(
    root: Option<String>,
    value: &str,
    method: &str,
) -> Result<(Vec<u8>, &'static str), String> {
    if !matches!(method, "GET" | "HEAD") {
        return Err("Method not allowed".into());
    }
    let root = url::Url::parse(&root.ok_or("Preview closed")?)
        .map_err(|e| e.to_string())?
        .to_file_path()
        .map_err(|_| "Invalid preview folder")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let url = url::Url::parse(value).map_err(|e| e.to_string())?;
    let encoded = url.path().trim_start_matches('/');
    // Decode using the URL parser's file conversion, not string prefix checks.
    let mut file = url::Url::parse("file:///").unwrap();
    file.set_path(encoded);
    let relative = file.to_file_path().map_err(|_| "Invalid preview path")?;
    let relative = relative
        .strip_prefix("/")
        .map_err(|_| "Invalid preview path")?;
    if relative.to_string_lossy().contains(['\0', '\\']) {
        return Err("Invalid preview path".into());
    }
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if path == root || !path.starts_with(&root) || !path.is_file() {
        return Err("Choose a file within the preview folder".into());
    }
    let metadata = path.metadata().map_err(|e| e.to_string())?;
    if metadata.len() > 64 * 1024 * 1024 {
        return Err("Preview resource exceeds 64 MiB".into());
    }
    let mime = mime(&path);
    Ok((std::fs::read(path).map_err(|e| e.to_string())?, mime))
}
fn mime(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" => "text/javascript",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "pdf" => "application/pdf",
        "mp4" => "video/mp4",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

pub fn display(grants: &[(String, String)], value: &str) -> String {
    let Ok(url) = url::Url::parse(value) else {
        return value.into();
    };
    if url.scheme() != "opencodex-preview" {
        return value.into();
    }
    let Some((_, root)) = grants
        .iter()
        .find(|(token, _)| url.host_str() == Some(token.as_str()))
    else {
        return value.into();
    };
    url::Url::parse(root)
        .ok()
        .and_then(|root| {
            root.join(&format!(
                "{}{}{}",
                url.path().trim_start_matches('/'),
                url.query().map(|q| format!("?{q}")).unwrap_or_default(),
                url.fragment().map(|f| format!("#{f}")).unwrap_or_default()
            ))
            .ok()
        })
        .map(|url| url.into())
        .unwrap_or_else(|| value.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resources_stay_in_the_canonical_grant() {
        let root = std::env::temp_dir().join(format!(
            "oc-local-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("inside")).unwrap();
        std::fs::write(root.join("outside.txt"), "secret").unwrap();
        std::fs::write(root.join("inside/page.html"), "<h1>Preview</h1>").unwrap();
        std::os::unix::fs::symlink(root.join("outside.txt"), root.join("inside/escape.txt"))
            .unwrap();
        let grant = Some(
            url::Url::from_directory_path(root.join("inside"))
                .unwrap()
                .to_string(),
        );
        assert!(read(grant.clone(), "opencodex-preview://token/page.html", "GET").is_ok());
        for path in [
            "../outside.txt",
            "%2e%2e/outside.txt",
            "escape.txt",
            "bad%00.html",
            "a%5cb",
        ] {
            assert!(
                read(
                    grant.clone(),
                    &format!("opencodex-preview://token/{path}"),
                    "GET"
                )
                .is_err(),
                "{path}"
            );
        }
        assert!(read(grant, "opencodex-preview://token/page.html", "POST").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
