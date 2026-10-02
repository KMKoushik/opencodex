import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const editorHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [tags.keyword, tags.typeName, tags.className],
      color: 'var(--syntax-keyword)',
      fontWeight: 'var(--syntax-keyword-weight)',
    },
    { tag: [tags.string, tags.regexp], color: 'var(--syntax-string)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--text)' },
    { tag: [tags.comment, tags.meta], color: 'var(--syntax-comment)' },
    { tag: [tags.punctuation, tags.operator], color: 'var(--syntax-punctuation)' },
  ]),
);

export async function editorLanguage(path: string): Promise<Extension> {
  if (/\.[cm]?[jt]sx?$/i.test(path)) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ typescript: /\.[cm]?tsx?$/i.test(path), jsx: /x$/i.test(path) });
  }
  if (/\.(json|jsonc)$/i.test(path)) return (await import('@codemirror/lang-json')).json();
  if (/\.css$/i.test(path)) return (await import('@codemirror/lang-css')).css();
  if (/\.html?$/i.test(path)) return (await import('@codemirror/lang-html')).html();
  return [];
}
