/**
 * Runs a canvas's CommonJS-transpiled files and returns the entry's exports. Files are
 * flat (`app.tsx`, `chart.tsx`) and import each other with `./name`.
 */
export function loadModules(
  modules: Record<string, string>,
  entry: string,
  builtins: Record<string, unknown>,
) {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const resolve = (specifier: string) => {
    const name = specifier.replace(/^\.\//, '');
    return [`${name}.tsx`, `${name}.ts`].find((candidate) => candidate in modules);
  };
  const load = (file: string): Record<string, unknown> => {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(file, module);
    const run = new Function(
      'require',
      'module',
      'exports',
      `${modules[file]}\n//# sourceURL=canvas:///${file}`,
    );
    run(require, module, module.exports);
    return module.exports;
  };
  function require(specifier: string) {
    if (specifier in builtins) return builtins[specifier];
    const file = specifier.startsWith('./') ? resolve(specifier) : undefined;
    if (!file)
      throw new Error(
        `Cannot import '${specifier}'. Canvases can import react, @opencodex/canvas, and their own files (./name).`,
      );
    return load(file);
  }
  return load(entry);
}
