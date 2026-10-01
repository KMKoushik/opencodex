import { Ghostty } from 'ghostty-web';
import wasmURL from 'ghostty-web/ghostty-vt.wasm?url';

let shared: Promise<Ghostty> | undefined;
export function loadGhostty() {
  return (shared ??= Ghostty.load(wasmURL).catch((error) => {
    shared = undefined;
    throw error;
  }));
}

export function terminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  return {
    background: token('surface'),
    foreground: token('text'),
    cursor: token('text'),
    cursorAccent: token('surface'),
    selectionBackground: token('selected'),
    black: token('surface-under'),
    brightBlack: token('text-tertiary'),
    red: token('error'),
    brightRed: token('error'),
    green: token('success'),
    brightGreen: token('success'),
    yellow: token('project-orange'),
    brightYellow: token('project-orange'),
    blue: token('accent-text'),
    brightBlue: token('accent-text'),
    magenta: token('project-purple'),
    brightMagenta: token('project-purple'),
    cyan: token('project-blue'),
    brightCyan: token('project-blue'),
    white: token('text-secondary'),
    brightWhite: token('text'),
  };
}
