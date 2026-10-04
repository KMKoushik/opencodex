import { useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';

export const defaultChatFontSize = 14;
export const minChatFontSize = 12;
export const maxChatFontSize = 20;

let size: number | undefined;
const listeners = new Set<() => void>();

function getSize() {
  if (size === undefined) {
    const saved = Number(readStorage('chatFontSize') ?? NaN);
    size = validSize(saved) ? saved : defaultChatFontSize;
  }
  return size;
}

function validSize(value: number) {
  return Number.isInteger(value) && value >= minChatFontSize && value <= maxChatFontSize;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyInitialChatFontSize() {
  document.documentElement.style.setProperty('--chat-font-size', `${getSize()}px`);
}

function updateSize(next: number) {
  if (!validSize(next) || next === getSize()) return;
  size = next;
  // CSS and the virtual list's existing size observers handle reflow. Neither
  // the app shell nor transcript rows subscribe to this presentation preference.
  document.documentElement.style.setProperty('--chat-font-size', `${next}px`);
  writeStorage('chatFontSize', String(next));
  for (const listener of listeners) listener();
}

export function useChatFontSize() {
  return { size: useSyncExternalStore(subscribe, getSize), update: updateSize };
}
