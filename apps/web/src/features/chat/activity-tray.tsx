import { useId, useState, type CSSProperties } from 'react';
import { ArrowRight01Icon, BotIcon, CommandLineIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useSubagentActivity } from '../subagents/subagent-attention';
import { SubagentRows } from '../subagents/subagent-rows';
import { useRunningShells } from '../shell/running-shells';
import { ShellRows } from '../shell/shell-rows';
import { ShellOutput } from '../shell/shell-output';
import './activity-tray.css';

type Tab = 'subagents' | 'shell';

/** Shared activity chrome; query updates and row timers never render the transcript. */
export function ActivityTray({
  directory,
  sessionID,
  live,
  onOpenSubagent,
  className,
}: {
  directory?: string;
  sessionID: string;
  live: boolean;
  onOpenSubagent: (id: string) => void;
  className?: string;
}) {
  const subagents = useSubagentActivity(sessionID, live);
  const shells = useRunningShells(directory, sessionID, live);
  const items = shells.data ?? [];
  const [selected, setSelected] = useState<Tab>();
  const [open, setOpen] = useState(true);
  const [shellID, setShellID] = useState<string>();
  const id = useId();
  const hasSubagents = subagents.failed || subagents.items.length > 0;
  const visible = hasSubagents || shells.isError || items.length > 0;
  const tab = selected ?? (hasSubagents ? 'subagents' : 'shell');
  const approvals = subagents.attention.filter((value) => value === 'permission').length;
  const questions = subagents.attention.filter((value) => value === 'question').length;
  const requestErrors = subagents.attention.some((value) => value === 'error');
  const summary = [
    subagents.failed
      ? 'Could not check running subagents'
      : `${subagents.items.length} running subagents`,
    shells.isError
      ? 'Could not check running shell commands'
      : `${items.length} running shell commands`,
    approvals > 0 && `${approvals} need approval`,
    questions > 0 && `${questions} have questions`,
    requestErrors && 'Could not check subagent requests',
  ]
    .filter(Boolean)
    .join(' · ');
  const select = (value: Tab) => {
    setSelected(value);
    setOpen(true);
  };
  return (
    <>
      <section
        className={cn('activity-tray', className)}
        data-active={visible}
        aria-label={visible ? 'Running activity' : undefined}
        style={
          {
            '--activity-tray-rows': Math.min(
              4,
              Math.max(
                subagents.failed || shells.isError ? 2 : 1,
                subagents.items.length,
                items.length,
              ),
            ),
          } as CSSProperties
        }
      >
        {/* Keep announcements mounted; ticking rows and output stay outside the live region. */}
        <div className="activity-tray-status" role="status">
          {visible ? summary : ''}
        </div>
        {visible && (
          <>
            <header className="activity-tray-header">
              <div
                role="tablist"
                aria-label="Running activity"
                className="activity-tray-tabs"
                onKeyDown={(event) => {
                  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  const tabs = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
                  );
                  const index = tabs.findIndex((item) => item === event.target);
                  if (index < 0) return;
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                          tabs.length;
                  tabs[next]?.click();
                  tabs[next]?.focus({ preventScroll: true });
                }}
              >
                <ActivityTab
                  value="subagents"
                  baseID={id}
                  selected={tab}
                  onSelect={select}
                  count={subagents.failed ? '?' : subagents.pending ? '…' : subagents.items.length}
                  alert={
                    subagents.failed || requestErrors
                      ? 'error'
                      : approvals
                        ? 'approval'
                        : questions
                          ? 'question'
                          : undefined
                  }
                  alertLabel={
                    subagents.failed
                      ? 'Could not check running subagents'
                      : requestErrors
                        ? 'Could not check requests'
                        : approvals
                          ? `${approvals} need approval`
                          : `${questions} have questions`
                  }
                />
                <ActivityTab
                  value="shell"
                  baseID={id}
                  selected={tab}
                  onSelect={select}
                  count={shells.isError ? '?' : shells.isPending && directory ? '…' : items.length}
                  alert={shells.isError ? 'error' : undefined}
                  alertLabel="Could not check running shell commands"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="activity-tray-collapse"
                aria-label={open ? 'Collapse running activity' : 'Expand running activity'}
                aria-expanded={open}
                aria-controls={`${id}-${tab}-panel`}
                onClick={() => setOpen(!open)}
              >
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={14}
                  className="activity-tray-chevron"
                  data-open={open}
                  aria-hidden="true"
                />
              </Button>
            </header>
            <div
              id={`${id}-subagents-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-subagents-tab`}
              className="activity-tray-panel"
              hidden={!open || tab !== 'subagents'}
            >
              {open &&
                tab === 'subagents' &&
                (subagents.failed ? (
                  <ActivityError
                    message="Could not check running subagents"
                    onRetry={subagents.retry}
                  />
                ) : subagents.items.length > 0 ? (
                  <SubagentRows
                    items={subagents.items}
                    attention={subagents.attention}
                    onOpen={onOpenSubagent}
                  />
                ) : (
                  <p className="activity-tray-empty">
                    {subagents.pending ? 'Checking running subagents…' : 'No running subagents'}
                  </p>
                ))}
            </div>
            <div
              id={`${id}-shell-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-shell-tab`}
              className="activity-tray-panel"
              hidden={!open || tab !== 'shell'}
            >
              {open &&
                tab === 'shell' &&
                (shells.isError ? (
                  <ActivityError
                    message="Could not check running shell commands"
                    onRetry={() => void shells.refetch()}
                  />
                ) : items.length > 0 ? (
                  <ShellRows items={items} onOpen={setShellID} />
                ) : (
                  <p className="activity-tray-empty">
                    {shells.isPending && directory
                      ? 'Checking running shell commands…'
                      : 'No running shell commands'}
                  </p>
                ))}
            </div>
          </>
        )}
      </section>
      {shellID && directory && (
        <ShellOutput
          key={shellID}
          directory={directory}
          id={shellID}
          live={live}
          onClose={() => setShellID(undefined)}
        />
      )}
    </>
  );
}

function ActivityTab({
  value,
  baseID,
  selected,
  count,
  alert,
  alertLabel,
  onSelect,
  className,
}: {
  value: Tab;
  baseID: string;
  selected: Tab;
  count: number | string;
  alert?: 'error' | 'approval' | 'question';
  alertLabel: string;
  onSelect: (value: Tab) => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('activity-tray-tab', className)}
      role="tab"
      id={`${baseID}-${value}-tab`}
      aria-selected={selected === value}
      aria-controls={`${baseID}-${value}-panel`}
      aria-label={`${value === 'subagents' ? 'Subagents' : 'Shell'} (${count})${alert ? ` · ${alertLabel}` : ''}`}
      tabIndex={selected === value ? 0 : -1}
      onClick={() => onSelect(value)}
    >
      <HugeiconsIcon
        icon={value === 'subagents' ? BotIcon : CommandLineIcon}
        size={14}
        aria-hidden="true"
      />
      <span>
        {value === 'subagents' ? 'Subagents' : 'Shell'}{' '}
        <span className="activity-tray-count">({count})</span>
      </span>
      {alert && (
        <span
          className="activity-tray-alert"
          data-kind={alert}
          data-tooltip={alertLabel}
          aria-hidden="true"
        >
          {alert === 'question' ? '?' : '!'}
        </span>
      )}
    </Button>
  );
}

function ActivityError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={cn('activity-tray-error', className)} role="alert">
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
