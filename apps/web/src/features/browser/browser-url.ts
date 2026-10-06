const localHost =
  /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|[\w-]+(?:\.[\w-]+)*\.localhost)(?::\d+)?(?:[/?#]|$)/i;

export function isWebURL(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function isHTMLPath(path: string) {
  return /\.html?$/i.test(path);
}

export function isBrowserFileURL(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'file:' &&
      (!url.hostname || url.hostname === 'localhost') &&
      isHTMLPath(decodeURIComponent(url.pathname))
    );
  } catch {
    return false;
  }
}

export function browserFileURL(directory: string, path: string, href: string) {
  const url = new URL('file:///');
  url.pathname = `${directory.replace(/\/$/, '')}/${path}`
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const original = new URL(href, url);
  url.search = original.search;
  url.hash = original.hash;
  return url.href;
}

/** Development servers and other pages on this machine, which open in the browser panel. */
export function isLocalWebURL(value: string) {
  if (!isWebURL(value)) return false;
  const { host } = new URL(value);
  return localHost.test(host);
}

/** Turns address bar text into a URL: a web address, a local server, or a search. */
export function addressURL(input: string) {
  const text = input.trim();
  if (!text) return;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text))
    return isWebURL(text) || isBrowserFileURL(text) ? text : undefined;
  if (localHost.test(text) || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)/.test(text))
    return `http://${text}`;
  if (!/\s/.test(text) && /^[^/?#]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text)) {
    const url = `https://${text}`;
    if (isWebURL(url)) return url;
  }
  return `https://www.google.com/search?${new URLSearchParams({ q: text })}`;
}

export const newBrowserTabID = () => crypto.randomUUID();
