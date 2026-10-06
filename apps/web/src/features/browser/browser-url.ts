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
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) return isWebURL(text) ? text : undefined;
  if (localHost.test(text) || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)/.test(text))
    return `http://${text}`;
  if (!/\s/.test(text) && /^[^/?#]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text)) {
    const url = `https://${text}`;
    if (isWebURL(url)) return url;
  }
  return `https://www.google.com/search?${new URLSearchParams({ q: text })}`;
}

export const newBrowserTabID = () => crypto.randomUUID();
