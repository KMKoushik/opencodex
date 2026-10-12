/**
 * Server render used by `canvas_check`: runs the view once with its saved data, inside a
 * Node vm context the gateway creates, to catch errors before the user sees them.
 */
import * as React from 'react';
import type { ComponentType } from 'react';
import * as JSXRuntime from 'react/jsx-runtime';
import { renderToString } from 'react-dom/server.browser';
import * as SDK from './index';
import { loadModules } from './loader';
import { createStore, StoreContext } from './store';

const builtins = { react: React, 'react/jsx-runtime': JSXRuntime, '@opencodex/canvas': SDK };

function render(input: string) {
  const { modules, entry, data } = JSON.parse(input) as {
    modules: Record<string, string>;
    entry: string;
    data: Record<string, unknown>;
  };
  const exports = loadModules(modules, entry, builtins);
  if (typeof exports.default !== 'function')
    throw new Error(
      `${entry} must default-export a component: export default function App() { … }`,
    );
  const App = exports.default as ComponentType;
  const store = createStore(data, () => {});
  return renderToString(
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>,
  );
}

(globalThis as { CanvasSSR?: unknown }).CanvasSSR = { render };
