import * as duckdb from '@duckdb/duckdb-wasm';
import Papa from 'papaparse';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export async function initDuckDB() {
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
  if (!conn) {
    await initDuckDB();
  }
  
  try {
    const result = await conn!.query(query);
    return result.toArray().map(row => {
      const obj: any = {};
      for (const [key, value] of row) {
        // Convert BigInt to Number to avoid "Cannot mix BigInt and other types" errors
        obj[key] = typeof value === 'bigint' ? Number(value) : value;
      }
      return obj;
    });
  } catch (error) {
    throw error;
  }
}

export async function getConnection() {
  if (!conn) {
    await initDuckDB();
  }
  return conn!;
}

export async function importCSVFile(file: File, tableName: string, columns?: string[]) {
  // Try to use DuckDB wasm file registration for efficient import
  const connection = await getConnection();
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');

  // Try registerFileBuffer if available
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    // Some versions provide registerFileBuffer on connection
    if ((connection as any).registerFileBuffer) {
      // register under a tmp filename
      const remotePath = `/tmp/${safeName}.csv`;
      await (connection as any).registerFileBuffer(remotePath, uint8);
      // Create table from CSV using read_csv_auto
      // Use a temp table and then rename to ensure atomicity
      const tmpTable = `_tmp_${safeName}_${Date.now()}`;
      await connection.query(`CREATE TABLE ${tmpTable} AS SELECT * FROM read_csv_auto('${remotePath}')`);
      await connection.query(`ALTER TABLE ${tmpTable} RENAME TO "${safeName}"`);
      return;
    }
  } catch (err) {
    console.warn('registerFileBuffer not available or failed, falling back to client-side import', err);
  }

  // Fallback: parse CSV in chunks client-side with PapaParse and insert batches to avoid large memory spikes
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
          
          // Sanitize column names
          cols = rawCols.map((col, idx) => {
            // Handle empty or whitespace-only column names
            let sanitized = col && col.trim() ? col.trim() : `column_${idx + 1}`;
            
            // Remove invalid characters and replace with underscore
            sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');
            
            // Ensure it doesn't start with a number
            if (/^\d/.test(sanitized)) {
              sanitized = 'col_' + sanitized;
            }
            
            return sanitized;
          });
          
          // Ensure unique column names
          cols = cols.map((col, idx) => {
            const duplicates = cols.slice(0, idx).filter(c => c === col);
            return duplicates.length > 0 ? `${col}_${duplicates.length + 1}` : col;
          });
          
          const colDefs = cols.map(c => `"${c}" TEXT`).join(', ');
          insertPromises.push(connection.query(`CREATE TABLE IF NOT EXISTS "${safeName}" (${colDefs})`));
          created = true;
        }

        // Build batched inserts - map from original column names to sanitized ones
        const rawCols = Object.keys(rows[0]);
        let batch: string[] = [];
        for (const r of rows) {
          const vals = rawCols.map((originalCol, idx) => {
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
