import type { ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import { CANVAS_LINK } from '@opencodex/contracts/canvas';
import { CanvasCard } from '../canvas/canvas-card';

type Node = NonNullable<ExtraProps['node']>['children'][number];
const text = (node: Node): string =>
  node.type === 'text' ? node.value : 'children' in node ? node.children.map(text).join('') : '';

/** A paragraph that is only a canvas link shows the canvas itself. */
export function MarkdownParagraph({ node, ...props }: ComponentProps<'p'> & ExtraProps) {
  const content = node?.children.filter((child) => child.type !== 'text' || child.value.trim());
  const link = content?.length === 1 ? content[0] : undefined;
  if (link?.type === 'element' && link.tagName === 'a') {
    const match = CANVAS_LINK.exec(String(link.properties.href ?? ''));
    if (match) return <CanvasCard id={match[1]!} label={text(link) || 'Canvas'} />;
  }
  return <p {...props} />;
}
