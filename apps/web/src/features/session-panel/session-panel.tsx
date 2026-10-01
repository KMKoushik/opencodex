import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SessionMessagesResponse, TokenUsageInfo } from '@opencodex/contracts';
import {
  ArrowRight01Icon,
  GitBranchIcon,
  FileEditIcon,
  Link01Icon,
  Layers01Icon,
  Coins01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { messageQuery } from '../chat/message-query';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
});
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

// Native pages are newest-first. Bound work to the latest page, never the full transcript.
function latestResponse(data: InfiniteData<SessionMessagesResponse>) {
  return data.pages[0]?.data.find(
    (message) => message.type === 'assistant' && message.tokens && tokenTotal(message.tokens) > 0,
  );
}

function tokenTotal(tokens: TokenUsageInfo) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

export function SessionPanel({
  sessionID,
  projectName,
  live,
}: {
  sessionID: string;
  projectName?: string;
  live: boolean;
}) {
  const session = useQuery({
    queryKey: ['chat', sessionID, 'info'],
    queryFn: ({ signal }) => api.session(sessionID, signal),
    refetchOnMount: false,
  });
  const messages = useInfiniteQuery({
    ...messageQuery(sessionID),
    select: latestResponse,
    refetchOnMount: false,
  });
  const latest = messages.data?.type === 'assistant' ? messages.data : undefined;
  const directory = session.data?.location.directory;
  const models = useQuery({
    queryKey: ['models', directory],
    queryFn: ({ signal }) => api.models(directory!, signal),
    enabled: Boolean(directory),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
  });
  const workspaceOptions = {
    enabled: Boolean(directory),
    refetchInterval: live ? (false as const) : 15_000,
  };
  const vcs = useQuery({
    queryKey: ['workspace', 'vcs', directory],
    queryFn: ({ signal }) => api.workspaceVcs(directory!, signal),
    ...workspaceOptions,
  });
  const mcp = useQuery({
    queryKey: ['workspace', 'mcp', directory],
    queryFn: ({ signal }) => api.workspaceMcp(directory!, signal),
    ...workspaceOptions,
  });
  const skills = useQuery({
    queryKey: ['workspace', 'skills', directory],
    queryFn: ({ signal }) => api.workspaceSkills(directory!, signal),
    ...workspaceOptions,
  });
  const model = models.data?.data.find(
    (item) => item.id === latest?.model.id && item.providerID === latest.model.providerID,
  );
  const tokens = latest?.tokens ? tokenTotal(latest.tokens) : undefined;
  const ratio =
    tokens !== undefined && model?.limit.context ? tokens / model.limit.context : undefined;
  const changes = vcs.data?.files.reduce(
    (total, file) => ({
      additions: total.additions + file.additions,
      deletions: total.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
  const connected = mcp.data?.filter((server) => server.status.status === 'connected').length;
  return (
    <>
      <section className="session-panel-section session-context" aria-label="Context usage">
        <div className="session-panel-row">
          <span>Context</span>
          <span>{ratio !== undefined ? percent.format(ratio) : '—'}</span>
        </div>
        <progress
          className="session-context-meter"
          aria-label="Context used"
          value={ratio === undefined ? 0 : Math.min(ratio, 1)}
          max={1}
          aria-valuetext={ratio === undefined ? 'No usage reported' : percent.format(ratio)}
        />
        <p className="session-panel-note">
          {tokens !== undefined
            ? `${number.format(tokens)}${model?.limit.context ? ` / ${number.format(model.limit.context)}` : ''} tokens · latest response`
            : messages.isPending
              ? 'Loading context…'
              : 'Usage appears after the first response.'}
        </p>
        <QueryError query={messages} />
        <QueryError query={models} />
      </section>
      <section className="session-panel-section" aria-label="Project details">
        <div className="session-panel-row">
          <h3>Project</h3>
          <span className="truncate" title={directory}>
            {projectName || directory?.split('/').filter(Boolean).at(-1) || 'Project'}
          </span>
        </div>
        {vcs.data && (
          <>
            <div className="session-panel-row session-project-row">
              <HugeiconsIcon icon={GitBranchIcon} size={16} />
              <span className="truncate" title={vcs.data.info.branch.current}>
                {vcs.data.info.branch.current ||
                  (vcs.data.info.provider ? 'Detached HEAD' : 'No version control')}
              </span>
            </div>
            {vcs.data.info.provider && (
              <div className="session-panel-row session-project-row">
                <HugeiconsIcon icon={FileEditIcon} size={16} />
                <span>
                  {vcs.data.files.length === 1
                    ? '1 file changed'
                    : `${number.format(vcs.data.files.length)} files changed`}
                </span>
                <div className="session-file-totals">
                  <span className="session-additions">+{number.format(changes!.additions)}</span>
                  <span aria-hidden="true"> / </span>
                  <span className="text-error">−{number.format(changes!.deletions)}</span>
                </div>
              </div>
            )}
          </>
        )}
        {vcs.isPending && (
          <p className="session-panel-note" role="status">
            Loading project…
          </p>
        )}
        <QueryError query={session} />
        <QueryError query={vcs} />
      </section>
      <PanelDetails
        label="Usage"
        icon={Coins01Icon}
        value={session.data?.cost !== undefined ? money.format(session.data.cost) : undefined}
      >
        <p className="session-panel-note">Session totals reported by OpenCode.</p>
        {session.data?.tokens ? (
          <TokenStats tokens={session.data.tokens} cost={session.data.cost} />
        ) : (
          <p className="session-panel-note">No usage reported yet.</p>
        )}
      </PanelDetails>
      <PanelDetails
        label="MCP"
        icon={Link01Icon}
        value={
          mcp.data ? `${connected}/${mcp.data.length}` : mcp.isError ? 'Unavailable' : 'Loading…'
        }
      >
        {mcp.data?.length === 0 && <p className="session-panel-note">No MCP servers configured.</p>}
        {mcp.data && (
          <ul className="session-resource-list" role="list">
            {mcp.data.map((server) => (
              <li key={server.name}>
                <div className="session-panel-row">
                  <span className="truncate" title={server.name}>
                    {server.name}
                  </span>
                  <span
                    className="session-resource-status"
                    data-connected={server.status.status === 'connected'}
                  >
                    {server.status.status === 'needs_auth' ? 'Needs sign-in' : server.status.status}
                  </span>
                </div>
                {'error' in server.status && (
                  <p className="session-panel-note text-error">{server.status.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <QueryError query={mcp} />
      </PanelDetails>
      <PanelDetails
        label="Skills"
        icon={Layers01Icon}
        value={
          skills.data
            ? `${number.format(skills.data.length)} available`
            : skills.isError
              ? 'Unavailable'
              : 'Loading…'
        }
      >
        <p className="session-panel-note">
          Available to this project, not necessarily loaded into this conversation.
        </p>
        {skills.data?.length === 0 && <p className="session-panel-note">No skills available.</p>}
        {skills.data && (
          <ul className="session-resource-list" role="list">
            {skills.data.map((skill) => (
              <li key={skill.id}>
                <p>{skill.name}</p>
                {skill.description && <p className="session-panel-note">{skill.description}</p>}
              </li>
            ))}
          </ul>
        )}
        <QueryError query={skills} />
      </PanelDetails>
    </>
  );
}

function QueryError({
  query,
}: {
  query: { isError: boolean; error: Error | null; refetch: () => unknown };
}) {
  if (!query.isError) return null;
  return (
    <div className="session-panel-error" role="alert">
      <p>{query.error?.message}</p>
      <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
        Retry
      </Button>
    </div>
  );
}

function PanelDetails({
  label,
  icon,
  value,
  children,
}: {
  label: string;
  icon: typeof Coins01Icon;
  value?: string;
  children: ReactNode;
}) {
  return (
    <details className="session-panel-section session-panel-details">
      <summary>
        <HugeiconsIcon icon={icon} size={16} />
        <h3>{label}</h3>
        <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="session-details-chevron" />
        {value && <span className="session-details-value">{value}</span>}
      </summary>
      <div className="session-details-content">{children}</div>
    </details>
  );
}

function TokenStats({ tokens, cost }: { tokens: TokenUsageInfo; cost?: number }) {
  return (
    <dl className="session-stat-list">
      {[
        ['Input', number.format(tokens.input)],
        ['Output', number.format(tokens.output)],
        ['Reasoning', number.format(tokens.reasoning)],
        ['Cache read', number.format(tokens.cache.read)],
        ['Cache write', number.format(tokens.cache.write)],
        ...(cost !== undefined ? [['Cost', money.format(cost)]] : []),
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
