/**
 * Canvas frame runtime: React, the SDK, and the bridge to the host. It runs in a sandboxed
 * iframe with an opaque origin and no network access; the host sends the view's code, its
 * data, and the theme, and persists the view's writes.
 */
import * as React from 'react';
import * as JSXRuntime from 'react/jsx-runtime';
import { Component, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CanvasTheme, FrameMessage, HostMessage } from '@opencodex/contracts/canvas';
import * as SDK from './index';
import { loadModules } from './loader';
import { createStore, StoreContext } from './store';
import css from './styles.css';

const CHANNEL = 'opencodex-canvas';
type Outgoing = FrameMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'channel'>
    : never
  : never;
const post = (message: Outgoing) =>
  window.parent.postMessage({ channel: CHANNEL, ...message }, '*');

const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const container = document.getElementById('root')!;
const root = createRoot(container);
const builtins = { react: React, 'react/jsx-runtime': JSXRuntime, '@opencodex/canvas': SDK };
let store: ReturnType<typeof createStore> | undefined;
let generation = 0;

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <Failure error={this.state.error} /> : this.props.children;
  }
}

function Failure({ error }: { error: Error }) {
  return (
    <div className="cv-failure" role="alert">
      <p className="cv-failure-title">This canvas couldn’t render</p>
      <pre>{error.message}</pre>
    </div>
  );
}

function applyTheme(theme: CanvasTheme) {
  const rootStyle = document.documentElement.style;
  for (const [name, value] of Object.entries(theme.vars)) rootStyle.setProperty(name, value);
  rootStyle.colorScheme = theme.scheme;
  store?.setScheme(theme.scheme);
}

function run(modules: Record<string, string>, entry: string) {
  let App: ComponentType;
  try {
    const exports = loadModules(modules, entry, builtins);
    const view = exports.default;
    if (typeof view !== 'function')
      throw new Error(
        `${entry} must default-export a component: export default function App() { … }`,
      );
    App = view as ComponentType;
  } catch (cause) {
    root.render(<Failure error={cause instanceof Error ? cause : new Error(String(cause))} />);
    return;
  }
  root.render(
    <StoreContext.Provider value={store!}>
      <Boundary key={++generation}>
        <App />
      </Boundary>
    </StoreContext.Provider>,
  );
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  if (event.source !== window.parent || event.data?.channel !== CHANNEL) return;
  const message = event.data;
  switch (message.type) {
    case 'init':
      document.documentElement.dataset.mode = message.mode;
      store = createStore(message.data, (key, value) => post({ type: 'set', key, value }));
      applyTheme(message.theme);
      run(message.modules, message.entry);
      if (message.mode === 'inline') {
        let last = 0;
        new ResizeObserver(() => {
          const height = Math.ceil(container.getBoundingClientRect().height);
          if (height !== last) post({ type: 'size', height: (last = height) });
        }).observe(container);
      }
      break;
    case 'theme':
      applyTheme(message.theme);
      break;
    case 'modules':
      if (store) run(message.modules, message.entry);
      break;
    case 'data':
      store?.receive(message.key, message.value);
      break;
  }
});

post({ type: 'ready' });
