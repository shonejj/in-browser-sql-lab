import * as duckdb from '@duckdb/duckdb-wasm';

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
    return result.toArray().map(row => Object.fromEntries(row));
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
