import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { FitAddon, Terminal } from 'ghostty-web';
import type { Pty } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { loadGhostty, terminalTheme } from './ghostty';

// Both WASM and WebSocket encode strings as UTF-8; do not cut a surrogate pair.
function chunkEnd(text: string, start = 0) {
  const end = Math.min(start + 16_384, text.length);
  const last = text.charCodeAt(end - 1);
  return end < text.length && last >= 0xd800 && last <= 0xdbff ? end - 1 : end;
}

export function TerminalView({
  directory,
  terminal,
  onDisconnect,
}: {
  directory: string;
  terminal: Pty;
  onDisconnect: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Connecting…');
  const [error, setError] = useState<string>();
  const disconnected = useEffectEvent(onDisconnect);
  const hasExited = useEffectEvent(() => terminal.status === 'exited');
  useEffect(() => {
    const element = host.current!;
    const abort = new AbortController();
    let term: Terminal | undefined;
    let socket: WebSocket | undefined;
    let frame = 0;
    let fitFrame = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let sizeTimer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;
    let cursor = 0;
    let failures = 0;
    let replay = true;
    let writingReplay = false;
    let queue: { text: string; replay: boolean }[] = [];
    let queuedBytes = 0;
    let offset = 0;
    const disposables: { dispose(): void }[] = [];
    const write = () => {
      frame = 0;
      const start = performance.now();
      while (offset < queue.length && performance.now() - start < 6) {
        const chunk = queue[offset]!;
        const part = chunk.text.slice(0, chunkEnd(chunk.text));
        writingReplay = chunk.replay;
        term?.write(part);
        writingReplay = false;
        queuedBytes -= part.length;
        if (part.length === chunk.text.length) {
          chunk.text = '';
          offset++;
        } else chunk.text = chunk.text.slice(part.length);
      }
      if (offset === queue.length) {
        queue = [];
        offset = 0;
      } else {
        if (offset >= 64) {
          queue = queue.slice(offset);
          offset = 0;
        }
        frame = requestAnimationFrame(write);
      }
    };
    let resizeInFlight = false;
    let pendingSize: { rows: number; cols: number } | undefined;
    const sendSize = async () => {
      if (resizeInFlight || !pendingSize || abort.signal.aborted) return;
      const size = pendingSize;
      pendingSize = undefined;
      resizeInFlight = true;
      try {
        await api.resizeTerminal(directory, terminal.id, size, abort.signal);
      } catch {
        if (!abort.signal.aborted) setError('Could not resize terminal. Reconnect to retry.');
      } finally {
        resizeInFlight = false;
        if (pendingSize) void sendSize();
      }
    };
    const scheduleSize = () => {
      if (!term || socket?.readyState !== WebSocket.OPEN || hasExited()) return;
      pendingSize = { cols: term.cols, rows: term.rows };
      clearTimeout(sizeTimer);
      sizeTimer = setTimeout(() => void sendSize(), 100);
    };
    const connect = () => {
      if (abort.signal.aborted) return;
      replay = true;
      const url = new URL(
        `/api/terminals/${encodeURIComponent(terminal.id)}/connect`,
        location.href,
      );
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.search = new URLSearchParams({ directory, cursor: String(cursor) }).toString();
      const ws = new WebSocket(url);
      socket = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        if (abort.signal.aborted) return;
        if (term) term.options.disableStdin = hasExited();
        setStatus('');
        setError(undefined);
        scheduleSize();
      };
      ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
        if (abort.signal.aborted) return;
        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          if (bytes[0] !== 0) return;
          try {
            const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
            if (Number.isSafeInteger(meta.cursor) && meta.cursor >= 0) {
              cursor = meta.cursor;
              replay = false;
              failures = 0;
            }
          } catch {
            setError('Invalid terminal replay data. Reconnect to retry.');
            ws.close();
          }
          return;
        }
        if (queuedBytes + event.data.length > 4 * 1024 * 1024) {
          ws.close();
          setStatus('Output paused while the terminal catches up…');
          return;
        }
        queue.push({ text: event.data, replay });
        queuedBytes += event.data.length;
        cursor += event.data.length;
        if (!frame) frame = requestAnimationFrame(write);
      };
      ws.onclose = (event) => {
        if (abort.signal.aborted) return;
        if (term) term.options.disableStdin = true;
        disconnected();
        if (event.code === 1000) {
          setStatus('Shell exited');
          return;
        }
        if (++failures > 3) {
          setStatus('Disconnected');
          setError('Terminal connection lost. Reconnect to continue.');
          return;
        }
        setStatus('Reconnecting…');
        retry = setTimeout(connect, Math.min(1000 * 2 ** (failures - 1), 4000));
      };
    };
    const copy = (event: ClipboardEvent) => {
      const text = term?.getSelection();
      if (!text || !event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', text);
    };
    const paste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      term?.paste(text);
    };
    element.addEventListener('copy', copy, true);
    element.addEventListener('paste', paste, true);
    void loadGhostty()
      .then(async (ghostty) => {
        await document.fonts.ready;
        if (abort.signal.aborted) return;
        term = new Terminal({
          ghostty,
          fontFamily: 'Menlo, Consolas, monospace',
          fontSize: 13,
          scrollback: 5000,
          cursorBlink: false,
          disableStdin: true,
          theme: terminalTheme(),
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        const focused = document.activeElement;
        term.open(element);
        term.textarea?.setAttribute('aria-label', 'Terminal keyboard input');
        fit.fit();
        disposables.push(
          term.onData((text) => {
            if (writingReplay || socket?.readyState !== WebSocket.OPEN) return;
            if (socket.bufferedAmount + text.length * 3 > 1024 * 1024) {
              setError('Paste is too large or the terminal is busy. Try a smaller selection.');
              return;
            }
            // Keep individual paste frames within the gateway's input bound.
            for (let i = 0; i < text.length;) {
              const end = chunkEnd(text, i);
              socket.send(text.slice(i, end));
              i = end;
            }
          }),
        );
        disposables.push(term.onResize(scheduleSize));
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(fitFrame);
          fitFrame = requestAnimationFrame(() => {
            if (element.clientWidth && element.clientHeight) fit.fit();
          });
        });
        observer.observe(element);
        themeObserver = new MutationObserver(() => {
          if (term) term.options.theme = terminalTheme();
        });
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['style', 'data-theme'],
        });
        // Ghostty focuses on open. Keep arrow-key navigation inside the tablist.
        if (focused instanceof HTMLElement && focused.getAttribute('role') === 'tab')
          focused.focus();
        else term.focus();
        connect();
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setStatus('');
          setError('Could not load the terminal. Reconnect to retry.');
        }
      });
    return () => {
      abort.abort();
      clearTimeout(retry);
      clearTimeout(sizeTimer);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(fitFrame);
      observer?.disconnect();
      themeObserver?.disconnect();
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
      }
      for (const item of disposables) item.dispose();
      term?.dispose();
      element.replaceChildren();
      element.removeEventListener('copy', copy, true);
      element.removeEventListener('paste', paste, true);
    };
  }, [directory, terminal.id, attempt]);
  return (
    <>
      <div className="terminal-toolbar">
        <span className="truncate" title={terminal.cwd}>
          {terminal.cwd}
        </span>
        <span role="status">
          {terminal.status === 'exited'
            ? `Exited${terminal.exitCode === undefined ? '' : ` (${terminal.exitCode})`}`
            : status}
        </span>
      </div>
      {error && (
        <div className="terminal-error" role="alert">
          {error}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(undefined);
              setStatus('Connecting…');
              setAttempt((value) => value + 1);
            }}
          >
            Reconnect
          </Button>
        </div>
      )}
      <div className="terminal-viewport" ref={host} />
    </>
  );
}
