import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CANVAS_GLYPH_GROUPS,
  CANVAS_ICON_COLORS,
  type AppInfo,
  type CanvasGlyph,
  type CanvasIcon,
} from '@opencodex/contracts/canvas';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { api } from '../../lib/api';
import { appsKey } from '../canvas/canvas-context';
import { fallbackColor } from './app-glyph-store';
import { GLYPHS } from './app-glyphs';
import { AppIcon } from './app-icon';

const label = (value: string) => `${value[0]!.toUpperCase()}${value.slice(1).replaceAll('-', ' ')}`;
const GROUPS = Object.entries(CANVAS_GLYPH_GROUPS) as [string, readonly CanvasGlyph[]][];

/** Groups whose name or glyphs match every word of the query. */
function search(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return GROUPS;
  return GROUPS.flatMap(([group, glyphs]) => {
    const matches = glyphs.filter((glyph) => {
      const text = `${group} ${glyph.replaceAll('-', ' ')}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return matches.length ? [[group, matches] as [string, readonly CanvasGlyph[]]] : [];
  });
}

/** Picks an app's glyph and color; saved to its canvas.json. */
export function AppIconPicker({ app, onClose }: { app: AppInfo; onClose: () => void }) {
  const client = useQueryClient();
  const cancel = useRef<HTMLButtonElement>(null);
  const [glyph, setGlyph] = useState<CanvasGlyph | undefined>(app.icon?.glyph);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const groups = useMemo(() => search(deferred), [deferred]);
  const scroller = useRef<HTMLDivElement>(null);
  // Opens at the current symbol, which may sit far down the list.
  useEffect(() => {
    scroller.current
      ?.querySelector('input[name=glyph]:checked')
      ?.closest('label')
      ?.scrollIntoView({ block: 'center' });
  }, []);
  // Starts from the color shown now, so choosing only a glyph keeps the tile's color.
  const [color, setColor] = useState(app.icon?.color ?? fallbackColor(app.id));
  const icon: CanvasIcon = { color, ...(glyph ? { glyph } : {}) };
  const save = useMutation({
    mutationFn: () => api.setAppIcon(app.id, icon),
    onSuccess: () => {
      client.setQueryData<AppInfo[]>(appsKey, (apps) =>
        apps?.map((item) => (item.id === app.id ? { ...item, icon } : item)),
      );
      onClose();
    },
    onSettled: () => client.invalidateQueries({ queryKey: appsKey, exact: true }),
  });
  return (
    <Dialog title="App icon" busy={save.isPending} onClose={onClose} initialFocus={cancel}>
      <div className="apps-icon-picker">
        <div className="apps-icon-preview">
          <AppIcon id={app.id} title={app.title} icon={icon} size={48} />
          <span className="truncate">{app.title}</span>
        </div>
        <fieldset className="project-color-field apps-icon-symbols" disabled={save.isPending}>
          <legend>Symbol</legend>
          <input
            className="apps-icon-search"
            type="search"
            placeholder="Search symbols"
            aria-label="Search symbols"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div ref={scroller} className="apps-icon-scroll">
            {!query.trim() && (
              <div className="apps-icon-glyphs">
                <label className="project-color-option" title="Initial">
                  <input
                    type="radio"
                    name="glyph"
                    aria-label="Initial"
                    checked={!glyph}
                    onChange={() => setGlyph(undefined)}
                  />
                  <AppIcon id={app.id} title={app.title} icon={{ color }} size={24} />
                </label>
              </div>
            )}
            {groups.map(([group, glyphs]) => (
              <section key={group} aria-label={group}>
                <h3 className="apps-icon-group">{group}</h3>
                <div className="apps-icon-glyphs">
                  {glyphs.map((value) => (
                    <label key={value} className="project-color-option" title={label(value)}>
                      <input
                        type="radio"
                        name="glyph"
                        aria-label={label(value)}
                        checked={glyph === value}
                        onChange={() => setGlyph(value)}
                      />
                      <HugeiconsIcon icon={GLYPHS[value]} size={18} strokeWidth={1.8} />
                    </label>
                  ))}
                </div>
              </section>
            ))}
            {!groups.length && <p className="apps-note">No symbols match “{query.trim()}”.</p>}
          </div>
        </fieldset>
        <fieldset className="project-color-field" disabled={save.isPending}>
          <legend>Color</legend>
          <div className="project-colors">
            {CANVAS_ICON_COLORS.map((value) => (
              <label key={value} className="project-color-option">
                <input
                  type="radio"
                  name="color"
                  aria-label={label(value)}
                  checked={color === value}
                  onChange={() => setColor(value)}
                />
                <AppIcon id={app.id} title={app.title} icon={{ ...icon, color: value }} />
              </label>
            ))}
          </div>
        </fieldset>
        {save.error && (
          <p className="text-error" role="alert">
            {save.error.message}
          </p>
        )}
      </div>
      <div className="dialog-actions">
        <Button ref={cancel} variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Dialog>
  );
}
