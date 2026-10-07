import bridge from '@khalilgharbaoui/opencode-claude-code-plugin';
import { CLAUDE_CODE_PRESET } from './preset';

type Context = Parameters<typeof bridge.setup>[0];
type BridgeEvent = { type?: string; data?: { sessionID?: string } & Record<string, unknown> };
type StreamOptions = { headers?: Record<string, string | undefined>; tools?: { name?: string }[] };
type LanguageModel = { doStream(options: StreamOptions): unknown };

const FORWARDED = new Set<string>(CLAUDE_CODE_PRESET.options.proxyOpencodeTools);
const MAX_TRACKED = 256;
const isClaude = (providerID: string) =>
  providerID === 'claude-code' || providerID.startsWith('claude-code-');

export default {
  id: 'opencodex.claude-code',
  async setup(ctx: Context) {
    if (!ctx.event) throw new Error('The Claude Code bridge requires OpenCode V2 events.');
    const events = ctx.event;
    const running = new Set<string>();
    // Releases go through the bridge's own session.deleted handler, on every subscription.
    const releases = new Set<(sessionID: string) => Promise<void>>();
    // Forwarded tool names per session and agent, as of the last Claude request.
    const toolSets = new Map<string, string>();

    // 0.40.0 fixes Claude's tool list when it spawns a session's CLI, and reuses that
    // process across turns. Plugin tools can appear mid-chat (the tasks skill unhides
    // tasks_*), so rebuild the process when the forwarded set changes. The next spawn
    // replays the conversation from OpenCode, as after a steer.
    async function rebuildOnNewTools(options: StreamOptions) {
      const sessionID = options.headers?.['x-session-affinity'];
      const agent = options.headers?.['x-opencode-agent'];
      if (!sessionID || !options.tools?.length || agent === 'compaction' || agent === 'title')
        return;
      const tools = options.tools
        .flatMap((tool) => (tool.name && FORWARDED.has(tool.name) ? [tool.name] : []))
        .sort()
        .join(' ');
      const key = `${sessionID}\n${agent ?? ''}`;
      const previous = toolSets.get(key);
      toolSets.delete(key);
      toolSets.set(key, tools);
      if (toolSets.size > MAX_TRACKED) toolSets.delete(toolSets.keys().next().value!);
      if (previous === undefined || previous === tools) return;
      await Promise.all([...releases].map((release) => release(sessionID)));
    }

    const requests = await ctx.session.hook('model.request', (event) => {
      if (event.model.providerID === 'claude-code' && event.kind === 'primary')
        running.add(event.sessionID);
    });
    const cleanup = await bridge.setup({
      ...ctx,
      options: { ...CLAUDE_CODE_PRESET.options, ...ctx.options },
      event: {
        async *subscribe(options) {
          const upstream = events.subscribe(options)[Symbol.asyncIterator]();
          const queue: { sessionID: string; done: () => void }[] = [];
          let wake: (() => void) | undefined;
          const release = (sessionID: string) =>
            new Promise<void>((done) => {
              queue.push({ sessionID, done });
              wake?.();
            });
          releases.add(release);
          let pending = upstream.next();
          try {
            while (true) {
              const item = queue.shift();
              if (item) {
                yield { type: 'session.deleted', data: { sessionID: item.sessionID } };
                // The bridge handles each event synchronously before asking for the next.
                item.done();
                continue;
              }
              const woken = new Promise<undefined>((resolve) => (wake = () => resolve(undefined)));
              const next = await Promise.race([pending, woken]);
              wake = undefined;
              if (!next) continue;
              if (next.done) return;
              pending = upstream.next();
              const event: BridgeEvent = next.value;
              const sessionID = event.data?.sessionID;
              // 0.40.0 retains a suspended Claude turn after OpenCode rejects a tool.
              // Its next doStream consumes the old result and drops the new prompt.
              // Reuse the bridge's worker-disposal path on native interruptions. This
              // event is private to the adapter: no OpenCode session is deleted or
              // public event published. A delivered steer has the same problem: the
              // parked CLI only receives tool results, not OpenCode's newly promoted
              // user message. Rebuild on that boundary, while keeping ordinary idle
              // follow-ups warm. This set only retains currently running sessions.
              if (
                event.type === 'session.execution.interrupted' ||
                (event.type === 'permission.replied' && event.data?.reply === 'reject') ||
                (event.type === 'session.inbox.delivered' &&
                  typeof sessionID === 'string' &&
                  running.has(sessionID))
              ) {
                yield { type: 'session.deleted', data: { sessionID } };
              }
              if (
                typeof sessionID === 'string' &&
                // 2.x reports a finished run as execution.succeeded/failed, not session.idle.
                [
                  'session.idle',
                  'session.deleted',
                  'session.execution.succeeded',
                  'session.execution.failed',
                  'session.execution.interrupted',
                ].includes(event.type ?? '')
              )
                running.delete(sessionID);
              yield event;
            }
          } finally {
            releases.delete(release);
            for (const item of queue.splice(0)) item.done();
            void upstream.return?.(undefined);
          }
        },
      },
    });
    const languages = await ctx.aisdk.hook('language', (event) => {
      if (!isClaude(event.model.providerID)) return;
      // The bridge only supplies the SDK; create the model the way OpenCode would.
      const info = event.model as { id: string; modelID?: string };
      const sdk = event.sdk as { languageModel?(id: string): LanguageModel } | undefined;
      const model =
        (event.language as LanguageModel | undefined) ??
        sdk?.languageModel?.(info.modelID ?? info.id);
      if (!model) return;
      event.language = new Proxy(model, {
        get(target, property) {
          if (property === 'doStream')
            return async (options: StreamOptions) => {
              await rebuildOnNewTools(options);
              return target.doStream(options);
            };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as typeof event.language;
    });
    return async () => {
      await languages.dispose();
      await requests.dispose();
      running.clear();
      toolSets.clear();
      if (typeof cleanup === 'function') await cleanup();
    };
  },
};
