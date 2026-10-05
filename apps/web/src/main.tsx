import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { Providers } from './app/providers';
import { applyInitialTheme } from './features/theme/use-theme';
import { applyInitialChatFontSize } from './features/settings/chat-font-size';
import { initializeStorage } from './lib/storage';
import { appName, development } from './features/brand/identity';
import './styles/globals.css';

document.title = appName;
if (development) {
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((icon) => {
    icon.href = '/favicon-dev.png';
    icon.type = 'image/png';
    icon.sizes.value = '32x32';
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
if (window.desktop) {
  document.documentElement.dataset.platform = window.desktop.platform;
  const setFullscreen = (fullscreen: boolean) => {
    document.documentElement.dataset.fullscreen = String(fullscreen);
  };
  let changed = false;
  const unsubscribe = window.desktop.onFullscreenChanged?.((fullscreen) => {
    changed = true;
    setFullscreen(fullscreen);
  });
  // Subscribe first; a transition must win over an older startup snapshot.
  void window.desktop
    .getFullscreen?.()
    .then((fullscreen) => {
      if (!changed) setFullscreen(fullscreen);
    })
    .catch((error: unknown) => console.error('Could not read window fullscreen state.', error));
  import.meta.hot?.dispose(() => unsubscribe?.());
}
void initializeStorage().then(() => {
  applyInitialTheme();
  applyInitialChatFontSize();
  createRoot(root).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  );
});
