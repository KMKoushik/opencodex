import { expect, it } from 'vitest';
import { addressURL, browserFileURL, isBrowserFileURL } from './browser-url';
import { resolveFileLink } from '../workbench/file-link';

it('routes relative, absolute, and file HTML links without losing escaping or URL suffixes', () => {
  for (const href of [
    'tmp/report%20%231.html?view=1#summary',
    '/project/tmp/report%20%231.html?view=1#summary',
    'file:///project/tmp/report%20%231.html?view=1#summary',
  ]) {
    const target = resolveFileLink(href, '/project')!;
    const url = browserFileURL(target.directory, target.path, href);
    expect(url).toBe('file:///project/tmp/report%20%231.html?view=1#summary');
    expect(isBrowserFileURL(url)).toBe(true);
    expect(addressURL(url)).toBe(url);
  }
  for (const url of [
    'file:///project/source.ts',
    'file://other-host/report.html',
    'javascript:alert(1)',
  ])
    expect(isBrowserFileURL(url)).toBe(false);
});
