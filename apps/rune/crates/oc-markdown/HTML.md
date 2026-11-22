# Markdown HTML: installed web policy

Oracle: `apps/web/src/lib/markdown-html.ts`, installed
`hast-util-sanitize@5.0.2`, `stream-text.tsx`, `markdown-{link,paragraph,table,image}.tsx`,
`markdown-image.css`, `globals.css`, and Tailwind Preflight.

HTML5 parsing precedes sanitization. Unknown elements unwrap and retain children;
**script alone strips its entire subtree**. Comments disappear. **u and mark are
not allowed**. Style, event handlers, arbitrary classes, hidden, target and rel
are not allowed. This is not a DOMPurify policy.

## Every allowed element

Every row also accepts the global attributes below. Additional attributes have no
implicit data-* or aria-* wildcard. Token-restricted class values are listed.

| Elements                | Additional attributes                                                                                                      | Actual web rendering                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a                       | href; aria-describedby, aria-label, aria-labelledby; data-footnote-ref, data-footnote-backref; class=data-footnote-backref | MarkdownLink: link color, weight 500, underline offset 3px. Relative links prepend 13px SourceCode SVG, 4px gap, vertical-align -2px. Application supplies target=_blank/rel=noreferrer.                                          |
| b                       | —                                                                                                                          | UA/Preflight bold, 700 at normal body weight, not strong's override.                                                                                                                                                              |
| strong                  | —                                                                                                                          | Weight 600.                                                                                                                                                                                                                       |
| em, i, var              | —                                                                                                                          | Italic.                                                                                                                                                                                                                           |
| del                     | cite                                                                                                                       | Strikethrough.                                                                                                                                                                                                                    |
| s, strike               | —                                                                                                                          | Strikethrough.                                                                                                                                                                                                                    |
| ins                     | cite                                                                                                                       | Underline.                                                                                                                                                                                                                        |
| br                      | —                                                                                                                          | Hard line break.                                                                                                                                                                                                                  |
| code                    | class matching /^language-./                                                                                               | Chat code size (default 13px), monospace, inherited weight. Outside pre: code-bg, radius 5px, padding 1px 5px. No syntax highlighting.                                                                                            |
| kbd, samp, tt           | —                                                                                                                          | Inherited-size monospace; no keyboard chip/border CSS.                                                                                                                                                                            |
| sub                     | —                                                                                                                          | 75% font, zero line height, baseline-relative bottom -0.25em.                                                                                                                                                                     |
| sup                     | —                                                                                                                          | 75% font, zero line height, baseline-relative top -0.5em.                                                                                                                                                                         |
| q                       | cite                                                                                                                       | Inline UA quotation marks.                                                                                                                                                                                                        |
| ruby, rt, rp            | —                                                                                                                          | Half-size annotation above base; rp fallback parentheses hidden when ruby works.                                                                                                                                                  |
| span                    | —                                                                                                                          | Inert inline container.                                                                                                                                                                                                           |
| div                     | itemscope, itemtype                                                                                                        | Block container.                                                                                                                                                                                                                  |
| section                 | data-footnotes; class=footnotes                                                                                            | Block container; no custom footnote skin.                                                                                                                                                                                         |
| p                       | —                                                                                                                          | Paragraph. MarkdownParagraph recognizes a sole canvas link.                                                                                                                                                                       |
| h1                      | —                                                                                                                          | 1.75em, weight 600, line-height 1.4, top margin 24px.                                                                                                                                                                             |
| h2                      | class=sr-only                                                                                                              | 1.5em, same weight/line-height/margins; sr-only visually hidden.                                                                                                                                                                  |
| h3                      | —                                                                                                                          | 1.25em, same weight/line-height/margins.                                                                                                                                                                                          |
| h4                      | —                                                                                                                          | 1em, same weight/line-height/margins.                                                                                                                                                                                             |
| h5, h6                  | —                                                                                                                          | Preflight resets font size/weight to inherited values.                                                                                                                                                                            |
| blockquote              | cite                                                                                                                       | 2px border-heavy left rule, 16px left padding, secondary text.                                                                                                                                                                    |
| pre                     | —                                                                                                                          | Monospace preformatted horizontal scroller, 14px 16px padding, 1px border, radius 10px, surface-under.                                                                                                                            |
| hr                      | —                                                                                                                          | Preflight 1px current-color top rule.                                                                                                                                                                                             |
| ul                      | aria-describedby, aria-label, aria-labelledby; class=contains-task-list                                                    | Disc markers, 24px left padding, 6px between li siblings.                                                                                                                                                                         |
| ol                      | aria-describedby, aria-label, aria-labelledby; class=contains-task-list                                                    | Decimal markers, start honored, same padding/spacing.                                                                                                                                                                             |
| li                      | class=task-list-item                                                                                                       | List item; class adds no custom task skin.                                                                                                                                                                                        |
| dl                      | aria-describedby, aria-label, aria-labelledby                                                                              | Definition list; Preflight removes UA margins.                                                                                                                                                                                    |
| dt, dd                  | —                                                                                                                          | Block terms/definitions; no dd indent after Preflight.                                                                                                                                                                            |
| details                 | —                                                                                                                          | Native disclosure, open controls initial state, native triangle, no custom padding.                                                                                                                                               |
| summary                 | aria-describedby, aria-label, aria-labelledby                                                                              | Disclosure trigger; first summary labels it; absent summary defaults to Details.                                                                                                                                                  |
| table                   | aria-describedby, aria-label, aria-labelledby                                                                              | MarkdownTable horizontal scroller, 100% width, auto columns, collapsed borders, tabular numerals.                                                                                                                                 |
| thead, tbody, tfoot, tr | —                                                                                                                          | Table groups/rows, valid only inside table.                                                                                                                                                                                       |
| td, th                  | —                                                                                                                          | 10px 12px padding, 1px bottom border, start-aligned/top-aligned. th: 600 and heavier bottom rule. colspan/rowspan retained.                                                                                                       |
| img                     | src, longdesc; aria-describedby, aria-label, aria-labelledby                                                               | StreamText drops all props except src/alt. MarkdownImage: gateway local resolution, preview/retry, natural size, max-width 100%, max-height 560px, contain, radius 8px. Allowed width/height/title are ignored by this component. |
| picture                 | —                                                                                                                          | Default wrapper; img still replaced by MarkdownImage.                                                                                                                                                                             |
| source                  | srcset                                                                                                                     | Void source, no own visible content. Replaced img does not use picture source selection.                                                                                                                                          |
| input                   | disabled=true, type=checkbox                                                                                               | Forced disabled checkbox even when another type was requested; checked has presence semantics.                                                                                                                                    |

Component overrides matter after sanitization: MarkdownLink receives only href
and children, so authored title/id/ARIA/class props are dropped. MarkdownTable
receives only children, dropping authored table attributes; its wrapper supplies
role=region, aria-label=Table and tabIndex=0. StreamText's img adapter likewise
keeps only src and alt. The native renderer follows these overrides rather than
mistaking the sanitizer's allowlist for the final component's prop surface.

Root block siblings have 16px top margin; h1–h4 override to 24px; first root child
has no top margin. Nested blocks have no root-only margins. Vertical margins on
inline elements do not participate in line layout. Body line-height is 1.625.
At 14px Chromium measures 22.75px body lines and 23.75px code-bearing lines.
`web_inline_metrics(extra, code_vpad, code_radius, icon_baseline)` exposes these
controls without increasing unaffected lines' height.

## Every global allowed attribute

HTML spellings (the schema uses HAST camelCase property names):

```text
abbr accept accept-charset accesskey action align alt axis border cellpadding
cellspacing char charoff charset checked clear colspan color cols compact coords
datetime dir enctype frame hspace headers height hreflang for id ismap itemprop
label lang maxlength media method multiple name nohref noshade nowrap open prompt
readonly rev rowspan rows rules scope selected shape size span start summary
tabindex title usemap valign value width
```

Allowed does not mean visually effective. Attributes meaningless on an element
do nothing. Preflight/Markdown CSS overrides legacy presentation attributes when
it specifies the corresponding property (table width, cell alignment, padding,
borders, colors). React component overrides are listed above.

Clobber protection prefixes id, name, aria-describedby and aria-labelledby with
`user-content-`; the final plugin removes a doubled prefix from **id only**.
Class tokens are filtered individually. Inputs always gain disabled/type=checkbox.
Event handlers/CSS never reach native rendering.

| URL attribute  | Allowed explicit protocols                 |
| -------------- | ------------------------------------------ |
| href           | http, https, irc, ircs, mailto, xmpp, file |
| src            | http, https, data                          |
| cite, longdesc | http, https                                |

The installed sanitizer checks protocols case-sensitively, without trimming.
Relative URLs pass (slash/query/hash before colon counts as relative). The React
URL transform subsequently permits file URLs and png/jpeg/gif/webp/svg+xml
base64 image data URLs; other unsafe URLs become empty. With raw HTML enabled,
canvas: hrefs have already been removed before the custom URL transform.

## Oracle regression and workers

```sh
# Worktree root: executes the actual web plugins on the Rust test inputs.
bun -e 'await import("./apps/rune/crates/oc-markdown/html-oracle.ts")'
cd apps/rune
cargo test -p oc-markdown installed_web_sanitizer_parity
```

67 cases cover every installed element/attribute plus scripts versus unwrapping,
misnesting/table foster parenting, namespaces, protocols, classes, input defaults,
clobbering and value coercion. Rust compares canonical trees from the same inputs.

Chat HTML5 parsing/sanitization runs on a bounded, coalescing worker. Ordinary
Markdown retains upstream incremental tail parsing, including the finished prefix
before the first HTML-bearing root block. Raw HTML may reparent across Markdown
blocks, so the active HTML tail is reparsed rather than unsafely spliced. A less-than
sign inside a fence/autolink alone does not select the HTML renderer.
