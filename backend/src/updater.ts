import type { Service } from "./types"

type ValidationWarning = {
  source: string
  index: number
  message: string
}

type SourceReport = {
  source: string
  fetched: boolean
  count: number
  warnings: string[]
}

type StageSummary = {
  level: 1 | 2 | 3 | 4
  fetchedSources: number
  fetchedRecords: number
  normalizedRecords: number
  reachableSourceUrlsChecked: number
}

export type AutoAgentOptions = {
  level?: 1 | 2 | 3 | 4
}

export type AutoUpdateResult = {
  services: Service[]
  reports: SourceReport[]
  validationWarnings: ValidationWarning[]
  stageSummary: StageSummary
}

type ResolvedSource = {
  source: string
  url: string
  method?: "GET" | "POST"
  body?: string
  headers?: Record<string, string>
}

function resolveSource(source: string): ResolvedSource {
  if (source === "nominatim:vic-hospitals") {
    const url =
      "https://nominatim.openstreetmap.org/search?q=" +
      encodeURIComponent("hospital in Victoria Australia") +
      "&format=jsonv2&limit=200"

    return {
      source,
      url,
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "HealthcareProviderSearchBot/1.0 (local dev; contact: local@localhost)",
      },
    }
  }

  if (source === "overpass:vic-hospitals") {
    const query = `[out:json][timeout:30];
area["ISO3166-2"="AU-VIC"][admin_level=4]->.searchArea;
(
  node["amenity"="hospital"](area.searchArea);
  way["amenity"="hospital"](area.searchArea);
  relation["amenity"="hospital"](area.searchArea);
);
out tags center;`

    return {
      source,
      url: "https://overpass-api.de/api/interpreter",
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "HealthcareProviderSearchBot/1.0 (local dev; contact: local@localhost)",
      },
    }
  }

  if (source === "wikidata:vic-hospitals") {
    const query = `
      SELECT ?item ?itemLabel ?website WHERE {
        ?item wdt:P31/wdt:P279* wd:Q16917.
        ?item wdt:P131* wd:Q36687.
        OPTIONAL { ?item wdt:P856 ?website. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 300
    `
    const url =
      "https://query.wikidata.org/sparql?format=json&query=" +
      encodeURIComponent(query)
    return {
      source,
      url,
      headers: {
        "User-Agent": "HealthcareProviderSearchBot/1.0 (local dev; contact: local@localhost)",
        Accept: "application/sparql-results+json",
      },
    }
  }

  return { source, url: source }
}

function fromWikidataBindings(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return []
  const results = (payload as Record<string, unknown>).results
  if (!results || typeof results !== "object") return []
  const bindings = (results as Record<string, unknown>).bindings
  if (!Array.isArray(bindings)) return []

  return bindings.map((binding) => {
    const item = binding as Record<string, any>
    const name = item.itemLabel?.value
    const website = item.website?.value
    const detailsUrl = item.item?.value

    return {
      name,
      description: "Healthcare provider record sourced from public linked data",
      needs: ["general_healthcare"],
      eligibility: {},
      source_url: website || detailsUrl,
      active: true,
    }
  })
}

function fromOverpassElements(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return []
  const elements = (payload as Record<string, unknown>).elements
  if (!Array.isArray(elements)) return []

  return elements.map((entry) => {
    const item = entry as Record<string, any>
    const tags = (item.tags as Record<string, string>) ?? {}
    const name = tags.name ?? `Hospital ${item.type ?? "item"} ${item.id ?? ""}`
    const website = tags.website ?? tags["contact:website"]
    const description =
      tags.description ??
      tags["healthcare:speciality"] ??
      "Public healthcare provider record sourced from OpenStreetMap"

    const osmUrl =
      item.type && item.id
        ? `https://www.openstreetmap.org/${item.type}/${item.id}`
        : undefined

    return {
      name,
      description,
      needs: ["general_healthcare"],
      eligibility: {},
      source_url: website || osmUrl,
      active: true,
    }
  })
}

function fromNominatimRecords(payload: unknown): unknown[] {
  if (!Array.isArray(payload)) return []
  const records = payload as Array<Record<string, unknown>>

  const nominatimLike = records.every(
    (item) => typeof item.display_name === "string" || typeof item.name === "string",
  )
  if (!nominatimLike) return []

  return records.map((item) => {
    const displayName =
      typeof item.display_name === "string" ? item.display_name : undefined
    const name =
      typeof item.name === "string"
        ? item.name
        : displayName?.split(",")[0]?.trim() ?? "Healthcare provider"

    const osmType = typeof item.osm_type === "string" ? item.osm_type : undefined
    const osmId = typeof item.osm_id === "number" ? item.osm_id : undefined
    const osmPath =
      osmType === "node"
        ? "node"
        : osmType === "way"
          ? "way"
          : osmType === "relation"
            ? "relation"
            : undefined
    const osmUrl =
      osmPath && osmId ? `https://www.openstreetmap.org/${osmPath}/${osmId}` : undefined

    return {
      name,
      description: displayName ?? "Healthcare provider record sourced from OpenStreetMap Nominatim",
      needs: ["general_healthcare"],
      eligibility: {},
      source_url: osmUrl,
      active: true,
    }
  })
}

function asServiceArray(payload: unknown): unknown[] {
  const nominatimRecords = fromNominatimRecords(payload)
  if (nominatimRecords.length > 0) return nominatimRecords

  if (Array.isArray(payload)) return payload

  const overpassRecords = fromOverpassElements(payload)
  if (overpassRecords.length > 0) return overpassRecords

  const wikidataRecords = fromWikidataBindings(payload)
  if (wikidataRecords.length > 0) return wikidataRecords

  if (payload && typeof payload === "object") {
    const maybeServices = (payload as Record<string, unknown>).services
    if (Array.isArray(maybeServices)) return maybeServices
  }
  return []
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()]
  }
  return []
}

function normalizeService(raw: unknown): Service | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>

  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!name) return null

  const description =
    typeof item.description === "string" ? item.description.trim() : undefined
  const needs = toStringArray(item.needs)
  const eligibility =
    item.eligibility && typeof item.eligibility === "object"
      ? (item.eligibility as Record<string, unknown>)
      : {}

  const sourceUrlRaw =
    typeof item.source_url === "string" ? item.source_url.trim() : ""
  const source_url = sourceUrlRaw || undefined

  const active = item.active == null ? true : Boolean(item.active)

  return {
    id: Number(item.id ?? 0) || 0,
    name,
    description,
    needs,
    eligibility,
    source_url,
    active,
  }
}

function isTrustedHealthcareSource(urlText: string): boolean {
  try {
    const url = new URL(urlText)
    const host = url.hostname.toLowerCase()
    return (
      host.endsWith("wikidata.org") ||
      host.endsWith("openstreetmap.org") ||
      host.endsWith("overpass-api.de") ||
      host.endsWith(".gov.au") ||
      host.endsWith(".vic.gov.au") ||
      host.endsWith(".org.au") ||
      host.includes("health") ||
      host.includes("ndis")
    )
  } catch {
    return false
  }
}

function validateService(
  service: Service,
  source: string,
  index: number,
  level: 1 | 2 | 3 | 4,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  if (level >= 2 && service.needs.length === 0) {
    warnings.push({ source, index, message: "Missing or empty 'needs'" })
  }

  if (level >= 2 && (!service.description || service.description.length < 10)) {
    warnings.push({ source, index, message: "Description appears too short" })
  }

  if (level >= 2 && !service.source_url) {
    warnings.push({ source, index, message: "Missing 'source_url'" })
  } else {
    try {
      if (service.source_url) {
        new URL(service.source_url)
      }
      if (
        level >= 3 &&
        service.source_url &&
        !isTrustedHealthcareSource(service.source_url)
      ) {
        warnings.push({
          source,
          index,
          message: "source_url domain is not in trusted healthcare/government patterns",
        })
      }
    } catch {
      if (level >= 3) {
        warnings.push({ source, index, message: "Invalid 'source_url' URL format" })
      }
    }
  }

  return warnings
}

async function isSourceUrlReachable(urlText: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(urlText, {
      method: "HEAD",
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

function dedupeByName(services: Service[]): Service[] {
  const byName = new Map<string, Service>()
  for (const service of services) {
    byName.set(service.name.trim().toLowerCase(), service)
  }
  return Array.from(byName.values())
}

export async function fetchAndValidateServices(
  sources: string[],
  options: AutoAgentOptions = {},
): Promise<AutoUpdateResult> {
  const level = options.level ?? 1
  const reports: SourceReport[] = []
  const allServices: Service[] = []
  const validationWarnings: ValidationWarning[] = []
  let fetchedRecords = 0
  let normalizedRecords = 0
  let reachableSourceUrlsChecked = 0

  for (const source of sources) {
    const resolved = resolveSource(source)
    const report: SourceReport = {
      source,
      fetched: false,
      count: 0,
      warnings: [],
    }

    try {
      const response = await fetch(resolved.url, {
        method: resolved.method ?? "GET",
        body: resolved.body,
        headers: resolved.headers,
      })
      if (!response.ok) {
        report.warnings.push(`HTTP ${response.status}`)
        reports.push(report)
        continue
      }

      const payload = (await response.json()) as unknown
      const records = asServiceArray(payload)
      fetchedRecords += records.length

      const normalized: Service[] = []
      records.forEach((record, index) => {
        const service = normalizeService(record)
        if (!service) {
          validationWarnings.push({
            source,
            index,
            message: "Invalid record shape; could not normalize to service",
          })
          return
        }
        normalized.push(service)
        validationWarnings.push(...validateService(service, source, index, level))
      })
      normalizedRecords += normalized.length

      if (level >= 4) {
        const toCheck = normalized.slice(0, 20)
        for (let index = 0; index < toCheck.length; index += 1) {
          const service = toCheck[index]
          if (!service.source_url) continue
          reachableSourceUrlsChecked += 1
          const reachable = await isSourceUrlReachable(service.source_url)
          if (!reachable) {
            validationWarnings.push({
              source,
              index,
              message: "source_url not reachable (HEAD request failed)",
            })
          }
        }
      }

      allServices.push(...normalized)
      report.fetched = true
      report.count = normalized.length
    } catch (error) {
      report.warnings.push(String(error))
    }

    reports.push(report)
  }

  return {
    services: dedupeByName(allServices),
    reports,
    validationWarnings,
    stageSummary: {
      level,
      fetchedSources: reports.filter((item) => item.fetched).length,
      fetchedRecords,
      normalizedRecords,
      reachableSourceUrlsChecked,
    },
  }
}
