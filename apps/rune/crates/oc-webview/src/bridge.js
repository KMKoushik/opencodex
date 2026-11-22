/* global window, document */
// Main frame only. Never expose a gateway client, filesystem or generic native invocation.
(() => {
  const send = (value) => {
    const json = JSON.stringify(value);
    if (json.length <= 1048576) window.webkit.messageHandlers.ocHost.postMessage(json);
  };
  Object.defineProperty(window, 'ocHost', { value: Object.freeze({ postMessage: send }) });
  window.addEventListener('message', (event) => {
    const frame = document.querySelector('iframe');
    if (frame && event.source === frame.contentWindow) send(event.data);
  });
})();
