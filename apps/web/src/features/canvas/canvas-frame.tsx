import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CANVAS_CHANNEL,
  type CanvasData,
  type FrameMessage,
  type HostMessage,
} from '@opencodex/contracts/canvas';
import { api } from '../../lib/api';
import { useTheme } from '../theme/use-theme';
import { readCanvasTheme } from './canvas-theme';
import { appsKey, CanvasSessionContext, canvasDataKey, canvasSourceKey } from './canvas-context';
import type { AppInfo } from '@opencodex/contracts/canvas';

type DataSnapshot = { values: CanvasData; errors: string[] };
type Outgoing = HostMessage extends infer M
  ? M extends unknown
    ? Omit<M, 'channel'>
    : never
  : never;

const FRAME_URL = '/api/canvas-runtime/frame.html';
const MIN_HEIGHT = 96;
const MAX_INLINE_HEIGHT = 900;
// Last measured height per canvas, so a remounted inline frame doesn't jump.
const heights = new Map<string, number>();

/**
 * Hosts one canvas in a sandboxed iframe. The frame has an opaque origin and no network;
 * this component sends it the view's code, its data, and the theme, and saves its writes
 * with compare-and-swap so the agent's and other views' changes are never overwritten.
 */
export function CanvasFrame({
  id,
  mode,
  title,
}: {
  id: string;
  mode: 'inline' | 'panel';
  title: string;
}) {
  const client = useQueryClient();
  const source = useQuery({
    queryKey: canvasSourceKey(id),
    queryFn: ({ signal }) => api.canvas(id, signal),
  });
  const data = useQuery({
    queryKey: canvasDataKey(id),
    queryFn: ({ signal }) => api.canvasData(id, signal),
  });
  const running = useQuery({
    queryKey: appsKey,
    queryFn: ({ signal }) => api.apps(signal),
    enabled: Boolean(source.data?.server),
    select: useCallback(
      (apps: AppInfo[]) => apps.find((app) => app.id === id)?.running.join('\0') ?? '',
      [id],
    ),
  }).data;
  const openSession = useContext(CanvasSessionContext);
  const openSessionRef = useRef(openSession);
  useEffect(() => {
    openSessionRef.current = openSession;
  }, [openSession]);
  const { preference, systemDark } = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameKey, setFrameKey] = useState(0);
  // Counts the frame's ready messages; 0 until the current frame instance is listening.
  const [session, setSession] = useState(0);
  const [height, setHeight] = useState(() => heights.get(id) ?? 240);
  const [error, setError] = useState<string>();
  // What the frame currently shows: the source version, each value's revision, and the theme.
  const shown = useRef<{ version?: string; revs: Map<string, string>; theme?: string }>({
    revs: new Map(),
  });
  const loads = useRef(0);

  const post = useCallback(
    (message: Outgoing) =>
      frame.current?.contentWindow?.postMessage({ channel: CANVAS_CHANNEL, ...message }, '*'),
    [],
  );

  useEffect(() => {
    const writer = createWriter(id, client, shown.current.revs, setError);
    const receive = (event: MessageEvent<FrameMessage>) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== CANVAS_CHANNEL)
        return;
      const message = event.data;
      if (message.type === 'ready') {
        shown.current.version = undefined;
        shown.current.theme = undefined;
        shown.current.revs.clear();
        setSession((value) => value + 1);
      } else if (message.type === 'size') {
        const next = Math.max(MIN_HEIGHT, Math.min(MAX_INLINE_HEIGHT, message.height));
        heights.set(id, next);
        setHeight(next);
      } else if (message.type === 'set') {
        writer.set(message.key, message.value);
      } else if (message.type === 'call') {
        const reply = (result: { value?: unknown; error?: string }) =>
          frame.current?.contentWindow?.postMessage(
            { channel: CANVAS_CHANNEL, type: 'result', call: message.call, ...result },
            '*',
          );
        api.callCanvasFunction(id, message.name, message.args).then(
          (result) => reply({ value: result.value }),
          (error: unknown) =>
            reply({ error: error instanceof Error ? error.message : String(error) }),
        );
      } else if (message.type === 'open') {
        const target = message.target;
        if (typeof target === 'string') {
          if (/^https?:\/\//i.test(target)) window.open(target, '_blank', 'noopener,noreferrer');
        } else if (typeof target?.session === 'string') openSessionRef.current?.(target.session);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [id, client]);

  // First contact: send everything once the frame is listening and the snapshots are loaded.
  useEffect(() => {
    const element = frame.current;
    if (!session || !element || !source.data || !data.data) return;
    if (shown.current.version !== undefined) return;
    const values: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(data.data.values)) {
      values[key] = item.value;
      shown.current.revs.set(key, item.rev);
    }
    shown.current.version = source.data.version;
    const theme = readCanvasTheme(element);
    shown.current.theme = JSON.stringify(theme);
    post({
      type: 'init',
      mode,
      theme,
      entry: source.data.entry,
      modules: source.data.modules,
      data: values,
    });
  }, [session, source.data, data.data, mode, post]);

  // The agent edited the view: rerun it with the frame's current data.
  useEffect(() => {
    const version = shown.current.version;
    if (!session || !source.data || version === undefined || version === source.data.version)
      return;
    shown.current.version = source.data.version;
    post({ type: 'modules', entry: source.data.entry, modules: source.data.modules });
  }, [session, source.data, post]);

  // Values changed elsewhere (the agent, another view, a conflict): send only those.
  useEffect(() => {
    if (!session || !data.data || shown.current.version === undefined) return;
    const revs = shown.current.revs;
    for (const [key, item] of Object.entries(data.data.values)) {
      if (revs.get(key) === item.rev) continue;
      revs.set(key, item.rev);
      post({ type: 'data', key, value: item.value });
    }
    for (const key of [...revs.keys()])
      if (!(key in data.data.values)) {
        revs.delete(key);
        post({ type: 'data', key, value: undefined });
      }
  }, [session, data.data, post]);

  useEffect(() => {
    if (!session || !frame.current) return;
    const theme = readCanvasTheme(frame.current);
    const key = JSON.stringify(theme);
    if (key === shown.current.theme) return;
    shown.current.theme = key;
    post({ type: 'theme', theme });
  }, [session, preference, systemDark, post]);

  useEffect(() => {
    if (!session || shown.current.version === undefined || running === undefined) return;
    post({ type: 'running', names: running ? running.split('\0') : [] });
  }, [session, running, post, source.data, data.data]);

  const failure = source.error ?? data.error;
  const problems = [...(source.data?.errors ?? []), ...(data.data?.errors ?? [])];
  return (
    <div className="canvas-frame" data-mode={mode}>
      {(failure || problems.length > 0 || error) && (
        <div className="canvas-frame-error" role="alert">
          {failure ? failure.message : problems.length ? problems.join('\n') : error}
        </div>
      )}
      <iframe
        key={frameKey}
        ref={frame}
        title={title}
        src={FRAME_URL}
        sandbox="allow-scripts"
        style={mode === 'inline' ? { height } : undefined}
        onLoad={() => {
          // A canvas may navigate its frame away; any load after the first starts over.
          if (++loads.current > 1) {
            loads.current = 0;
            setSession(0);
            setFrameKey((key) => key + 1);
          }
        }}
      />
    </div>
  );
}

/**
 * Saves the frame's writes one at a time per key, always sending the latest value and the
 * last revision this host knew. A conflict adopts the stored value instead.
 */
function createWriter(
  id: string,
  client: ReturnType<typeof useQueryClient>,
  revs: Map<string, string>,
  setError: (message: string | undefined) => void,
) {
  const pending = new Map<string, unknown>();
  const busy = new Set<string>();
  const update = (key: string, value: unknown, rev: string | null) =>
    client.setQueryData<DataSnapshot>(canvasDataKey(id), (snapshot) => {
      const values = { ...snapshot?.values };
      if (rev === null) delete values[key];
      else values[key] = { value, rev };
      return { values, errors: snapshot?.errors ?? [] };
    });
  const writer = {
    set(key: string, value: unknown) {
      pending.set(key, value);
      void flush(key);
    },
  };
  async function flush(key: string) {
    if (busy.has(key) || !pending.has(key)) return;
    const value = pending.get(key);
    pending.delete(key);
    busy.add(key);
    const base = client.getQueryData<DataSnapshot>(canvasDataKey(id))?.values[key]?.rev ?? null;
    try {
      const result = await api.writeCanvasValue(id, key, value, base);
      if (result.ok) {
        // The frame already shows this value; record it so it isn't echoed back.
        revs.set(key, result.rev);
        update(key, value, result.rev);
      } else {
        pending.delete(key);
        update(key, result.value, result.rev);
      }
      setError(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The canvas value couldn’t be saved.');
      void client.invalidateQueries({ queryKey: canvasDataKey(id) });
    } finally {
      busy.delete(key);
      void flush(key);
    }
  }
  return writer;
}
