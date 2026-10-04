import { expect, it } from 'vitest';
import { createDraftStore } from './draft-store';
import { reviewPrompt } from './review-comments';

it('moves the latest unsent draft to a fresh project chat without reusing its revision', () => {
  const store = createDraftStore();
  const actions = store.getState();
  actions.editText('one', 'Start here');
  actions.selectModel('one', { id: 'reasoner', providerID: 'provider', variant: 'high' });
  actions.attach('one', [new File(['context'], 'notes.txt')]);
  const before = actions.capture('one');
  actions.editText('one', 'Keep edits made while switching');
  actions.move('one', 'two');
  const moved = actions.capture('two');
  expect(store.getState().drafts.one).toBeUndefined();
  expect(moved).toMatchObject({
    text: 'Keep edits made while switching',
    model: before.model,
    attachments: before.attachments,
  });
  expect(moved.revision).toBeGreaterThan(before.revision);
  actions.acknowledge({ ...before, sessionID: 'two' });
  expect(actions.capture('two')).toEqual(moved);
  actions.editText('three', 'Another draft');
  actions.move('two', 'three');
  expect(actions.capture('two')).toEqual(moved);
  expect(actions.capture('three').text).toBe('Another draft');
});

it('persists model and thinking per project without persisting drafts or changing another project', () => {
  let saved = '';
  let writes = 0;
  const store = createDraftStore({
    saveModels: (models) => {
      saved = JSON.stringify(models);
      writes++;
    },
  });
  const first = { id: 'reasoner', providerID: 'provider', variant: 'high' };
  const second = { id: 'other', providerID: 'provider', variant: 'low' };
  store.getState().rememberModel('/one', first);
  store.getState().rememberModel('/two', second);
  store.getState().editText('chat', 'unsent');
  store.getState().rememberModel('/one', first);
  expect(writes).toBe(2);
  store.getState().rememberModel('/one', { ...first, variant: undefined });
  const reopened = createDraftStore({ models: JSON.parse(saved) });
  expect(reopened.getState().projectModels).toEqual({
    '/one': { id: 'reasoner', providerID: 'provider' },
    '/two': second,
  });
  expect(reopened.getState().drafts).toEqual({});
  for (let index = 0; index < 65; index++)
    store.getState().rememberModel(`/project-${index}`, first);
  expect(Object.keys(store.getState().projectModels)).toHaveLength(64);
  expect(store.getState().projectModels['/project-0']).toBeUndefined();
});

it('persists thinking per provider/model, including an explicit Default', () => {
  let saved = '{}';
  const store = createDraftStore({
    saveVariants: (variants) => {
      saved = JSON.stringify(variants);
    },
  });
  const first = { id: 'reasoner', providerID: 'one', variant: 'high' };
  const second = { id: 'reasoner', providerID: 'two', variant: 'medium' };
  store.getState().rememberVariant(first);
  store.getState().rememberVariant(second);
  store.getState().rememberVariant({ ...first, variant: undefined });
  const reopened = createDraftStore({ variants: JSON.parse(saved) });
  expect(reopened.getState().modelVariants).toEqual({
    '["one","reasoner"]': null,
    '["two","reasoner"]': 'medium',
  });
});

it('keeps review context separate and preserves comments edited during a send', () => {
  const store = createDraftStore();
  const actions = store.getState();
  actions.editText('one', 'Please fix these');
  const comment = {
    id: 'comment',
    target: { path: 'a.ts', start: 9, end: 10, side: 'old' as const, quote: 'old code' },
    text: 'Keep this check',
  };
  actions.saveComment('one', comment);
  const sent = actions.capture('one');
  expect(sent.text).toBe('Please fix these');
  expect(reviewPrompt(sent.text, sent.comments)).toContain('a.ts:9–10 (old)');
  actions.saveComment('one', { ...comment, text: 'Use the new check' });
  actions.acknowledge(sent);
  expect(actions.capture('one').comments?.[0]?.text).toBe('Use the new check');
  expect(sent.comments?.[0]?.text).toBe('Keep this check');
  actions.editText('one', '');
  expect(actions.capture('one').comments).toHaveLength(1);
  actions.saveComment('two', {
    id: 'quote',
    target: { messageID: 'response', ordinal: 0, quote: 'response excerpt' },
    text: '',
  });
  actions.removeComment('one', 'comment');
  expect(store.getState().drafts.one).toBeUndefined();
  const quote = actions.capture('two');
  expect(reviewPrompt(quote.text, quote.comments)).toContain('> response excerpt');
  actions.acknowledge(quote);
  expect(store.getState().drafts.two).toBeUndefined();
});

it('acknowledges only the captured revision, even if newer text is identical', () => {
  const store = createDraftStore();
  const actions = store.getState();
  actions.editText('one', 'hello');
  actions.selectModel('one', { id: 'reasoner', providerID: 'provider', variant: 'high' });
  actions.editText('two', 'another session');
  const other = store.getState().drafts.two;
  const sent = actions.capture('one');
  actions.editText('one', 'newer text');
  actions.editText('one', 'hello');
  actions.acknowledge(sent);
  expect(store.getState().drafts.one?.text).toBe('hello');
  expect(store.getState().drafts.two).toBe(other);
  expect(actions.capture('one').model).toBe(sent.model);
  actions.acknowledge(actions.capture('one'));
  expect(store.getState().drafts.one).toBeUndefined();
  actions.editText('one', 'hello');
  actions.acknowledge(sent);
  expect(store.getState().drafts.one?.text).toBe('hello');
});

it('captures immutable send intent while edits preserve model selector identity', () => {
  const store = createDraftStore();
  const actions = store.getState();
  actions.editText('one', 'send this');
  actions.selectModel('one', { id: 'reasoner', providerID: 'provider', variant: 'low' });
  const image = new File(['image'], 'image.png', { type: 'image/png' });
  actions.attach('one', [image]);
  const sent = actions.capture('one');
  actions.editText('one', 'next message');
  expect(store.getState().drafts.one?.model).toBe(sent.model);
  actions.selectModel('one', { id: 'reasoner', providerID: 'provider', variant: 'high' });
  expect(actions.capture('one').attachments).toBe(sent.attachments);
  actions.removeAttachment('one', sent.attachments![0]!.id);
  actions.attach('one', [new File(['next'], 'next.txt')]);
  actions.acknowledge(sent);
  expect(sent.text).toBe('send this');
  expect(sent.model?.variant).toBe('low');
  expect(sent.attachments?.[0]?.file).toBe(image);
  expect(actions.capture('one').attachments?.[0]?.file.name).toBe('next.txt');
  expect(actions.capture('one')).toMatchObject({
    text: 'next message',
    model: { variant: 'high' },
  });
});
