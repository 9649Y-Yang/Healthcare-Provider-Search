import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { initSchema, upsertServices, withDb } from "./db"

export async function seedFromJson() {
  const jsonPath = join(process.cwd(), "backend", "data", "seed_services.json")
  const raw = await readFile(jsonPath, "utf-8")
  const services = JSON.parse(raw)

  await withDb((db) => {
    initSchema(db)
    upsertServices(db, services)
    return null
  })
}
