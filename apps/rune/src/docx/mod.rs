//! Shared bounded Mammoth/DOMPurify document, used by chat attachments and Files.
//! No host bridge or network access. Conversion and parsing run in a disposable worker.
pub fn page(data: &str, toolbar: bool) -> String {
    let data = serde_json::to_string(data).unwrap().replace('<', "\\u003c");
    let worker = serde_json::to_string(include_str!("preview-worker.asset"))
        .unwrap()
        .replace('<', "\\u003c");
    let toolbar = if toolbar {
        "<div class=\"wb-subtoolbar\">Word document · Read-only preview</div>"
    } else {
        ""
    };
    format!(
        r#"<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; worker-src blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><style>
*{{box-sizing:border-box}}html,body{{margin:0;width:100%;height:100%;overflow:hidden;background:var(--surface);color:var(--text);font:13px -apple-system,BlinkMacSystemFont,sans-serif}}body{{display:flex;flex-direction:column}}#status{{padding:24px}}.wb-docx-scroll{{min-height:0}}[hidden]{{display:none!important}}
{css}
{find}
.find-bar .button{{display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer}}.find-bar .button:hover{{background:var(--hover)}}.find-bar .button:disabled{{opacity:.5;cursor:default}}
</style></head><body><div class="wb-docx-viewer">{toolbar}<div id="status" role="status">Loading document…</div><div class="wb-docx-scroll" tabindex="0"><article class="wb-docx-page" id="document"></article></div></div>
<script>{sanitizer}</script><script>
const worker=new Worker(URL.createObjectURL(new Blob([{worker}],{{type:'text/javascript'}})));
const status=document.getElementById('status');
const timeout=setTimeout(()=>fail('This document took too long to preview. Download it to open in Word.'),15000);
function fail(message){{clearTimeout(timeout);worker.terminate();status.textContent=message;status.setAttribute('role','alert');}}
worker.onerror=()=>fail('Could not preview this Word document.');
worker.onmessage=e=>{{clearTimeout(timeout);worker.terminate();if(e.data.error){{fail(e.data.error);return;}}document.getElementById('document').innerHTML=DOMPurify.sanitize(e.data.html??'',{{ALLOWED_TAGS:['p','br','strong','em','u','s','sup','sub','h1','h2','h3','h4','h5','h6','ul','ol','li','table','thead','tbody','tr','td','th','blockquote','pre','code','img'],ALLOWED_ATTR:['colspan','rowspan','src','alt']}});status.remove();}};
worker.postMessage({data});addEventListener('pagehide',()=>{{clearTimeout(timeout);worker.terminate();}});
</script><script>{client}</script></body></html>"#,
        css = include_str!("../../../web/src/features/workbench/docx-viewer.css"),
        find = include_str!("../../../web/src/features/find/find.css"),
        sanitizer = include_str!("preview-sanitizer.asset"),
        client = include_str!("preview-client.asset")
    )
}
