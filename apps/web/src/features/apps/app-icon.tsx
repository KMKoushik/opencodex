import { HugeiconsIcon } from '@hugeicons/react';
import type { CanvasIcon } from '@opencodex/contracts/canvas';
import { fallbackColor, useGlyphs } from './app-glyph-store';

/** An app's glyph on a colored tile, styled like project icons; its initial when it has no glyph. */
export function AppIcon({
  id,
  title,
  icon,
  size = 20,
}: {
  id: string;
  title: string;
  icon?: CanvasIcon;
  size?: number;
}) {
  const glyphs = useGlyphs(Boolean(icon?.glyph));
  const glyph = icon?.glyph && glyphs?.[icon.glyph];
  return (
    <span
      className="project-icon app-icon"
      data-color={icon?.color ?? fallbackColor(id)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
      aria-hidden="true"
    >
      {glyph ? (
        <HugeiconsIcon icon={glyph} size={Math.round(size * 0.66)} strokeWidth={1.8} />
      ) : icon?.glyph ? null : (
        Array.from(title.trim())[0]?.toLocaleUpperCase() || '?'
      )}
    </span>
  );
}
