import initSqlJs, { Database } from "sql.js"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Service } from "./types"

const DB_PATH = join(process.cwd(), "data", "services.sqlite")

async function loadDb(): Promise<Database> {
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm")
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  if (existsSync(DB_PATH)) {
    const fileData = readFileSync(DB_PATH)
    return new SQL.Database(fileData)
  }
  return new SQL.Database()
}

function saveDb(db: Database) {
  const data = db.export()
  writeFileSync(DB_PATH, Buffer.from(data))
}

export async function withDb<T>(fn: (db: Database) => Promise<T> | T): Promise<T> {
  const db = await loadDb()
  try {
    const result = await fn(db)
    saveDb(db)
    return result
  } finally {
    db.close()
  }
}

export function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      needs TEXT NOT NULL,
      eligibility TEXT NOT NULL,
      source_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

export function loadServices(db: Database) {
  const result = db.exec("SELECT * FROM services WHERE active = 1;")
  if (result.length === 0) return []
  const { columns, values } = result[0]

  return values.map((row: unknown[]) => {
    const item: Record<string, unknown> = {}
    for (let i = 0; i < columns.length; i += 1) {
      item[columns[i]] = row[i]
    }

    return {
      ...(item as Record<string, any>),
      needs: JSON.parse(item.needs as string),
      eligibility: JSON.parse(item.eligibility as string),
      active: Boolean(item.active),
    } as Service
  })
}

export function upsertServices(db: Database, services: any[]) {
  db.run("DELETE FROM services")

  const insertStmt = db.prepare(
    `INSERT INTO services (name, description, needs, eligibility, source_url, active)
     VALUES (?, ?, ?, ?, ?, ?);`,
  )

  for (const item of services) {
    insertStmt.run([
      item.name,
      item.description ?? null,
      JSON.stringify(item.needs ?? []),
      JSON.stringify(item.eligibility ?? {}),
      item.source_url ?? null,
      item.active ?? true,
    ])
  }
  insertStmt.free()
}
