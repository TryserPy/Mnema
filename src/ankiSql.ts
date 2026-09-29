// sql.js подгружается только когда нужен импорт из Anki. WASM встроен в сборку (base64),
// чтобы работать и из file:// в приложении для Windows.
import type { SqlJsStatic } from 'sql.js';

let sqlPromise: Promise<SqlJsStatic> | null = null;

export function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= (async () => {
    const [{ default: initSqlJs }, { default: b64 }] = await Promise.all([import('sql.js'), import('virtual:sql-wasm')]);
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return initSqlJs({ wasmBinary: bin.buffer });
  })();
  return sqlPromise;
}
