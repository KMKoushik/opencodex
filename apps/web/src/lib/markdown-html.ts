import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Options } from 'react-markdown';

type Plugins = NonNullable<Options['rehypePlugins']>;
type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const prefix = defaultSchema.clobberPrefix ?? '';
const tableParts = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr']);

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
    src: [...(defaultSchema.protocols?.src ?? []), 'data'],
  },
};

function visitElements(tree: Node, visit: (node: Node) => void) {
  const walk = (node: Node) => {
    if (node.type !== 'element') return;
    visit(node);
    node.children?.forEach(walk);
  };
  tree.children?.forEach(walk);
}

/** The HTML parser hoists whitespace between table rows out in front of the table. */
function dropTableWhitespace() {
  return (tree: Node) =>
    visitElements(tree, (node) => {
      if (tableParts.has(node.tagName!))
        node.children = node.children?.filter(
          (child) => child.type !== 'text' || child.value?.trim(),
        );
    });
}

/** Footnote ids already carry the clobber prefix; undo the sanitizer prefixing them twice. */
function restoreFootnoteIds() {
  return (tree: Node) =>
    visitElements(tree, (node) => {
      const id = node.properties?.id;
      if (typeof id === 'string' && id.startsWith(prefix + prefix))
        node.properties!.id = id.slice(prefix.length);
    });
}

/** Renders sanitized inline HTML (`<br>`, lists inside table cells, …) instead of its source text. */
export const markdownHtmlPlugins: Plugins = [
  dropTableWhitespace,
  rehypeRaw,
  [rehypeSanitize, schema],
  restoreFootnoteIds,
];

/** Raw HTML parsing re-walks the tree, so skip it for sources that cannot contain tags. */
export function mayContainHtml(source: string) {
  return source.includes('<');
}
