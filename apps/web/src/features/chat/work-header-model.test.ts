import { expect, it } from 'vitest';
import type { SessionMessageInfo } from '@opencodex/contracts';
import { createTimelineProjector } from './timeline-model';
import { createWorkHeaderProjector } from './work-header-model';

it('uses native work boundaries and retains disclosure identity when earlier history is prepended', () => {
  const assistant = (id: string, created: number, completed?: number): SessionMessageInfo => ({
    id,
    type: 'assistant',
    agent: 'build',
    model: { id: 'model', providerID: 'provider' },
    time: { created, completed },
    content: [{ type: 'reasoning', text: 'Inspecting the workspace.' }],
  });
  const skill: SessionMessageInfo = {
    id: 'skill',
    type: 'skill',
    skill: 'review',
    name: 'review',
    text: 'Skill body stays hidden.',
    time: { created: 500 },
  };
  const first = assistant('first', 1000, 20_000);
  const idle: SessionMessageInfo = {
    id: 'idle',
    type: 'idle',
    outcome: 'interrupted',
    time: { created: 28_000 },
  };
  const current = assistant('current', 40_000);
  const earlier = assistant('earlier', 30_000, 35_000);
  const projectContent = createTimelineProjector();
  const projectHeaders = createWorkHeaderProjector();
  const project = (messages: SessionMessageInfo[]) =>
    projectHeaders(messages, projectContent(messages));
  const initial = project([skill, first, idle, current]);
  const headers = initial.rows.filter((row) => row.type === 'work-header');
  expect(headers).toMatchObject([
    { startedAt: 1000, completedAt: 28_000, outcome: 'interrupted', hasActivity: true },
    { startedAt: 40_000, completedAt: undefined, hasActivity: true },
  ]);
  expect(initial.scopes.size).toBe(2);
  expect(initial.rows.filter((row) => row.type === 'activity')[0]?.entries[0]).toMatchObject({
    type: 'skill',
    message: skill,
  });
  expect(initial.latestWorkID).toBe(headers[1]!.id);
  const extended = project([skill, first, idle, earlier, current]);
  const extendedHeaders = extended.rows.filter((row) => row.type === 'work-header');
  expect(extendedHeaders[0]).toBe(headers[0]);
  expect(extendedHeaders[1]).toMatchObject({
    id: headers[1]!.id,
    startedAt: 30_000,
    completedAt: undefined,
  });
  expect(new Set(extended.scopes.values()).size).toBe(2);
});
