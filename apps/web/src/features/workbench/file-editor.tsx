import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { FloppyDiskIcon, Undo03Icon } from '@hugeicons/core-free-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { MAX_PREVIEW_BYTES, type WorkspaceFile } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import type { AnnotationTarget } from './annotation';
import { FileComments } from './file-comments';
import { commentGutter, commentViewport, commentWidgets } from './comment-widgets';
import { editorKey, useEditorDrafts } from './editor-drafts';
import { editorLanguage, editorHighlighting } from './editor-language';

export function FileEditor({
  directory,
  path,
  file,
  sessionID,
  toolbarElement,
}: {
  directory: string;
  path: string;
  file: Extract<WorkspaceFile, { kind: 'text' }>;
  sessionID: string;
  toolbarElement?: HTMLElement | null;
}) {
  const drafts = useEditorDrafts();
  const key = editorKey(directory, path);
  const dirty = useStore(drafts, (state) => Boolean(state.edits[key]));
  const [annotation, setAnnotation] = useState<AnnotationTarget>();
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const [commentView, setCommentView] = useState<EditorView | null>(null);
  const currentFile = useRef(file);
  const syncing = useRef(false);
  const client = useQueryClient();
  const save = useMutation({
    mutationKey: ['file-save', directory, path],
    gcTime: 0,
    mutationFn: async (captured: { state: EditorState; version: string }) =>
      api.saveFile({
        directory,
        path,
        text: captured.state.sliceDoc(),
        version: captured.version,
      }),
    onSuccess: (result, captured) => {
      if (result.kind !== 'text') return;
      currentFile.current = result;
      drafts.getState().saved(key, captured.state, result.version);
      client.setQueryData(['workspace', 'file', directory, path], result);
      void client.invalidateQueries({ queryKey: ['workspace', 'diff', directory] });
      void client.invalidateQueries({ queryKey: ['workspace', 'vcs', directory] });
    },
    onError: () => {
      void client.invalidateQueries({
        queryKey: ['workspace', 'file', directory, path],
        exact: true,
      });
    },
  });
  const saveRef = useRef(() => {});
  const beginComment = useCallback(
    (editor: EditorView, from: number, to: number) => {
      const start = editor.state.doc.lineAt(from);
      const end = editor.state.doc.lineAt(to > from ? to - 1 : to);
      setAnnotation({
        path,
        directory,
        version: currentFile.current.version,
        start: start.number,
        end: end.number,
        quote: editor.state.sliceDoc(start.from, Math.min(end.to, start.from + 8000)),
      });
    },
    [path, directory],
  );
  useEffect(() => {
    saveRef.current = () => {
      const edit = drafts.getState().edits[key];
      if (edit && !save.isPending) save.mutate(edit);
    };
  });
  useEffect(() => {
    const edit = drafts.getState().edits[key];
    const language = new Compartment();
    const state = EditorState.create({
      doc: edit?.state.doc ?? currentFile.current.text,
      selection: edit?.state.selection,
      extensions: [
        lineNumbers(),
        commentGutter(beginComment),
        highlightActiveLine(),
        drawSelection(),
        history(),
        commentWidgets,
        commentViewport,
        editorHighlighting,
        language.of([]),
        EditorState.transactionFilter.of((transaction) => {
          if (!transaction.docChanged || syncing.current) return transaction;
          const edits = drafts.getState().edits;
          if (!edits[key] && Object.keys(edits).length >= 8) {
            setError('Save or discard an open edit before editing another file (8-file limit).');
            return [];
          }
          if (transaction.newDoc.length > MAX_PREVIEW_BYTES) {
            setError('This edit would exceed the file size limit. Keep this document under 2 MiB.');
            return [];
          }
          return transaction;
        }),
        EditorState.lineSeparator.of(currentFile.current.text.includes('\r\n') ? '\r\n' : '\n'),
        keymap.of([
          {
            key: 'Mod-Shift-m',
            run: (editor) => {
              const { from, to } = editor.state.selection.main;
              beginComment(editor, from, to);
              return true;
            },
          },
          {
            key: 'Mod-s',
            run: () => {
              saveRef.current();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.contentAttributes.of({
          'aria-label': `File contents: ${path}`,
          'data-shortcut-boundary': '',
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || syncing.current) return;
          setError('');
          drafts.getState().set(key, {
            state: update.state,
            version: drafts.getState().edits[key]?.version ?? currentFile.current.version,
          });
        }),
      ],
    });
    const editor = new EditorView({ state, parent: container.current! });
    view.current = editor;
    setCommentView(editor);
    let disposed = false;
    void editorLanguage(path)
      .then((extension) => {
        if (!disposed) editor.dispatch({ effects: language.reconfigure(extension) });
      })
      .catch(() => {
        /* Plain text editing remains available if a language chunk cannot load. */
      });
    return () => {
      disposed = true;
      editor.destroy();
      view.current = null;
    };
  }, [directory, path, drafts, key, beginComment]);
  useEffect(() => {
    if (drafts.getState().edits[key]) return;
    currentFile.current = file;
    const editor = view.current;
    if (editor && editor.state.sliceDoc() !== file.text) {
      syncing.current = true;
      try {
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: file.text } });
      } finally {
        syncing.current = false;
      }
    }
  }, [file, drafts, key]);
  const stale = dirty && drafts.getState().edits[key]?.version !== file.version;
  const controls = (
    <div className="wb-actions">
      {dirty && <span className="wb-note">Unsaved edits</span>}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Discard edits"
        disabled={!dirty || save.isPending}
        onClick={() => setDiscard(true)}
      >
        <HugeiconsIcon icon={Undo03Icon} size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={save.isPending ? 'Saving file…' : 'Save file'}
        title="Save file (Cmd/Ctrl+S)"
        disabled={!dirty || save.isPending}
        onClick={() => saveRef.current()}
      >
        <HugeiconsIcon icon={FloppyDiskIcon} size={16} />
      </Button>
    </div>
  );
  return (
    <div className="wb-file-editor">
      {toolbarElement ? (
        createPortal(controls, toolbarElement)
      ) : (
        <div className="wb-subtoolbar">{controls}</div>
      )}
      {stale && (
        <p className="wb-notice">
          The disk version changed. Your unsaved edits are kept here. Copy them or discard to load
          the new version.
        </p>
      )}
      {(save.isError || error) && (
        <p role="alert" className="wb-notice text-error">
          {save.error?.message || error}
        </p>
      )}
      <div className="wb-editor" ref={container} />
      <FileComments
        editor={commentView}
        directory={directory}
        path={path}
        version={file.version}
        sessionID={sessionID}
        pending={annotation}
        onClose={() => {
          setAnnotation(undefined);
          view.current?.focus();
        }}
      />
      {discard && (
        <Dialog title="Discard file edits?" onClose={() => setDiscard(false)}>
          <p>Replace your unsaved edits to {path} with the latest loaded disk version?</p>
          <div className="wb-actions">
            <Button variant="ghost" onClick={() => setDiscard(false)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                currentFile.current = file;
                const editor = view.current;
                if (editor) {
                  syncing.current = true;
                  try {
                    editor.dispatch({
                      changes: { from: 0, to: editor.state.doc.length, insert: file.text },
                    });
                  } finally {
                    syncing.current = false;
                  }
                }
                drafts.getState().discard(key);
                setError('');
                save.reset();
                setDiscard(false);
              }}
            >
              Discard edits
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
