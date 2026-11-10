import { createHash } from 'node:crypto';
import type TypeScript from 'typescript';

type TS = typeof TypeScript;
let typescript: Promise<TS> | undefined;
/** TypeScript is large; load it the first time a canvas is opened or checked. */
export const loadTypeScript = () =>
  (typescript ??= import('typescript').then((module) => (module.default ?? module) as TS));

type Transpiled = { code: string; map: string; errors: string[] };
const transpiled = new Map<string, Transpiled>();

/** CommonJS for the server host's module loader. Cached by content, bounded. */
export async function transpile(file: string, source: string): Promise<Transpiled> {
  const key = createHash('sha256').update(file).update('\0').update(source).digest('hex');
  const cached = transpiled.get(key);
  if (cached) return cached;
  const ts = await loadTypeScript();
  const output = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      sourceMap: true,
    },
  });
  const result = {
    code: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, ''),
    map: output.sourceMapText ?? '',
    errors: (output.diagnostics ?? []).map((diagnostic) => formatDiagnostic(ts, diagnostic)),
  };
  if (transpiled.size >= 256) transpiled.delete(transpiled.keys().next().value!);
  transpiled.set(key, result);
  return result;
}

function formatDiagnostic(ts: TS, diagnostic: TypeScript.Diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n  ');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName.replace(/^\/canvas\//, '')}:${line + 1}:${character + 1} ${message}`;
}

const sourceFiles = new Map<string, TypeScript.SourceFile>();
let directories: Set<string> | undefined;

/** Type-checks a canvas's server files against the server SDK. */
export async function typeCheck(files: Record<string, string>) {
  const ts = await loadTypeScript();
  const { CANVAS_TYPES } = await import('./canvas-types.generated');
  directories ??= new Set(
    Object.keys(CANVAS_TYPES).flatMap((path) =>
      path
        .split('/')
        .slice(1, -1)
        .map((_, index, parts) => `/${parts.slice(0, index + 1).join('/')}`),
    ),
  );
  const local = new Map(Object.entries(files).map(([name, text]) => [`/canvas/${name}`, text]));
  const options: TypeScript.CompilerOptions = {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    skipLibCheck: true,
    isolatedModules: true,
    esModuleInterop: true,
  };
  const read = (name: string) => local.get(name) ?? CANVAS_TYPES[name];
  const host: TypeScript.CompilerHost = {
    getSourceFile(name, language) {
      const text = read(name);
      if (text === undefined) return undefined;
      if (local.has(name)) return ts.createSourceFile(name, text, language, true);
      // Library files never change; reusing them keeps their parse and binding.
      let file = sourceFiles.get(name);
      if (!file) sourceFiles.set(name, (file = ts.createSourceFile(name, text, language, true)));
      return file;
    },
    getDefaultLibFileName: () => '/lib/lib.d.ts',
    getDefaultLibLocation: () => '/lib',
    writeFile: () => {},
    getCurrentDirectory: () => '/canvas',
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => read(name) !== undefined,
    readFile: read,
    directoryExists: (name) => name === '/canvas' || directories!.has(name.replace(/\/$/, '')),
    getDirectories: () => [],
  };
  const program = ts.createProgram([...local.keys()], options, host);
  const diagnostics = [
    ...program.getOptionsDiagnostics(),
    ...[...local.keys()].flatMap((name) => {
      const file = program.getSourceFile(name)!;
      return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)];
    }),
  ].filter((item) => item.category === ts.DiagnosticCategory.Error);
  return diagnostics.slice(0, 30).map((diagnostic) => {
    const text = formatDiagnostic(ts, diagnostic);
    const hint = hintFor(diagnostic.code);
    return hint ? `${text}\n  Hint: ${hint}` : text;
  });
}

function hintFor(code: number) {
  if (code === 2305 || code === 2724)
    return 'The exports of @opencodex/canvas/server are in .sdk/server.d.ts next to the canvases.';
  if (code === 2307 || code === 2792)
    return 'server.ts can import @opencodex/canvas/server and its own files (./name), and runs other tools with sh().';
  if (code === 7006 || code === 7031)
    return 'Give the parameter a type, e.g. (row: { name: string; value: number }) => …';
  return undefined;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Maps a position in transpiled output back to its source line using the source map. */
export function originalLine(map: string, generatedLine: number, generatedColumn = 0) {
  let mappings: string;
  try {
    mappings = (JSON.parse(map) as { mappings: string }).mappings;
  } catch {
    return undefined;
  }
  let source = 0;
  let found: number | undefined;
  const lines = mappings.split(';');
  for (let index = 0; index < lines.length && index < generatedLine; index++) {
    let column = 0;
    for (const segment of lines[index]!.split(',')) {
      if (!segment) continue;
      const values: number[] = [];
      let value = 0;
      let shift = 0;
      for (const char of segment) {
        const digit = BASE64.indexOf(char);
        value += (digit & 31) << shift;
        if (digit & 32) shift += 5;
        else {
          values.push(value & 1 ? -(value >> 1) : value >> 1);
          value = 0;
          shift = 0;
        }
      }
      column += values[0] ?? 0;
      if (values.length < 4) continue;
      source += values[2]!;
      // The last segment starting at or before the column is the one that threw.
      if (index === generatedLine - 1 && (found === undefined || column <= generatedColumn))
        found = source + 1;
    }
  }
  return found;
}
