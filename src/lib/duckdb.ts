import * as duckdb from '@duckdb/duckdb-wasm';
import Papa from 'papaparse';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

// Backend mode state
let backendUrl: string | null = null;
let _isBackendMode = false;
let _forceMode: 'wasm' | 'backend' | null = null;

const DEFAULT_BACKEND_URL = 'http://localhost:9876';

// Check if forced to WASM (for GitHub Pages builds)
const FORCE_WASM = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FORCE_WASM === 'true';

export function setBackendUrl(url: string) {
  backendUrl = url;
  localStorage.setItem('duckdb_backend_url', url);
}

export function isBackendMode() {
  return _isBackendMode;
}

export function getBackendUrl() {
  return backendUrl || localStorage.getItem('duckdb_backend_url') || DEFAULT_BACKEND_URL;
}

export function getForceMode() {
  return _forceMode;
}

export async function forceWasmMode() {
  _forceMode = 'wasm';
  _isBackendMode = false;
  localStorage.setItem('duckdb_force_mode', 'wasm');
  // Initialize WASM if not already done
  if (!db) {
    await initWasmEngine();
  }
}

export async function forceBackendMode(url?: string) {
  if (url) setBackendUrl(url);
  _forceMode = 'backend';
  localStorage.setItem('duckdb_force_mode', 'backend');
  const ok = await checkBackendHealth();
  if (!ok) {
    throw new Error(`Cannot connect to backend at ${getBackendUrl()}`);
  }
}

export async function setAutoMode() {
  _forceMode = null;
  localStorage.removeItem('duckdb_force_mode');
}

export async function checkBackendHealth(): Promise<boolean> {
  if (FORCE_WASM) {
    _isBackendMode = false;
    return false;
  }
  const url = getBackendUrl();
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

async function initWasmEngine() {
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

export async function initDuckDB() {
  // Restore saved mode preference
  const savedMode = localStorage.getItem('duckdb_force_mode');
  if (savedMode === 'wasm') {
    _forceMode = 'wasm';
  } else if (savedMode === 'backend') {
    _forceMode = 'backend';
  }

  // If forced to WASM, skip backend check
  if (_forceMode === 'wasm' || FORCE_WASM) {
    _isBackendMode = false;
    return initWasmEngine();
  }

  // Try backend first (or if forced to backend)
  const hasBackend = await checkBackendHealth();
  if (hasBackend) {
    console.log('DuckDB backend detected, using backend mode');
    return { db: null, conn: null };
  }

  // If forced to backend but it's unavailable
  if (_forceMode === 'backend') {
    console.warn('Backend forced but unavailable, falling back to WASM');
    _isBackendMode = false;
  }

  // Fallback to WASM
  return initWasmEngine();
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

// ─── Backend-specific helpers ───────────────────────────────────────────────

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

// ─── S3/MinIO helpers ───────────────────────────────────────────────────────

export async function backendConfigureS3(config: {
  endpoint: string; access_key: string; secret_key: string;
  region?: string; use_ssl?: boolean; url_style?: string;
}) {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/s3/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'S3 configure failed' }));
    throw new Error(err.detail || 'S3 configure failed');
  }
  return res.json();
}

export async function backendListS3(bucket: string, prefix = '') {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/s3/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, prefix }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'S3 list failed' }));
    throw new Error(err.detail || 'S3 list failed');
  }
  return res.json();
}

export async function backendImportFromS3(bucket: string, key: string, tableName: string, overwrite = false) {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/s3/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, key, table_name: tableName, overwrite }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'S3 import failed' }));
    throw new Error(err.detail || 'S3 import failed');
  }
  return res.json();
}

export async function backendExportToS3(bucket: string, key: string, query?: string) {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/s3/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, key, query }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'S3 export failed' }));
    throw new Error(err.detail || 'S3 export failed');
  }
  return res.json();
}

// ─── Saved Connections ──────────────────────────────────────────────────────

export async function backendListConnections() {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/connections`);
  if (!res.ok) throw new Error('Failed to list connections');
  return (await res.json()).connections;
}

export async function backendSaveConnection(config: any) {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Save connection failed' }));
    throw new Error(err.detail || 'Save connection failed');
  }
  return res.json();
}

export async function backendDeleteConnection(id: string) {
  const url = getBackendUrl();
  const res = await fetch(`${url}/api/connections/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete connection');
  return res.json();
}

// ─── DB Export ──────────────────────────────────────────────────────────────

export async function exportDuckDB(): Promise<Blob> {
  if (_isBackendMode) {
    const url = getBackendUrl();
    const res = await fetch(`${url}/api/export/duckdb`, { method: 'POST' });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  }

  // WASM mode: export via OPFS or in-memory
  if (!db) throw new Error('No database initialized');
  
  try {
    // Try to export database to a temporary path
    await conn!.query("EXPORT DATABASE '/tmp/export' (FORMAT PARQUET)");
    // For WASM, we'll just create a CSV dump of all tables
    const tables = await conn!.query("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.toArray().map((r: any) => r.name || r[0]);
    
    let csvContent = '';
    for (const name of tableNames) {
      const result = await conn!.query(`SELECT * FROM "${name}"`);
      const rows = result.toArray();
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        csvContent += `--- TABLE: ${name} ---\n`;
        csvContent += cols.join(',') + '\n';
        for (const row of rows) {
          csvContent += cols.map(c => JSON.stringify(row[c] ?? '')).join(',') + '\n';
        }
        csvContent += '\n';
      }
    }
    return new Blob([csvContent], { type: 'text/csv' });
  } catch {
    throw new Error('WASM export not fully supported. Use backend mode for .duckdb file export.');
  }
}

// ─── CSV Import (WASM fallback) ─────────────────────────────────────────────

export async function importCSVFile(file: File, tableName: string, columns?: string[]) {
  if (_isBackendMode) {
    return backendImportFile(file, tableName);
  }

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
