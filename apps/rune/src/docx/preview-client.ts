// The same DOM matcher/highlight/scroll behavior as the web's read-only document find.
import {
  findRanges,
  paintMatches,
  revealRange,
  MATCH_LIMIT,
} from '../../../web/src/features/find/dom-find';
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
} from '../../../web/node_modules/@hugeicons/core-free-icons';

const root = document.querySelector<HTMLElement>('.wb-docx-scroll');
if (root) {
  const owner = {};
  let ranges: Range[] = [];
  let index = -1;
  const sticky = document.createElement('div');
  sticky.className = 'find-sticky';
  sticky.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'find-bar';
  bar.setAttribute('role', 'search');
  bar.setAttribute('aria-label', 'Find in document');
  bar.setAttribute('data-find-skip', '');
  const input = document.createElement('input');
  input.className = 'find-input';
  input.placeholder = 'Find in document';
  input.setAttribute('aria-label', 'Find in document');
  input.spellcheck = false;
  input.autocomplete = 'off';
  const count = document.createElement('span');
  count.className = 'find-count';
  count.setAttribute('aria-live', 'polite');
  bar.append(input, count);
  function show(next: number) {
    index = ranges.length ? Math.max(0, Math.min(next, ranges.length - 1)) : -1;
    const current = ranges[index];
    paintMatches(owner, ranges, current);
    if (current) revealRange(current, root!);
    count.textContent = !input.value
      ? ''
      : !ranges.length
        ? 'No results'
        : `${index + 1}/${ranges.length}${ranges.length >= MATCH_LIMIT ? '+' : ''}`;
    previous.disabled = nextButton.disabled = !ranges.length;
  }
  function step(delta: number) {
    if (ranges.length) show((index + delta + ranges.length) % ranges.length);
  }
  function button(name: string, glyph: typeof Cancel01Icon, action: () => void) {
    const button = document.createElement('button');
    button.className = 'button button-ghost button-icon';
    button.type = 'button';
    button.setAttribute('aria-label', name);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    for (const [tag, attributes] of glyph) {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [name, value] of Object.entries(attributes))
        element.setAttribute(
          name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
          String(value),
        );
      svg.append(element);
    }
    button.append(svg);
    button.onclick = action;
    bar.append(button);
    return button;
  }
  const previous = button('Previous match', ArrowUp01Icon, () => step(-1));
  const nextButton = button('Next match', ArrowDown01Icon, () => step(1));
  const close = () => {
    sticky.hidden = true;
    paintMatches(owner, []);
    root.focus();
  };
  button('Close find', Cancel01Icon, close);
  sticky.append(bar);
  root.prepend(sticky);
  function rescan() {
    ranges = findRanges(root!, input.value);
    const top = root!.getBoundingClientRect().top;
    const first = ranges.findIndex((range) => range.getBoundingClientRect().bottom > top);
    show(Math.max(0, first));
  }
  input.oninput = rescan;
  document.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key === 'f') {
      event.preventDefault();
      const selection = getSelection();
      const selected = selection?.toString().trim();
      if (
        selection?.anchorNode &&
        root.contains(selection.anchorNode) &&
        selected &&
        selected.length <= 200 &&
        !/[\r\n]/.test(selected)
      )
        input.value = selected;
      sticky.hidden = false;
      rescan();
      input.focus({ preventScroll: true });
      input.select();
    } else if (
      !sticky.hidden &&
      (event.key === 'Enter' || ((event.metaKey || event.ctrlKey) && event.key === 'g'))
    ) {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (!sticky.hidden && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  const observer = new MutationObserver((records) => {
    if (!sticky.hidden && records.some((record) => !bar.contains(record.target))) rescan();
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  addEventListener('pagehide', () => {
    observer.disconnect();
    paintMatches(owner, []);
  });
}
