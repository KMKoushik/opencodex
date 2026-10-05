import { expect, it } from 'vitest';
import { createWorkbenchStore, defaultWorkspaceState, serializeWorkbench } from './workbench-store';

it('restores independent session layouts and document tabs without saving document data', () => {
  const store = createWorkbenchStore();
  store.getState().layout('one', { open: true, expanded: true, panel: 'changes', width: 640 });
  store.getState().workspace('one', {
    ...defaultWorkspaceState,
    tabs: [
      {
        id: 'notes',
        directory: '/project',
        path: 'notes.md',
        kind: 'file',
        mode: 'working',
        pinned: true,
      },
    ],
    selected: 'notes',
    treeVisible: false,
  });
  store.getState().layout('two', { open: false, panel: 'subagents' });
  const reopened = createWorkbenchStore(serializeWorkbench(store.getState().entries));
  expect(reopened.getState().entries.one).toEqual(store.getState().entries.one);
  expect(reopened.getState().entries.two?.layout).toMatchObject({
    open: false,
    expanded: false,
    panel: 'subagents',
    width: 820,
  });
  expect(reopened.getState().entries.two?.workspace.tabs).toEqual([]);
  reopened.getState().layout('one', { expanded: false });
  expect(reopened.getState().entries.one?.layout.width).toBe(640);
  const legacy = JSON.parse(serializeWorkbench(store.getState().entries));
  delete legacy.entries[0][1].layout.expanded;
  expect(createWorkbenchStore(JSON.stringify(legacy)).getState().entries.one?.layout.expanded).toBe(
    false,
  );
  expect(createWorkbenchStore('{broken').getState().entries).toEqual({});
});

it('bounds remembered sessions and native preference payloads, preserving the selected tab', () => {
  const store = createWorkbenchStore();
  for (let index = 0; index < 100; index++)
    store.getState().layout(`session-${index}`, { open: true });
  expect(Object.keys(store.getState().entries)).toHaveLength(64);
  const tabs = Array.from({ length: 100 }, (_, index) => ({
    id: `${index}`,
    directory: '/project',
    path: `${index}${'x'.repeat(1000)}.md`,
    kind: 'file' as const,
    mode: 'working' as const,
    pinned: true,
  }));
  store.getState().workspace('latest', { ...defaultWorkspaceState, tabs, selected: '0' });
  expect(store.getState().entries.latest?.workspace.tabs).toHaveLength(64);
  const saved = serializeWorkbench(store.getState().entries);
  expect(saved.length).toBeLessThanOrEqual(16_384);
  const restored = createWorkbenchStore(saved).getState().entries.latest?.workspace;
  expect(restored?.selected).toBe('0');
  expect(restored?.tabs.some((tab) => tab.id === '0')).toBe(true);
  expect(store.getState().entries.latest?.workspace.tabs).toHaveLength(64);
});
