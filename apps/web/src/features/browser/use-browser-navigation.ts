import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { resolveFileLink } from '../workbench/file-link';
import { browserFileURL, isBrowserFileURL } from './browser-url';
import { browserFileDirectories, browserViews, navigateView, updatePage } from './browser-runtime';

const requests = new WeakMap<HTMLElement, { url: string }>();

export function useBrowserNavigation() {
  return useMutation({
    mutationFn: async ({ id, url }: { id: string; url: string }) => {
      const view = browserViews.get(id);
      if (!view) return;
      const request = { url };
      requests.set(view, request);
      if (!isBrowserFileURL(url)) {
        navigateView(id, url);
        return;
      }
      updatePage(id, { loading: true, error: undefined, crashed: undefined });
      const target = resolveFileLink(url, '/');
      if (!target || !window.desktop) throw new Error('Choose a local HTML file.');
      // The service may be remote: never interpret its files as paths on the desktop host.
      const location = await api.fileLocation(target.directory, target.path);
      if (browserViews.get(id) !== view || requests.get(view) !== request) return;
      const canonical = resolveFileLink(location.path, '/');
      if (!canonical) throw new Error('Choose a local HTML file.');
      const file = browserFileURL(canonical.directory, canonical.path, url);
      browserFileDirectories.set(id, new URL('.', file).href);
      await window.desktop.loadBrowserFile(view.getWebContentsId(), file);
    },
    onError: (error, { id, url }) => {
      const view = browserViews.get(id);
      if (view && requests.get(view)?.url === url)
        updatePage(id, { loading: false, error: { description: error.message, url } });
    },
  });
}
