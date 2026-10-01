import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Project } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { projectFolder } from './project-metadata';

export function ProjectForm({
  onSelect,
  register = false,
}: {
  onSelect: (project: Project) => void;
  register?: boolean;
}) {
  const [directory, setDirectory] = useState('');
  const [pickerError, setPickerError] = useState<string>();
  const client = useQueryClient();
  const project = useMutation({
    mutationFn: async (directory: string) =>
      register ? projectFolder(await api.addProject(directory)) : api.project(directory),
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      onSelect(project);
    },
  });
  const error = pickerError || project.error?.message;
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
      setPickerError('The folder picker could not be opened. Enter the path instead.');
    }
  };
  return (
    <form onSubmit={submit} className="project-form">
      <div className="project-input">
        <input
          id="directory"
          aria-label="Project directory"
          placeholder="~/projects/my-app"
          value={directory}
          onChange={(event) => setDirectory(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
          aria-describedby={error ? 'directory-error' : undefined}
          aria-invalid={Boolean(error)}
        />
        {window.desktop && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void browse()}
            disabled={project.isPending}
            aria-label="Browse for a project folder"
            title="Browse for a project folder"
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={16} />
          </Button>
        )}
      </div>
      <Button type="submit" disabled={!directory.trim() || project.isPending}>
        {project.isPending ? 'Opening…' : 'Open'}
      </Button>
      <p id="directory-error" role="alert" className="field-error">
        {error}
      </p>
    </form>
  );
}
