import sqlite3 from "sqlite3";

export type FetchResult = {
  id: number;
  fetched_at: string;
  source_url: string | null;
  data: unknown;
};

function openDatabase(dbPath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(db);
      }
    });
  });
}

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<sqlite3.RunResult> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as T[]);
      }
    });
  });
}

function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row as T | undefined);
      }
    });
  });
}

function rowToResult(row: any): FetchResult | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fetched_at: row.fetched_at,
    source_url: row.source_url,
    data: JSON.parse(row.data_json),
  };
}

export async function initDb(dbPath: string): Promise<void> {
  const db = await openDatabase(dbPath);
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS fetch_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetched_at TEXT NOT NULL,
      source_url TEXT,
      data_json TEXT NOT NULL
    )`
  );
  db.close();
}

export async function saveResult(dbPath: string, sourceUrl: string, data: unknown): Promise<number> {
  const db = await openDatabase(dbPath);
  const result = await run(
    db,
    "INSERT INTO fetch_results (fetched_at, source_url, data_json) VALUES (datetime('now'), ?, ?)",
    [sourceUrl, JSON.stringify(data)]
  );
  db.close();
  return result.lastID as number;
}

export async function fetchLatestResult(dbPath: string): Promise<FetchResult | null> {
  const db = await openDatabase(dbPath);
  const row = await get<any>(db, "SELECT * FROM fetch_results ORDER BY id DESC LIMIT 1");
  db.close();
  return rowToResult(row);
}

export async function fetchHistory(dbPath: string, limit = 10): Promise<FetchResult[]> {
  const db = await openDatabase(dbPath);
  const rows = await all<any>(db, "SELECT * FROM fetch_results ORDER BY id DESC LIMIT ?", [limit]);
  db.close();
  return rows.map((row) => rowToResult(row)).filter((item): item is FetchResult => item !== null);
}

export async function getResult(dbPath: string, itemId: number): Promise<FetchResult | null> {
  const db = await openDatabase(dbPath);
  const row = await get<any>(db, "SELECT * FROM fetch_results WHERE id = ?", [itemId]);
  db.close();
  return rowToResult(row);
}
