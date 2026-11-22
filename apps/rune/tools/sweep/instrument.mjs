// A measurement-only build of the exact pinned framework. Never edits Cargo's
// checkout, the app's lockfile, or a reference repo. The extra inspector fields
// read the already-shaped layout; layout and painting are completely unchanged.
import {
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs';
import { dirname, relative, join } from 'node:path';
import { command, root, fixture } from './environment.mjs';

export function buildAlignment() {
  const metadata = JSON.parse(
    command('cargo', [
      'metadata',
      '--format-version',
      '1',
      '--manifest-path',
      'apps/rune/Cargo.toml',
    ]),
  );
  const framework = metadata.packages.find((p) => p.name === 'rune');
  const pinned = dirname(dirname(dirname(framework.manifest_path)));
  const copy = fixture + '/alignment-framework';
  cpSync(pinned, copy, {
    recursive: true,
    filter: (p) => {
      if (['.git', 'target', 'node_modules'].includes(p.split('/').at(-1))) return false;
      if (
        p.endsWith('/crates/rune/src/tooling/trace.rs') &&
        existsSync(copy + '/crates/rune/src/tooling/trace.rs')
      )
        return false;
      const target = copy + '/' + relative(pinned, p);
      return (
        !statSync(p).isFile() ||
        !existsSync(target) ||
        !readFileSync(p).equals(readFileSync(target))
      );
    },
  });
  const trace = copy + '/crates/rune/src/tooling/trace.rs';
  let source = readFileSync(pinned + '/crates/rune/src/tooling/trace.rs', 'utf8');
  const needle = '            if let Some(k) = &e.key {';
  if (!source.includes(needle))
    throw new Error('Pinned Rune inspector changed: review alignment instrumentation');
  source = source.replace(
    needle,
    `
            v["visible"] = json!(e.visible);
            v["rect"] = json!(e.rect);
            v["radius"] = json!(e.radius);
            if let Some((i, n)) = rt.tree.nodes.iter().enumerate().find(|(_, n)| n.path == e.path) {
                if e.text.as_deref() == Some("") {
                    if let Some(value) = crate::tooling::alignment_input_get(&e.path) { v["placeholder"] = value; }
                }
                if let Some((ic, color)) = n.vis.icon {
                    v["icon"] = json!(ic.name);
                    v["iconBody"] = json!(ic.body);
                    v["color"] = json!(e.text_color.unwrap_or(color).hex());
                }
                if n.vis.pixels.is_some() { v["image"] = json!(true); }
                if n.vis.border_width() > 0.0 {
                    v["borderWidth"] = json!(n.vis.border_width());
                    v["borderColor"] = json!(n.vis.border().hex());
                }
                if let (Some(spec), Some(laid)) = (&n.text, &n.text_layout) {
                    let flow = laid.view();
                    let s = rt.env.scale;
                    let z = e.scale;
                    let origin = crate::runtime::text_origin(n, spec, flow, rt.drawn_box(i), s, z);
                    let lines: Vec<_> = flow.block_lines(spec.style.line_height * s).iter().map(|l| json!({
                        "baseline": origin[1] + l.baseline * z / s,
                        "top": origin[1] + l.top * z / s,
                        "bottom": origin[1] + l.bottom * z / s
                    })).collect();
                    v["textOrigin"] = json!(origin);
                    v["lines"] = json!(lines);
                    v["fontSize"] = json!(spec.style.size);
                    v["fontWeight"] = json!(spec.style.weight);
                    v["fontFamily"] = json!(format!("{:?}", spec.style.family));
                    v["fontFeatures"] = json!(spec.style.features);
                    v["lineHeight"] = json!(spec.style.line_height);
                    // A full-range rich span overrides the element's base ink.
                    if let Some(span) = spec.spans.iter().rev().find(|span| span.start == 0 && span.end as usize >= e.text.as_deref().unwrap_or("").len()) {
                        if let Some(color) = span.color { v["spanColor"] = json!(color.hex()); }
                        if let Some(weight) = span.weight { v["fontWeight"] = json!(weight); }
                        if let Some(size) = span.size { v["fontSize"] = json!(size); }
                        if span.mono { v["fontFamily"] = json!("Mono"); }
                    }
                }
            }
` + needle,
  );
  if (!existsSync(trace) || readFileSync(trace, 'utf8') !== source) writeFileSync(trace, source);
  const patch = (file, change) => {
    const original = readFileSync(pinned + '/crates/rune/src/' + file, 'utf8');
    const changed = change(original);
    const target = copy + '/crates/rune/src/' + file;
    if (readFileSync(target, 'utf8') !== changed) writeFileSync(target, changed);
  };
  patch(
    'tooling.rs',
    (s) =>
      s +
      `
thread_local! { static ALIGNMENT_INPUTS: std::cell::RefCell<std::collections::HashMap<String, serde_json::Value>> = std::cell::RefCell::new(std::collections::HashMap::new()); }
pub(crate) fn alignment_input(path: &str, value: serde_json::Value) { ALIGNMENT_INPUTS.with(|map| { map.borrow_mut().insert(path.into(), value); }); }
pub(crate) fn alignment_input_get(path: &str) -> Option<serde_json::Value> { ALIGNMENT_INPUTS.with(|map| map.borrow().get(path).cloned()) }
`,
  );
  patch('runtime/paint/content.rs', (s) => {
    const needle = '                    let pl_origin = [pl_x, rest_origin[1]];';
    if (!s.includes(needle)) throw new Error('Pinned Rune placeholder painter changed');
    return s.replace(
      needle,
      needle +
        `
                    let style = inp.placeholder_style.unwrap_or(spec.style);
                    crate::tooling::alignment_input(&n.path, serde_json::json!({
                        "text": inp.placeholder, "origin": pl_origin.map(|v| v / s),
                        "color": inp.placeholder_color.hex(), "fontSize": style.size,
                        "fontWeight": style.weight, "lineHeight": style.line_height,
                        "baselines": pl.lines().map(|line| (pl_origin[1] + line.metrics().baseline * tk) / s).collect::<Vec<_>>()
                    }));
`,
    );
  });
  const app = fixture + '/alignment-app';
  cpSync(root + '/apps/rune', app, {
    recursive: true,
    filter: (p) => !['target', 'goldens', 'node_modules', '.git'].includes(p.split('/').at(-1)),
  });
  // include_bytes! brand assets stay the exact web source, not new fixtures.
  mkdirSync(fixture + '/web', { recursive: true });
  cpSync(root + '/apps/web/src', fixture + '/web/src', { recursive: true });
  const packages = new Map(
    metadata.packages
      .filter((p) => p.manifest_path.startsWith(pinned + '/'))
      .map((p) => [p.name, dirname(p.manifest_path)]),
  );
  function rewrite(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) rewrite(path);
      else if (entry.name === 'Cargo.toml') {
        let manifest = readFileSync(path, 'utf8');
        manifest = manifest.replace(
          /^(\S+) = \{ git = "https:\/\/github.com\/anomalyco\/rune", rev = "[a-f0-9]+"(.*?)\}/gm,
          (_, name, rest) => {
            const pkg = packages.get(name);
            if (!pkg) throw new Error('Missing pinned package ' + name);
            return (
              name +
              ' = { path = ' +
              JSON.stringify(copy + '/' + relative(pinned, pkg)) +
              rest +
              '}'
            );
          },
        );
        writeFileSync(path, manifest);
      }
    }
  }
  rewrite(app);
  command('cargo', [
    'build',
    '--release',
    '--workspace',
    '--manifest-path',
    app + '/Cargo.toml',
    '--target-dir',
    root + '/apps/rune/target',
  ]);
}
