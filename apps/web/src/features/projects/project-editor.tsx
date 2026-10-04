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
  const [iconUrl, setIconUrl] = useState(/^https?:\/\//.test(override) ? override : '');
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
    onSuccess: (value) => {
      setOverride(value);
      setIconUrl('');
    },
  });
  const remoteIcon = useMutation({
    mutationFn: async (favicon: boolean) => {
      let url: URL;
      try {
        url = new URL(iconUrl.trim());
      } catch {
        throw new Error('Enter a complete website or image URL, starting with https://.');
      }
      if (iconUrl.trim().length > 4096) throw new Error('Use a URL shorter than 4,096 characters.');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
      const source = favicon ? new URL('/favicon.ico', url).href : url.href;
      // Load as an image, not a cross-origin fetch: this works with the shared production CSP
      // and keeps the existing OpenCode icon field as the only persistence owner.
      await new Promise<void>((resolve, reject) => {
        const preview = new Image();
        const finish = (error?: Error) => {
          window.clearTimeout(timeout);
          preview.onload = preview.onerror = null;
          if (error) {
            preview.src = '';
            reject(error);
          } else resolve();
        };
        const timeout = window.setTimeout(
          () => finish(new Error('Loading the icon timed out. Try another URL.')),
          10_000,
        );
        preview.referrerPolicy = 'no-referrer';
        preview.onload = () => finish();
        preview.onerror = () =>
          finish(
            new Error(
              favicon
                ? 'No favicon could be loaded at /favicon.ico. Try a direct image URL or upload an icon.'
                : 'The image could not be loaded. Check the URL or upload an icon.',
            ),
          );
        preview.src = source;
      });
      return source;
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
  const busy = save.isPending || image.isPending || remoteIcon.isPending;
  return (
    <Dialog title="Edit project" onClose={onClose} busy={busy}>
      <form
        className="project-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) save.mutate();
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
              disabled={busy}
            >
              {image.isPending ? 'Preparing icon…' : 'Upload icon'}
            </Button>
            <p>Images are cropped to a square.</p>
          </div>
          {override && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setOverride('');
                setIconUrl('');
                image.reset();
                remoteIcon.reset();
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
              if (file) {
                remoteIcon.reset();
                image.mutate(file);
              }
            }}
          />
        </div>
        <div className="project-editor-url">
          <label className="project-editor-field">
            Website or icon URL
            <input
              name="iconUrl"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              placeholder="https://example.com"
              value={iconUrl}
              disabled={busy}
              aria-describedby="project-icon-url-hint"
              onChange={(event) => {
                setIconUrl(event.target.value);
                remoteIcon.reset();
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (!busy && iconUrl.trim()) {
                  image.reset();
                  remoteIcon.mutate(true);
                }
              }}
            />
          </label>
          <div className="project-editor-url-actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !iconUrl.trim()}
              onClick={() => {
                image.reset();
                remoteIcon.mutate(true);
              }}
            >
              {remoteIcon.isPending && remoteIcon.variables ? 'Loading favicon…' : 'Use favicon'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !iconUrl.trim()}
              onClick={() => {
                image.reset();
                remoteIcon.mutate(false);
              }}
            >
              {remoteIcon.isPending && !remoteIcon.variables ? 'Loading image…' : 'Use image URL'}
            </Button>
          </div>
          <p id="project-icon-url-hint">
            Favicon uses the site's /favicon.ico. URL icons need an internet connection.
          </p>
        </div>
        <fieldset className="project-color-field" disabled={busy}>
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
                    setIconUrl('');
                    image.reset();
                    remoteIcon.reset();
                  }}
                />
                <ProjectIcon name={name || projectName(project)} icon={{ color: value }} />
              </label>
            ))}
          </div>
        </fieldset>
        <p className="project-editor-path">{project.canonical}</p>
        {(save.error || image.error || remoteIcon.error) && (
          <p className="text-error" role="alert">
            {save.error?.message || image.error?.message || remoteIcon.error?.message}
          </p>
        )}
        <footer className="dialog-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
