import * as duckdb from '@duckdb/duckdb-wasm';
import Papa from 'papaparse';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

// Backend mode state
let backendUrl: string | null = null;
let _isBackendMode = false;

const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export function setBackendUrl(url: string) {
  backendUrl = url;
}

export function isBackendMode() {
  return _isBackendMode;
}

export function getBackendUrl() {
  return backendUrl || DEFAULT_BACKEND_URL;
}

export async function checkBackendHealth(): Promise<boolean> {
  const url = backendUrl || DEFAULT_BACKEND_URL;
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok') {
        backendUrl = url;
        _isBackendMode = true;
        return true;
      }
    }
  } catch {
    // Backend not available
  }
  _isBackendMode = false;
  return false;
}

export async function initDuckDB() {
  // Try backend first
  const hasBackend = await checkBackendHealth();
  if (hasBackend) {
    console.log('DuckDB backend detected, using backend mode');
    return { db: null, conn: null };
  }

  // Fallback to WASM
  if (db) return { db, conn: conn! };

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
  );

  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);

  conn = await db.connect();
  
  return { db, conn };
}

export async function executeQuery(query: string) {
  if (_isBackendMode) {
    return executeBackendQuery(query);
  }

  if (!conn) {
    await initDuckDB();
  }
  
  try {
    const result = await conn!.query(query);
    return result.toArray().map(row => {
      const obj: any = {};
      for (const [key, value] of row) {
        obj[key] = typeof value === 'bigint' ? Number(value) : value;
      }
      return obj;
    });
  } catch (error) {
    throw error;
  }
}

async function executeBackendQuery(query: string): Promise<any[]> {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Query failed' }));
    throw new Error(err.detail || 'Backend query failed');
  }
  const data = await res.json();
  return data.data || [];
}

export async function getConnection() {
  if (_isBackendMode) {
    // Return a proxy that routes to backend
    return null as any;
  }
  if (!conn) {
    await initDuckDB();
  }
  return conn!;
}

export async function getDatabase() {
  if (_isBackendMode) {
    return null as any;
  }
  if (!db) {
    await initDuckDB();
  }
  return db!;
}

// Backend-specific helpers
export async function backendListTables() {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/tables`);
  if (!res.ok) throw new Error('Failed to list tables');
  return (await res.json()).tables;
}

export async function backendImportFile(file: File, tableName: string, overwrite = false) {
  const url = getBackendUrl();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('table_name', tableName);
  formData.append('overwrite', String(overwrite));
  const res = await fetch(`${url}/api/import`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Import failed' }));
    throw new Error(err.detail || 'Import failed');
  }
  return res.json();
}

export async function backendAttachDatabase(config: {
  type: string; host?: string; port?: number; database?: string;
  username?: string; password?: string; path?: string;
}) {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Attach failed' }));
    throw new Error(err.detail || 'Attach failed');
  }
  return res.json();
}

export async function backendManageExtension(name: string, action = 'install_and_load') {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/extensions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Extension operation failed' }));
    throw new Error(err.detail || 'Extension operation failed');
  }
  return res.json();
}

export async function backendListExtensions() {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/extensions/list`);
  if (!res.ok) throw new Error('Failed to list extensions');
  return (await res.json()).extensions;
}

export async function importCSVFile(file: File, tableName: string, columns?: string[]) {
  if (_isBackendMode) {
    return backendImportFile(file, tableName);
  }

  // WASM mode - existing logic
  const connection = await getConnection();
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    if ((connection as any).registerFileBuffer) {
      const remotePath = `/tmp/${safeName}.csv`;
      await (connection as any).registerFileBuffer(remotePath, uint8);
      const tmpTable = `_tmp_${safeName}_${Date.now()}`;
      await connection.query(`CREATE TABLE ${tmpTable} AS SELECT * FROM read_csv_auto('${remotePath}')`);
      await connection.query(`ALTER TABLE ${tmpTable} RENAME TO "${safeName}"`);
      return;
    }
  } catch (err) {
    console.warn('registerFileBuffer not available or failed, falling back to client-side import', err);
  }

  return new Promise<void>((resolve, reject) => {
    let created = false;
    let cols: string[] = [];
    const batchSize = 500;
    let insertPromises: Promise<any>[] = [];

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      chunkSize: 1024 * 128,
      chunk: (results) => {
        const rows = results.data as any[];
        if (!rows || rows.length === 0) return;

        if (!created) {
          const rawCols = Object.keys(rows[0]);
          cols = rawCols.map((col, idx) => {
            let sanitized = col && col.trim() ? col.trim() : `column_${idx + 1}`;
            sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');
            if (/^\d/.test(sanitized)) sanitized = 'col_' + sanitized;
            return sanitized;
          });
          cols = cols.map((col, idx) => {
            const duplicates = cols.slice(0, idx).filter(c => c === col);
            return duplicates.length > 0 ? `${col}_${duplicates.length + 1}` : col;
          });
          const colDefs = cols.map(c => `"${c}" TEXT`).join(', ');
          insertPromises.push(connection.query(`CREATE TABLE IF NOT EXISTS "${safeName}" (${colDefs})`));
          created = true;
        }

        const rawCols = Object.keys(rows[0]);
        let batch: string[] = [];
        for (const r of rows) {
          const vals = rawCols.map((originalCol) => {
            const val = r[originalCol];
            return val == null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`;
          }).join(',');
          batch.push(`(${vals})`);
          if (batch.length >= batchSize) {
            const q = `INSERT INTO "${safeName}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES ${batch.join(',')}`;
            insertPromises.push(connection.query(q));
            batch = [];
          }
        }
        if (batch.length) {
          const q = `INSERT INTO "${safeName}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES ${batch.join(',')}`;
          insertPromises.push(connection.query(q));
        }
      },
      complete: async () => {
        try {
          await Promise.all(insertPromises);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
}
