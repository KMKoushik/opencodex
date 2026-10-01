import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OpenCodeProject } from '@opencodex/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { ProjectIcon } from './project-icon';
import { projectColors, projectName } from './project-metadata';

export function ProjectEditor({
  project,
  onClose,
}: {
  project: OpenCodeProject;
  onClose: () => void;
}) {
  const [name, setName] = useState(projectName(project));
  const [color, setColor] = useState(project.icon?.color ?? '');
  const [override, setOverride] = useState(project.icon?.override ?? '');
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const image = useMutation({
    mutationFn: async (file: File) => {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type))
        throw new Error('Choose a PNG, JPEG, WebP, or GIF image.');
      // Store a small square avatar instead of persisting a full-resolution upload in every catalog read.
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('The project icon could not be prepared.');
        const size = Math.min(bitmap.width, bitmap.height);
        context.drawImage(
          bitmap,
          (bitmap.width - size) / 2,
          (bitmap.height - size) / 2,
          size,
          size,
          0,
          0,
          128,
          128,
        );
        return canvas.toDataURL('image/png');
      } finally {
        bitmap.close();
      }
    },
    onSuccess: setOverride,
  });
  const save = useMutation({
    mutationFn: () =>
      api.updateProject(project.id, {
        name: name.trim(),
        // Preserve existing native icons (including formats supplied by other clients)
        // and avoid resending their image data when only the name changes.
        ...(color !== (project.icon?.color ?? '') || override !== (project.icon?.override ?? '')
          ? { icon: { color, override } }
          : {}),
      }),
    onSuccess: (updated) => {
      client.setQueryData<OpenCodeProject[]>(['projects'], (projects) =>
        projects?.map((item) => (item.id === updated.id ? updated : item)),
      );
      void client.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });
  return (
    <Dialog title="Edit project" onClose={onClose} busy={save.isPending || image.isPending}>
      <form
        className="project-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending && !image.isPending) save.mutate();
        }}
      >
        <label className="project-editor-field">
          Project name
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={256}
            disabled={save.isPending}
          />
        </label>
        <div className="project-editor-icon">
          <ProjectIcon
            name={name || projectName(project)}
            icon={{ ...project.icon, color, override }}
          />
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => input.current?.click()}
              disabled={save.isPending || image.isPending}
            >
              {image.isPending ? 'Preparing icon…' : 'Upload icon'}
            </Button>
            <p>Images are cropped to a square.</p>
          </div>
          {override && (
            <Button
              variant="ghost"
              size="sm"
              disabled={save.isPending || image.isPending}
              onClick={() => {
                setOverride('');
                image.reset();
              }}
            >
              Remove icon
            </Button>
          )}
          <input
            ref={input}
            type="file"
            name="icon"
            aria-label="Project icon"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) image.mutate(file);
            }}
          />
        </div>
        <fieldset className="project-color-field" disabled={save.isPending || image.isPending}>
          <legend>Icon color</legend>
          <div className="project-colors">
            {projectColors.map((value) => (
              <label key={value} className="project-color-option">
                <input
                  type="radio"
                  name="color"
                  value={value}
                  aria-label={`${value[0]!.toUpperCase()}${value.slice(1)} icon`}
                  checked={(color || 'gray') === value}
                  onChange={() => {
                    setColor(value);
                    setOverride('');
                    image.reset();
                  }}
                />
                <ProjectIcon name={name || projectName(project)} icon={{ color: value }} />
              </label>
            ))}
          </div>
        </fieldset>
        <p className="project-editor-path">{project.canonical}</p>
        {(save.error || image.error) && (
          <p className="text-error" role="alert">
            {save.error?.message || image.error?.message}
          </p>
        )}
        <footer className="dialog-actions">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={save.isPending || image.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || image.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
