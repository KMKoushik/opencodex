import { useEffect, useState, type ReactNode } from 'react';
import { createEditorDrafts, EditorDraftContext } from './editor-drafts';

export function EditorDraftProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createEditorDrafts);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!Object.keys(store.getState().edits).length) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [store]);
  return <EditorDraftContext.Provider value={store}>{children}</EditorDraftContext.Provider>;
}
