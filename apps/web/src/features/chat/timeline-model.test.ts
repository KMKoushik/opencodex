import { expect, it } from 'vitest';
import type { SessionMessageInfo } from '@opencodex/contracts';
import { createTimelineProjector, createTurnGrouper, type DisplayRow } from './timeline-model';

const user = (id: string): SessionMessageInfo => ({
  id,
  type: 'user',
  text: 'Explain the change',
  time: { created: 1 },
});
const assistant = (
  id: string,
  texts: string[],
  completed = true,
): Extract<SessionMessageInfo, { type: 'assistant' }> => ({
  id,
  type: 'assistant',
  agent: 'build',
  model: { providerID: 'test', id: 'test' },
  time: { created: 2, ...(completed ? { completed: 3 } : {}) },
  content: texts.map((text) => ({ type: 'text', text })),
});
const copyable = (rows: DisplayRow[]) =>
  rows.filter((row) => row.type === 'text' && row.copyable).map((row) => row.id);

it('offers copy only for each finished turn’s last nonempty answer, even when work is expanded', () => {
  const markdown = '| Decision | Detail |\n| --- | --- |\n| **Keep it** | `code` |';
  const final = assistant('answer', ['Earlier part', markdown, '   ']);
  const messages = [
    user('older-user'),
    assistant('older-answer', ['Previous answer']),
    user('current-user'),
    assistant('progress', ['Checking the implementation.']),
    final,
  ];
  const project = createTimelineProjector();
  const group = createTurnGrouper();
  const rows = project(messages);
  const active = group(rows, messages, true, new Map());
  expect(copyable(active)).toEqual(['older-answer:text:0']);
  const done = group(rows, messages, false, new Map());
  expect(copyable(done)).toEqual(['older-answer:text:0', 'answer:text:1']);
  const answer = done.find((row) => row.id === 'answer:text:1');
  expect(answer).toMatchObject({ text: markdown });
  const header = done.find((row) => row.type === 'turn');
  const expanded = group(rows, messages, false, new Map([[header!.id, true]]));
  expect(copyable(expanded)).toEqual(copyable(done));
  expect(expanded.find((row) => row.id === answer!.id)).toBe(answer);
  expect(expanded.some((row) => row.id === 'progress:text:0')).toBe(true);
  const streaming = [...messages.slice(0, -1), assistant('answer', ['Partial answer'], false)];
  expect(copyable(group(project(streaming), streaming, false, new Map()))).toEqual([
    'older-answer:text:0',
  ]);
});
