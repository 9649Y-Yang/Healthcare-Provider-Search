import { readFile } from "node:fs/promises"
import { join } from "node:path"

import type { Service } from "./types"

const CATALOG_PATH = join(process.cwd(), "data", "seed_services.json")

export async function loadCatalogServices(): Promise<Service[]> {
  const raw = await readFile(CATALOG_PATH, "utf-8")
  const parsed = JSON.parse(raw) as Array<Partial<Service>>

  return parsed.map((service, index) => ({
    id: Number(service.id ?? index + 1),
    category: typeof service.category === "string" ? service.category : undefined,
    name: String(service.name ?? "Untitled service"),
    description: service.description,
    needs: Array.isArray(service.needs) ? service.needs : [],
    eligibility:
      service.eligibility && typeof service.eligibility === "object"
        ? service.eligibility
        : {},
    source_url: service.source_url,
    source_summary: service.source_summary,
    provider_queries: Array.isArray(service.provider_queries)
      ? service.provider_queries
      : [],
    active: service.active ?? true,
  }))
}