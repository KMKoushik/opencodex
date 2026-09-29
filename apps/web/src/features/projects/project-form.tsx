import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, FolderOpen } from 'lucide-react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';

export function ProjectForm({ onSelect }: { onSelect: (project: Project) => void }) {
  const [directory, setDirectory] = useState('');
  const [pickerError, setPickerError] = useState<string>();
  const project = useMutation({ mutationFn: api.project, onSuccess: onSelect });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPickerError(undefined);
    project.mutate(directory);
  };
  const browse = async () => {
    setPickerError(undefined);
    try {
      const selected = await window.desktop?.selectDirectory();
      if (selected) {
        setDirectory(selected);
        project.mutate(selected);
      }
    } catch {
      setPickerError('The folder picker could not be opened. You can enter the path below.');
    }
  };
  return (
    <form onSubmit={submit} className="project-form">
      <label htmlFor="directory">Project directory</label>
      <div className="input-row">
        <input
          id="directory"
          placeholder="~/projects/my-app"
          value={directory}
          onChange={(event) => setDirectory(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
          aria-describedby="directory-help directory-error"
          aria-invalid={project.isError}
        />
        {window.desktop && (
          <Button
            variant="secondary"
            size="icon"
            onClick={() => void browse()}
            disabled={project.isPending}
            aria-label="Browse for a project folder"
            title="Browse for a project folder"
          >
            <FolderOpen size={17} />
          </Button>
        )}
        <Button type="submit" disabled={!directory.trim() || project.isPending}>
          {project.isPending ? 'Opening…' : 'Open'} <ArrowRight size={15} />
        </Button>
      </div>
      <p className="field-hint" id="directory-help">
        A folder on the machine running OpenCodex.
      </p>
      <div id="directory-error" role="alert" className="field-error">
        {pickerError || project.error?.message}
      </div>
    </form>
  );
}
