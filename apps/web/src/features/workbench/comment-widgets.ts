import { StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutter,
  type DecorationSet,
} from '@codemirror/view';

/** Block comments use the scroll viewport, not the width of the longest source line. */
export const commentViewport = ViewPlugin.define((view) => {
  const measure = {
    read: (view: EditorView) => {
      const gutter = view.dom.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0;
      return { gutter, width: Math.max(0, view.scrollDOM.clientWidth - gutter) };
    },
    write: ({ gutter, width }: { gutter: number; width: number }, view: EditorView) => {
      view.dom.style.setProperty('--cm-comment-width', `${width}px`);
      view.dom.style.setProperty('--cm-comment-left', `${gutter}px`);
    },
  };
  view.requestMeasure(measure);
  return {
    update(update) {
      if (update.geometryChanged) update.view.requestMeasure(measure);
    },
  };
});

class CommentGutterMarker extends GutterMarker {
  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.textContent = '+';
    button.setAttribute('aria-label', 'Comment on line');
    return button;
  }
}
const commentMarker = new CommentGutterMarker();
export function commentGutter(onComment: (editor: EditorView, from: number, to: number) => void) {
  return gutter({
    class: 'cm-comment-gutter',
    lineMarker: () => commentMarker,
    domEventHandlers: {
      mousedown(editor, line, event) {
        event.preventDefault();
        const selection = editor.state.selection.main;
        const selected = !selection.empty && line.from <= selection.to && line.to >= selection.from;
        onComment(editor, selected ? selection.from : line.from, selected ? selection.to : line.to);
        return true;
      },
    },
  });
}

export class CommentWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly element: HTMLElement,
  ) {
    super();
  }
  eq(other: CommentWidget) {
    return this.element === other.element;
  }
  toDOM() {
    return this.element;
  }
  ignoreEvent() {
    return true;
  }
}
export const setComments = StateEffect.define<DecorationSet>();
export const commentWidgets = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(setComments)) value = effect.value;
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
