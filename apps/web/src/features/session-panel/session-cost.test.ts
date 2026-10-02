import { expect, it } from 'vitest';
import type { SessionInfo, SessionListOutput } from '@opencodex/contracts';
import { loadSubagentCosts } from './session-cost';

const child = (id: string, parentID: string, cost: number): SessionInfo => ({
  id,
  parentID,
  cost,
  projectID: 'project',
  location: { directory: '/project' },
  time: { created: 1, updated: 1 },
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
});

it('counts every paginated and nested subagent once without counting the parent', async () => {
  const pages: Record<string, SessionListOutput> = {
    'parent:': { data: [child('a', 'parent', 2)], cursor: { next: 'more' } },
    'parent:more': {
      data: [child('a', 'parent', 2), child('b', 'parent', 3)],
      cursor: {},
    },
    'a:': { data: [child('nested', 'a', 4)], cursor: {} },
    'b:': { data: [], cursor: {} },
    'nested:': { data: [child('parent', 'nested', 100)], cursor: {} },
  };
  const calls: string[] = [];
  const costs = await loadSubagentCosts(
    'parent',
    new AbortController().signal,
    async (id, cursor) => {
      const key = `${id}:${cursor ?? ''}`;
      calls.push(key);
      if (!pages[key]) throw new Error('Unexpected metadata request');
      return pages[key];
    },
  );
  expect(costs.map((session) => session.id).sort()).toEqual(['a', 'b', 'nested']);
  expect(costs.reduce((total, session) => total + session.cost, 0)).toBe(9);
  expect(calls.sort()).toEqual(Object.keys(pages).sort());
});

it('fails instead of displaying a partial cost when a nested metadata read fails', async () => {
  await expect(
    loadSubagentCosts('parent', new AbortController().signal, async (id) => {
      if (id === 'parent') return { data: [child('a', 'parent', 2)], cursor: {} };
      throw new Error('Metadata unavailable');
    }),
  ).rejects.toThrow('Metadata unavailable');
});
