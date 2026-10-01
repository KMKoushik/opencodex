import { createContext, useContext } from 'react';
import { createStore } from 'zustand/vanilla';
import type { EditorState } from '@codemirror/state';

type Edit = { state: EditorState; version: string };
export function createEditorDrafts() {
  return createStore<{
    edits: Readonly<Record<string, Edit | undefined>>;
    set: (key: string, edit: Edit) => void;
    discard: (key: string) => void;
    saved: (key: string, captured: EditorState, version: string) => void;
  }>((set) => ({
    edits: {},
    set: (key, edit) => set((value) => ({ edits: { ...value.edits, [key]: edit } })),
    discard: (key) =>
      set((value) => {
        const edits = { ...value.edits };
        delete edits[key];
        return { edits };
      }),
    saved: (key, captured, version) =>
      set((value) => {
        const edits = { ...value.edits };
        if (edits[key]?.state.doc === captured.doc) delete edits[key];
        else if (edits[key]) edits[key] = { ...edits[key], version };
        return { edits };
      }),
  }));
}
export const EditorDraftContext = createContext<ReturnType<typeof createEditorDrafts> | null>(null);
export function useEditorDrafts() {
  const store = useContext(EditorDraftContext);
  if (!store) throw new Error('EditorDraftProvider is missing');
  return store;
}
export const editorKey = (directory: string, path: string) => JSON.stringify([directory, path]);
