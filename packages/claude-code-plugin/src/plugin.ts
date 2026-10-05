import bridge from '@khalilgharbaoui/opencode-claude-code-plugin';
import { CLAUDE_CODE_PRESET } from './preset';

type Context = Parameters<typeof bridge.setup>[0];

export default {
  id: 'opencodex.claude-code',
  async setup(ctx: Context) {
    if (!ctx.event) throw new Error('The Claude Code bridge requires OpenCode V2 events.');
    const events = ctx.event;
    const running = new Set<string>();
    const requests = await ctx.session.hook('model.request', (event) => {
      if (event.model.providerID === 'claude-code' && event.kind === 'primary')
        running.add(event.sessionID);
    });
    const cleanup = await bridge.setup({
      ...ctx,
      options: { ...CLAUDE_CODE_PRESET.options, ...ctx.options },
      event: {
        async *subscribe(options) {
          for await (const event of events.subscribe(options)) {
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
              ['session.idle', 'session.deleted', 'session.execution.interrupted'].includes(
                event.type ?? '',
              )
            )
              running.delete(sessionID);
            yield event;
          }
        },
      },
    });
    return async () => {
      await requests.dispose();
      running.clear();
      if (typeof cleanup === 'function') await cleanup();
    };
  },
};
