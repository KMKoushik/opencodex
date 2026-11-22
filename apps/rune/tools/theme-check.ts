// Run from the repository root: bun apps/rune/tools/theme-check.ts [binary].
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { presets } from '../../web/src/features/theme/presets';
import { deriveTokens } from '../../web/src/features/theme/theme';

if (process.argv.includes('--write-seeds')) {
  await writeFile(
    new URL('../presets.json', import.meta.url),
    JSON.stringify(presets, null, 2) + '\n',
  );
} else {
  const binary = process.argv[2] ?? 'apps/rune/target/release/opencodex';
  let count = 0;
  for (const variant of ['light', 'dark'] as const) {
    for (const preset of presets[variant]) {
      const actual: Record<string, string> = JSON.parse(
        execFileSync(binary, ['--dump-theme', '--theme', variant, '--preset', preset.id], {
          encoding: 'utf8',
        }),
      );
      for (const [name, expected] of Object.entries(deriveTokens(variant, { preset: preset.id }))) {
        if (actual[name] !== expected)
          throw new Error(`${preset.id}/${name}: ${actual[name]} !== ${expected}`);
        count++;
      }
    }
  }
  console.log(`${count} tokens match the TypeScript source exactly across all 23 presets.`);
}
