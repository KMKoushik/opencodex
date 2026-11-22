import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Build = {
  app: string;
  revision: string;
  version: string;
  executableSHA256: string;
  resources?: { path: string; sha256: string }[];
};

export function verifyBuild(app: string, executable: string): Build | null {
  if (process.env.HOME !== '/tmp/ocr-bench/home') return null;
  const builds: Build[] = JSON.parse(
    readFileSync(new URL('../results/builds.json', import.meta.url), 'utf8'),
  );
  const build = builds.find((build) => resolve(build.app) === app);
  if (!build) throw new Error(`No build provenance for ${app}`);
  for (const [path, expected] of [
    [executable, build.executableSHA256],
    ...(build.resources ?? []).map((resource) => [resolve(app, resource.path), resource.sha256]),
  ]) {
    const result = Bun.spawnSync(['shasum', '-a', '256', path!]);
    if (result.exitCode || result.stdout.toString().trim().split(' ')[0] !== expected)
      throw new Error(
        `Bundle changed since builds.json was recorded: ${path}. Rebuild and record provenance, do not mislabel this comparison.`,
      );
  }
  return build;
}
