// Exports every desktop theme's derived tokens for the iPhone app, so both match exactly.
// Run from the repository root: `bunx tsx apps/ios/scripts/export-themes.ts`.
import { writeFileSync } from 'node:fs';
import { defaultPresetID, presets, type Variant } from '../../web/src/features/theme/presets';
import { deriveTheme } from '../../web/src/features/theme/theme';

const out: Record<string, unknown> = { defaults: defaultPresetID, themes: {} };
for (const variant of ['light', 'dark'] as Variant[]) {
  for (const preset of presets[variant]) {
    const { tokens, art } = deriveTheme(variant, { preset: preset.id });
    (out.themes as Record<string, unknown>)[preset.id] = {
      name: preset.name,
      variant,
      art,
      tokens,
    };
  }
}
writeFileSync(
  new URL('../OpenCodex/Core/Theme/themes.json', import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
