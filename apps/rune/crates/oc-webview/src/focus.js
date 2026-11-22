/* global window, document, getComputedStyle */
// Editing and interior Tab navigation stay with WebKit; only tabbing beyond the page leaves.
document.addEventListener('keydown', (event) => {
  if (
    event.key !== 'Tab' ||
    event.defaultPrevented ||
    event.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
    return;
  const items = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
    .filter(
      (el) =>
        el.tabIndex >= 0 &&
        !el.disabled &&
        !el.closest('[inert]') &&
        el.getClientRects().length &&
        getComputedStyle(el).visibility !== 'hidden',
    )
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
  const at = items.indexOf(document.activeElement);
  if (!items.length || (event.shiftKey ? at <= 0 : at === items.length - 1)) {
    event.preventDefault();
    window.webkit.messageHandlers.ocFocus.postMessage(event.shiftKey ? 'previous' : 'next');
  }
});
