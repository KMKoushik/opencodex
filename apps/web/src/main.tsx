import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { Providers } from './app/providers';
import { applyInitialTheme } from './features/theme/use-theme';
import { initializeStorage } from './lib/storage';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
if (window.desktop) document.documentElement.dataset.platform = window.desktop.platform;
void initializeStorage().then(() => {
  applyInitialTheme();
  createRoot(root).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  );
});
