import type { DatabaseSync } from 'node:sqlite';

/** Self-contained: also serialized into the search worker, away from the HTTP hot path. */
export function sqliteDatabase(require: NodeJS.Require): typeof DatabaseSync {
  if (!process.versions.bun) return require('node:sqlite').DatabaseSync;
  const { Database } = require('bun:sqlite');
  return class extends Database {
    private statements = new Set<{ finalize(): void }>();
    constructor(path: string, options: { readOnly?: boolean; timeout?: number } = {}) {
      super(path, { readonly: options.readOnly, strict: true });
      this.exec(`PRAGMA busy_timeout = ${options.timeout ?? 0}`);
    }
    prepare(sql: string) {
      const statement = super.prepare(sql);
      this.statements.add(statement);
      return statement;
    }
    close() {
      // Match Node's deterministic close, including prepared statements, before a
      // search worker exits. Bun otherwise defers their finalization until GC.
      for (const statement of this.statements) statement.finalize();
      this.statements.clear();
      super.close(true);
    }
  } as unknown as typeof DatabaseSync;
}
