import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { Providers } from './app/providers';
import { initializeStorage } from './lib/storage';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
void initializeStorage().then(() =>
  createRoot(root).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  ),
);
