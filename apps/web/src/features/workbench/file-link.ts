export type FileTarget = { directory: string; path: string };
export type FileRequest = FileTarget & { sessionID: string };

/** Resolve on the service's filesystem, never against the browser's origin. */
export function resolveFileLink(href: string, directory: string): FileTarget | undefined {
  if (!href || href.startsWith('#') || href.startsWith('//')) return;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^file:/i.test(href)) return;
  try {
    const base = new URL('file:///');
    base.pathname = `${directory.replace(/\/$/, '').split('/').map(encodeURIComponent).join('/')}/`;
    const url = new URL(href, base);
    if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return;
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes('\0') || decoded.includes('\\') || decoded.endsWith('/')) return;
    // Encoded path segments can contain dots/slashes too; normalize after decoding.
    const segments: string[] = [];
    for (const segment of decoded.split('/')) {
      if (segment === '..') segments.pop();
      else if (segment && segment !== '.') segments.push(segment);
    }
    const absolute = `/${segments.join('/')}`;
    const root = directory.replace(/\/$/, '');
    if (absolute.startsWith(`${root}/`))
      return { directory, path: absolute.slice(root.length + 1) };
    const name = segments.pop();
    if (!name) return;
    return { directory: `/${segments.join('/')}`, path: name };
  } catch {
    return;
  }
}
