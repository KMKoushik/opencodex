import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PROJECT_INSTRUCTIONS_MAX, type OpenCodeProject } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { projectName } from './project-metadata';

/** Edits a project's own instructions, which the gateway sends with every chat in it. */
export function ProjectInstructionsDialog({
  project,
  onClose,
}: {
  project: OpenCodeProject;
  onClose: () => void;
}) {
  const key = ['project-instructions', project.id];
  const client = useQueryClient();
  const saved = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.projectInstructions(project.id, signal),
  });
  // Unset until the user types, so the loaded text shows without copying it into state.
  const [draft, setDraft] = useState<string>();
  const text = draft ?? saved.data?.text ?? '';
  const textarea = useRef<HTMLTextAreaElement>(null);
  const save = useMutation({
    mutationFn: () => api.saveProjectInstructions(project.id, text),
    onSuccess: (result) => {
      client.setQueryData(key, result);
      onClose();
    },
  });
  const nearLimit = text.length > PROJECT_INSTRUCTIONS_MAX * 0.9;
  return (
    <Dialog
      title={`${projectName(project)} instructions`}
      onClose={onClose}
      busy={save.isPending}
      initialFocus={textarea}
      className="project-instructions-dialog"
    >
      <form
        className="project-instructions"
        onSubmit={(event) => {
          event.preventDefault();
          if (saved.isSuccess && !save.isPending) save.mutate();
        }}
      >
        <p className="project-instructions-description">
          Sent with every chat in this project, on desktop and iPhone. They're saved on this
          computer, not in the repo; for instructions your team shares, use the repo's AGENTS.md.
        </p>
        {saved.isError ? (
          <div className="project-instructions-error" role="alert">
            <p className="text-error">{saved.error.message}</p>
            <Button variant="secondary" size="sm" onClick={() => void saved.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <textarea
            ref={textarea}
            name="instructions"
            aria-label="Project instructions"
            placeholder={
              saved.isPending
                ? 'Loading…'
                : 'For example: Use pnpm, not npm. Run pnpm test before saying a change works. Ask before touching the database schema.'
            }
            value={text}
            maxLength={PROJECT_INSTRUCTIONS_MAX}
            disabled={!saved.isSuccess || save.isPending}
            spellCheck
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        )}
        <p className="project-instructions-hint">
          {nearLimit
            ? `${text.length.toLocaleString()} of ${PROJECT_INSTRUCTIONS_MAX.toLocaleString()} characters.`
            : 'Open chats use the new instructions from their next message.'}
        </p>
        {save.error && (
          <p className="text-error" role="alert">
            {save.error.message}
          </p>
        )}
        <footer className="dialog-actions">
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!saved.isSuccess || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
