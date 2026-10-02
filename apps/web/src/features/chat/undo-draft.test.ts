import { expect, it } from 'vitest';
import { undoDraft } from './undo-draft';
import { createDraftStore } from './draft-store';

it('restores the undone text and attachment bytes without losing newer composer edits', async () => {
  const restored = await undoDraft({
    id: 'message',
    type: 'user',
    time: { created: 0 },
    text: 'Review these files',
    files: [
      {
        name: 'image.png',
        mime: 'image/png',
        data: btoa('\x89PNG\x00\xff'),
        source: { type: 'inline' },
      },
      { name: 'notes.txt', mime: 'text/plain', data: btoa('notes'), source: { type: 'inline' } },
      {
        name: 'report.pdf',
        mime: 'application/pdf',
        data: btoa('%PDF'),
        source: { type: 'inline' },
      },
    ],
  });
  const actions = createDraftStore().getState();
  actions.editText('session', '/undo');
  actions.selectModel('session', { id: 'model', providerID: 'provider' });
  const command = actions.capture('session');
  expect(actions.restore(command, restored)).toBe(true);
  const draft = actions.capture('session');
  expect(draft.text).toBe('Review these files');
  expect(draft.model).toEqual(command.model);
  expect(draft.attachments?.map(({ file }) => [file.name, file.type])).toEqual([
    ['image.png', 'image/png'],
    ['notes.txt', 'text/plain'],
    ['report.pdf', 'application/pdf'],
  ]);
  expect(new Uint8Array(await draft.attachments![0]!.file.arrayBuffer())).toEqual(
    new Uint8Array([137, 80, 78, 71, 0, 255]),
  );
  expect(await draft.attachments![1]!.file.text()).toBe('notes');
  expect(await draft.attachments![2]!.file.text()).toBe('%PDF');
  actions.acknowledge(command);
  expect(actions.capture('session')).toEqual(draft);
  actions.editText('session', '/undo');
  const next = actions.capture('session');
  actions.editText('session', 'Keep my new draft');
  expect(actions.restore(next, restored)).toBe(false);
  expect(actions.capture('session').text).toBe('Keep my new draft');
  expect(actions.capture('session').attachments).toBe(draft.attachments);
});
