import {
  dialog,
  Menu,
  type BrowserWindow,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
} from 'electron';

export function showTextMenu(
  window: BrowserWindow,
  params: ContextMenuParams,
  openLink: (url: string) => void,
) {
  const contents = window.webContents;
  const items: MenuItemConstructorOptions[] = [];
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
    group([
      { role: 'undo', enabled: editFlags.canUndo },
      { role: 'redo', enabled: editFlags.canRedo },
    ]);
    group([
      { role: 'cut', enabled: editFlags.canCut },
      { role: 'copy', enabled: editFlags.canCopy },
      { role: 'paste', enabled: editFlags.canPaste },
      { role: 'selectAll', enabled: editFlags.canSelectAll },
    ]);
  } else if (selection) {
    group([{ role: 'copy', enabled: editFlags.canCopy }]);
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window });
}
