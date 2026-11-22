import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// The two clients own different preference formats. Seed identical presentation state.
export function seedProfile(dataDir: string, directory: string, native: boolean) {
  const directories: string[] =
    process.env.HOME === '/tmp/ocr-bench/home'
      ? JSON.parse(readFileSync('/tmp/ocr-bench/fixture.json', 'utf8')).projects
      : [directory];
  const projects = directories.map((directory) => ({ name: basename(directory), directory }));
  const project = { name: basename(directory), directory };
  writeFileSync(
    join(dataDir, 'preferences.json'),
    JSON.stringify(
      native
        ? { project: directory, opened_projects: projects }
        : { project: JSON.stringify(project), projects: JSON.stringify(projects) },
    ),
  );
}
