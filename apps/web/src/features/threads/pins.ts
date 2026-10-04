import { useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';

/*
 * Pins live in native session metadata, but OpenCode cannot list sessions by metadata.
 * This bounded index remembers pinned IDs seen by this client so old pinned threads can be
 * fetched by ID. Metadata stays authoritative; reads that show no pin remove the entry.
 */
const MAX_PINS = 50;
const listeners = new Set<() => void>();
let ids: string[] | undefined;

function read() {
  if (ids) return ids;
  try {
    const value: unknown = JSON.parse(readStorage('pinnedThreads') ?? '[]');
    ids = Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string').slice(0, MAX_PINS)
      : [];
  } catch {
    ids = [];
  }
  return ids;
}

export function rememberPinned(id: string, pinned: boolean) {
  const current = read();
  if (current.includes(id) === pinned) return;
  ids = pinned ? [id, ...current].slice(0, MAX_PINS) : current.filter((item) => item !== id);
  writeStorage('pinnedThreads', JSON.stringify(ids));
  for (const listener of listeners) listener();
}

export function usePinnedIDs() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, read);
}
