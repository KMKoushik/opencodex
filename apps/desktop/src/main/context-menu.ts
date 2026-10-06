import {
  dialog,
  Menu,
  type BrowserWindow,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';

export function showTextMenu(
  window: BrowserWindow,
  params: ContextMenuParams,
  openLink: (url: string) => void,
) {
  const items = textMenuItems(window, window.webContents, params, openLink);
  if (items.length) Menu.buildFromTemplate(items).popup({ window });
}

/** Spelling, lookup, and editing items for a selection or editable field in `contents`. */
export function textMenuItems(
  window: BrowserWindow,
  contents: WebContents,
  params: ContextMenuParams,
  openLink: (url: string) => void,
) {
  const items: MenuItemConstructorOptions[] = [];
  // Roles act on the window's own page; an embedded browser page needs explicit targets.
  const edit = (
    role: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll',
    enabled: boolean,
  ): MenuItemConstructorOptions =>
    contents === window.webContents
      ? { role, enabled }
      : { ...guestEdits[role], enabled, click: () => contents[role]() };
  const { isEditable, editFlags, misspelledWord, dictionarySuggestions } = params;
  const selection = params.formControlType === 'input-password' ? '' : params.selectionText.trim();
  const group = (entries: MenuItemConstructorOptions[]) => {
    if (!entries.length) return;
    if (items.length) items.push({ type: 'separator' });
    items.push(...entries);
  };
  // Electron reports spellcheckEnabled as false on macOS even while the native
  // checker marks words, so a misspelled word is the only reliable signal.
  if (isEditable && params.formControlType !== 'input-password' && misspelledWord) {
    group(
      dictionarySuggestions.length
        ? dictionarySuggestions.map((word) => ({
            label: word,
            click: () => contents.replaceMisspelling(word),
          }))
        : [{ label: 'No Guesses Found', enabled: false }],
    );
    group([
      {
        label: 'Learn Spelling',
        click: () => {
          if (!contents.session.addWordToSpellCheckerDictionary(misspelledWord))
            void dialog.showMessageBox(window, {
              type: 'error',
              message: 'Could not learn this spelling.',
              detail: 'The spelling dictionary could not be updated. Please try again.',
            });
        },
      },
    ]);
  }
  if (selection) {
    const label = selection.length > 60 ? `${selection.slice(0, 60)}…` : selection;
    group([
      ...(process.platform === 'darwin'
        ? [{ label: `Look Up “${label}”`, click: () => contents.showDefinitionForSelection() }]
        : []),
      {
        label: 'Search with Google',
        click: () =>
          openLink(`https://www.google.com/search?${new URLSearchParams({ q: selection })}`),
      },
    ]);
  }
  if (isEditable) {
    group([edit('undo', editFlags.canUndo), edit('redo', editFlags.canRedo)]);
    group([
      edit('cut', editFlags.canCut),
      edit('copy', editFlags.canCopy),
      edit('paste', editFlags.canPaste),
      edit('selectAll', editFlags.canSelectAll),
    ]);
  } else if (selection) {
    group([edit('copy', editFlags.canCopy)]);
  }
  return items;
}

const guestEdits = {
  undo: { label: 'Undo', accelerator: 'CmdOrCtrl+Z' },
  redo: { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z' },
  cut: { label: 'Cut', accelerator: 'CmdOrCtrl+X' },
  copy: { label: 'Copy', accelerator: 'CmdOrCtrl+C' },
  paste: { label: 'Paste', accelerator: 'CmdOrCtrl+V' },
  selectAll: { label: 'Select All', accelerator: 'CmdOrCtrl+A' },
};
