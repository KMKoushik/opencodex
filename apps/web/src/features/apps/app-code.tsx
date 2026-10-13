import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, lineNumbers } from '@codemirror/view';
import { api } from '../../lib/api';
import { canvasFilesKey } from '../canvas/canvas-context';
import { editorHighlighting, editorLanguage } from '../workbench/editor-language';
import { useCodeFind } from '../find/code-find';
import { useFindScope } from '../find/find-scope';
import '../workbench/workbench.css';

/** The order a reader wants: the view, the server, then shared files. */
const rank = (name: string) => (name === 'app.tsx' ? 0 : name === 'server.ts' ? 1 : 2);

/** An app's source, read-only. Changes go through its chat, which also checks them. */
export function AppCode({ id }: { id: string }) {
  const files = useQuery({
    queryKey: canvasFilesKey(id),
    queryFn: ({ signal }) => api.canvasFiles(id, signal),
    select: (data) =>
      [...data.files].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)),
  });
  const [selected, setSelected] = useState<string>();
  const file = files.data?.find((item) => item.name === selected) ?? files.data?.[0];

  if (!files.data)
    return (
      <p className="apps-note" role={files.error ? 'alert' : 'status'}>
        {files.error ? files.error.message : 'Loading code…'}
      </p>
    );
  return (
    <div className="apps-code">
      <div className="apps-code-files" role="tablist" aria-label="Files">
        {files.data.map((item) => (
          <button
            key={item.name}
            role="tab"
            aria-selected={item.name === file?.name}
            onClick={() => setSelected(item.name)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {file && <CodeView name={file.name} text={file.text} />}
    </div>
  );
}

function CodeView({ name, text }: { name: string; text: string }) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const language = useRef(new Compartment());
  const find = useCodeFind();
  useFindScope(container, () => find.open(view.current));

  useEffect(() => {
    const editor = new EditorView({
      parent: container.current!,
      state: EditorState.create({
        extensions: [
          lineNumbers(),
          drawSelection(),
          editorHighlighting,
          find.extension,
          language.current.of([]),
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ 'aria-label': 'Source code' }),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
  }, [find.extension]);

  useEffect(() => {
    const editor = view.current!;
    let current = true;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: text },
    });
    void editorLanguage(name).then(
      (extension) => {
        if (current) editor.dispatch({ effects: language.current.reconfigure(extension) });
      },
      () => {
        /* Unhighlighted text still reads fine if a language chunk cannot load. */
      },
    );
    return () => {
      current = false;
    };
  }, [name, text]);

  return (
    <>
      <div className="wb-editor apps-code-editor" ref={container} />
      {find.bar}
    </>
  );
}
