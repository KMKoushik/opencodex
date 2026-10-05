import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { OpenCodeEvent, SessionInfo, SessionListOutput } from '@opencodex/contracts';
import { api } from '../../lib/api';
import { updateStream, type LivePart } from '../chat/stream';
import { updateSessionViewed } from '../sessions/viewed';
import type { SubagentCost } from '../session-panel/session-cost';
import { updateSessionMetadata } from '../sessions/metadata';

export function useEvents(enabled: boolean) {
  const client = useQueryClient();
  const [live, setLive] = useState(false);
  useQuery({
    queryKey: ['active'],
    queryFn: ({ signal }) => api.active(signal),
    enabled,
    refetchInterval: enabled && !live ? 5_000 : false,
    // One recovery poller for sidebar and chat, without rerendering the app shell.
    notifyOnChangeProps: [],
  });
  useEffect(() => {
    if (!enabled) return;
    const events = new EventSource('/api/events');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    const pending = new Map<string, LivePart[]>();
    const flushParts = () => {
      frame = undefined;
      for (const [id, parts] of pending) {
        const key = ['chat', id, 'stream'];
        if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount())
          client.setQueryData(key, parts);
      }
      pending.clear();
    };
    const changed = new Set<string>();
    const costChanged = new Set<string>();
    let requestsChanged = false;
    const refreshSubagents = (ids: ReadonlySet<string>) =>
      client.invalidateQueries({
        queryKey: ['subagents'],
        predicate: (query) =>
          ids.has(String(query.queryKey[1])) ||
          Boolean(
            (query.state.data as InfiniteData<SessionListOutput> | undefined)?.pages.some((page) =>
              page.data.some((session) => ids.has(session.id)),
            ),
          ),
      });
    let workspaceTimer: ReturnType<typeof setTimeout> | undefined;
    const workspaceChanged = new Map<string | undefined, Set<string>>();
    const refreshWorkspace = (directory: string | undefined, resources: string[]) => {
      const changed = workspaceChanged.get(directory) ?? new Set<string>();
      for (const resource of resources) changed.add(resource);
      workspaceChanged.set(directory, changed);
      if (workspaceTimer) return;
      workspaceTimer = setTimeout(() => {
        workspaceTimer = undefined;
        void client.invalidateQueries({
          queryKey: ['workspace'],
          predicate: (query) => {
            const resource = String(query.queryKey[1]);
            const directory = String(query.queryKey[2]);
            return Boolean(
              workspaceChanged.get(undefined)?.has(resource) ||
              workspaceChanged.get(directory)?.has(resource),
            );
          },
        });
        workspaceChanged.clear();
      }, 500);
    };
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({ queryKey: ['sessions'] });
        void client.invalidateQueries({ queryKey: ['projects'] });
        void client.invalidateQueries({ queryKey: ['active'] });
        if (requestsChanged) {
          void client.invalidateQueries({ queryKey: ['attention'] });
          void client.invalidateQueries({ queryKey: ['subagent-attention'] });
        }
        requestsChanged = false;
        void refreshSubagents(changed);
        if (costChanged.size)
          void client.invalidateQueries({
            queryKey: ['session-cost'],
            predicate: (query) =>
              costChanged.has(String(query.queryKey[1])) ||
              Boolean(
                (query.state.data as SubagentCost[] | undefined)?.some((session) =>
                  costChanged.has(session.id),
                ),
              ),
          });
        for (const id of changed)
          void client.invalidateQueries({
            queryKey: ['chat', id],
            predicate: (query) => query.queryKey[2] !== 'stream',
          });
        changed.clear();
        costChanged.clear();
      }, 250);
    };
    events.addEventListener('ready', () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      pending.clear();
      setLive(true);
      void client.invalidateQueries({ queryKey: ['workspace'] });
      void client.invalidateQueries({ queryKey: ['subagents'] });
      void client.invalidateQueries({ queryKey: ['session-cost'] });
      void client.invalidateQueries({ queryKey: ['attention'] });
      void client.invalidateQueries({ queryKey: ['subagent-attention'] });
      // Subscriptions are live-only. Refetch after every reconnect to recover missed changes.
      void client.invalidateQueries({ queryKey: ['connection'] });
      void client.invalidateQueries({ queryKey: ['models'] });
      client.setQueriesData<LivePart[]>(
        { queryKey: ['chat'], predicate: (query) => query.queryKey[2] === 'stream' },
        [],
      );
      client.setQueriesData(
        { queryKey: ['chat'], predicate: (query) => query.queryKey[2] === 'execution-error' },
        null,
      );
      void client.invalidateQueries({
        queryKey: ['chat'],
        predicate: (query) => query.queryKey[2] !== 'stream',
      });
      refresh();
    });
    events.addEventListener('opencode', (message: MessageEvent<string>) => {
      const event: OpenCodeEvent = JSON.parse(message.data);
      if (event.type === 'session.viewed') {
        updateSessionViewed(client, event.data.sessionID, event.data.idle);
        return;
      }
      if (event.type === 'session.usage.updated') {
        const { sessionID, cost, tokens } = event.data;
        client.setQueryData<SessionInfo>(['chat', sessionID, 'info'], (session) =>
          session ? { ...session, cost, tokens } : undefined,
        );
        // Native cumulative usage updates change cost without refetching the tree
        // or any transcripts on every completed provider step.
        client.setQueriesData<SubagentCost[]>(
          {
            queryKey: ['session-cost'],
            predicate: (query) =>
              Boolean(
                (query.state.data as SubagentCost[] | undefined)?.some(
                  (session) => session.id === sessionID,
                ),
              ),
          },
          (sessions) =>
            sessions?.map((session) => (session.id === sessionID ? { ...session, cost } : session)),
        );
        return;
      }
      if (event.type === 'session.metadata.updated') {
        updateSessionMetadata(client, event.data.sessionID, event.data.metadata);
        return;
      }
      const directory = 'location' in event ? event.location?.directory : undefined;
      if (event.type.startsWith('pty.')) {
        refreshWorkspace(directory, ['terminals']);
        return;
      }
      if (event.type.startsWith('shell.')) {
        refreshWorkspace(directory, ['shells']);
        return;
      }
      if (event.type === 'filesystem.changed' || event.type === 'vcs.branch.updated') {
        refreshWorkspace(directory, ['vcs', 'diff', 'file', 'files']);
        return;
      }
      if (event.type === 'mcp.status.changed') {
        refreshWorkspace(directory, ['mcp']);
        return;
      }
      if (event.type === 'skill.updated') {
        refreshWorkspace(directory, ['skills', 'commands']);
        return;
      }
      if (event.type === 'config.updated') {
        refreshWorkspace(directory, ['mcp', 'skills', 'commands']);
      }
      if (
        /^(model|provider|credential|config|agent)\./.test(event.type) ||
        event.type === 'models-dev.refreshed'
      ) {
        void client.invalidateQueries({ queryKey: ['models'] });
        return;
      }
      if (event.type === 'session.model.selected' || event.type === 'session.agent.selected') {
        void client.invalidateQueries({ queryKey: ['chat', event.data.sessionID, 'info'] });
        void client.invalidateQueries({ queryKey: ['sessions'] });
        void refreshSubagents(new Set([event.data.sessionID]));
        return;
      }
      if (event.type === 'session.created' && event.data.parentID) {
        changed.add(event.data.parentID);
        costChanged.add(event.data.parentID);
      }
      if (event.type === 'session.deleted') costChanged.add(event.data.sessionID);
      if (event.type.startsWith('permission.') || event.type.startsWith('form.'))
        requestsChanged = true;
      const data = 'data' in event ? event.data : undefined;
      const id =
        data && 'sessionID' in data && typeof data.sessionID === 'string'
          ? data.sessionID
          : event.type === 'form.created'
            ? event.data.form.sessionID
            : undefined;
      if (id) {
        const key = ['chat', id, 'stream'];
        const query = client.getQueryCache().find({ queryKey: key, exact: true });
        if (query?.getObserversCount()) {
          const parts = pending.get(id) ?? client.getQueryData<LivePart[]>(key) ?? [];
          const next = updateStream(parts, event);
          if (next !== parts) {
            pending.set(id, next);
            if (frame === undefined) frame = requestAnimationFrame(flushParts);
          }
          if (event.type === 'session.execution.failed')
            client.setQueryData(['chat', id, 'execution-error'], event.data.error.message);
          if (event.type === 'session.execution.started')
            client.setQueryData(['chat', id, 'execution-error'], null);
        }
        changed.add(id);
      }
      // Token deltas update only the overlay, never refetch entire transcripts per token.
      if (!event.type.endsWith('.delta') && event.type !== 'session.tool.progress') refresh();
    });
    const unavailable = () => {
      setLive(false);
      void client.invalidateQueries({ queryKey: ['connection'] });
    };
    events.addEventListener('unavailable', unavailable);
    events.onerror = unavailable;
    return () => {
      events.close();
      clearTimeout(timer);
      clearTimeout(workspaceTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      setLive(false);
    };
  }, [client, enabled]);
  return enabled && live;
}
