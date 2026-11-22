// Run from the repository root with Bun. Uses the actual web pipeline, not a
// copied JS policy. The checked-in corpus is consumed by Rust's sanitizer test.
import { unified } from '../../../../node_modules/.bun/unified@11.0.5/node_modules/unified';
import {
  find,
  html,
} from '../../../../node_modules/.bun/property-information@7.2.0/node_modules/property-information';
import { markdownHtmlPlugins } from '../../../web/src/lib/markdown-html';
import { defaultSchema } from '../../../../node_modules/.bun/hast-util-sanitize@5.0.2/node_modules/hast-util-sanitize';
import { writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { fileURLToPath } from 'node:url';
const inputs = [
  '<u>underline</u><mark>mark</mark><script>alert(1)</script><style>.x{}</style><iframe>frame</iframe><custom>keep <b>bold</b></custom>',
  '<p id="x" name="y" style="color:red" onclick="bad()" class="no" title="yes" dir="rtl">Text<br>line</p>',
  '<a href="javascript:alert(1)" target="_self" rel="opener">bad</a><a href="file:///tmp/a">file</a><a href="mailto:a@b">mail</a><a href="/x:y">relative</a>',
  '<img src="data:image/png;base64,AA" alt="alt" width="24" height="12" onerror="bad()"><img src="file:///x"><img src="javascript:bad">',
  '<details open name="group"><summary aria-label="Label">Title</summary><p><kbd>cmd</kbd> <sub>2</sub><sup>3</sup><samp>out</samp><tt>mono</tt><var>x</var><ins>new</ins><del>old</del><s>strike</s></p></details>',
  '<input type="text" checked><input disabled="false" type="checkbox"><input type="radio"><code class="other language-rust language- language-js">x</code>',
  '<div itemscope itemtype="https://schema.org/Thing" itemprop="name" data-x="no"><section class="footnotes other" data-footnotes><h2 class="sr-only other">F</h2></section></div>',
  '<ol start="3" class="contains-task-list other" aria-labelledby="a b"><li class="task-list-item nope">item</li></ol><dl><dt>term</dt><dd>definition</dd></dl>',
  '<table><thead><tr><th align="right" colspan="2">H</th></tr></thead><tbody><tr><td rowspan="2"><ul><li>A</li></ul></td></tr></tbody><tfoot><tr><td>F</td></tr></tfoot></table>',
  '<ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby><q cite="https://x">quote</q><picture><source srcset="a.png 1x, b.png 2x"><img src="a.png"></picture>',
  '<div><b><i>malformed</b>tail</i></div><table>foster<tr><td>x</table>',
  '<svg><title>svg text</title><script>bad</script></svg><math><mi>x</mi></math><template><p>hidden</p></template>',
  '<a id="user-content-fn-1" aria-describedby="user-content-label" href="HTTPS://x">x</a><span hidden tabindex="-1" accesskey="a">s</span>',
];
// Exercise every installed element/global attribute, including HAST's numeric,
// boolean and token-list coercion, not just the hand-selected visual examples.
for (const tag of defaultSchema.tagNames!) {
  const props = [...defaultSchema.attributes!['*']!, ...(defaultSchema.attributes![tag] ?? [])];
  const attributes = props
    .map((p) => {
      const key = typeof p === 'string' ? p : p[0];
      const info = find(html, key);
      const value =
        key === 'href' || key === 'src' || key === 'cite' || key === 'longDesc'
          ? 'https://example.com'
          : key === 'className'
            ? 'language-rust contains-task-list task-list-item footnotes sr-only data-footnote-backref'
            : '7';
      return `${info.attribute}="${value}"`;
    })
    .join(' ');
  inputs.push(`<${tag} ${attributes}>text</${tag}>`);
}
inputs.push(
  '<div width="no" height="1.5" colspan="no" start="03" tabindex=" 4 " checked="false" accesskey="a b" headers="a b" coords="1,2,3"></div>',
);
type Node = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};
type Canonical = string | [string, Record<string, string>, Canonical[]];
function canonical(nodes: Node[]): Canonical[] {
  const result: Canonical[] = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      result.push(n.value ?? '');
      continue;
    }
    if (n.type !== 'element') continue;
    const attrs = Object.fromEntries(
      Object.entries(n.properties ?? {})
        .filter(([, v]) => v !== false && v != null)
        .map(([k, v]) => [
          find(html, k).attribute,
          Array.isArray(v) ? v.join(' ') : v === true ? '' : String(v),
        ]),
    );
    result.push([n.tagName ?? '', attrs, canonical(n.children ?? [])]);
  }
  return result;
}
const pipeline = unified().use(markdownHtmlPlugins);
const cases = inputs.map((input) => {
  const root: Node = { type: 'root', children: [{ type: 'raw', value: input }] };
  const clean = pipeline.runSync(root) as Node;
  return { input, expected: canonical(clean.children ?? []) };
});
await writeFile(
  new URL('./src/markdown/html-oracle.json', import.meta.url),
  await format(JSON.stringify(cases), {
    ...(await resolveConfig(fileURLToPath(import.meta.url))),
    parser: 'json',
  }),
);
console.log(`Wrote ${cases.length} web sanitizer oracle cases`);
