import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const candidates = process.env.ASCII_DIAGRAM_SKILL_DIR
  ? [process.env.ASCII_DIAGRAM_SKILL_DIR]
  : [
      join(homedir(), '.agents/skills/ascii-diagram-png'),
      join(homedir(), '.config/opencode/skills/ascii-diagram-png'),
    ];
const skill = candidates.find((path) => existsSync(join(path, 'scripts/render_ascii_diagram.mjs')));
if (!skill) throw new Error('Install the ascii-diagram-png skill or set ASCII_DIAGRAM_SKILL_DIR.');

const directory = fileURLToPath(new URL('../docs/architecture/', import.meta.url));
const spec = join(directory, 'architecture.json');
const check = process.argv.includes('--check');

function run(script, args) {
  const result = spawnSync('node', [join(skill, 'scripts', script), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!check) run('fetch_tabler_icons.mjs', [spec]);
run('render_ascii_diagram.mjs', [
  spec,
  '--output',
  join(directory, 'architecture'),
  ...(check ? ['--check'] : []),
]);
