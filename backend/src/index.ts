import express from "express"
import cors from "cors"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readFile } from "node:fs/promises"

import { initSchema, loadServices, upsertServices, withDb } from "./db"
import { loadCatalogServices } from "./catalog"
import { findNearbyProviders } from "./providerSearch"
import { findMatches } from "./rules"
import type { Profile } from "./types"
import { fetchAndValidateServices } from "./updater"

const PORT = Number(process.env.PORT ?? 3000)
const app = express()
const AUTO_REFRESH_INTERVAL_MS = Number(
  process.env.AUTO_REFRESH_INTERVAL_MS ?? 1000 * 60 * 60 * 6,
)
const CORS_ALLOWLIST = (process.env.CORS_ALLOWLIST ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

// Work from the project root (where package.json lives)
const SEED_PATH = join(process.cwd(), "data", "seed_services.json")
const UPDATE_SOURCES_PATH = join(process.cwd(), "data", "update_sources.json")

let lastAutoRefreshAt: string | null = null
let lastAutoRefreshStatus: "idle" | "running" | "success" | "blocked" | "error" =
  "idle"
let lastAutoRefreshMessage = "Not started"

async function ensureSeeded() {
  await withDb(async (db) => {
    initSchema(db)
    const services = loadServices(db)
    if (services.length === 0) {
      const raw = await readFile(SEED_PATH, "utf-8")
      const seed = JSON.parse(raw)
      upsertServices(db, seed)
    }
    return null
  })
}

app.use(
  cors({
    origin(origin, callback) {
      if (CORS_ALLOWLIST.length === 0) {
        return callback(null, true)
      }

      if (!origin || CORS_ALLOWLIST.includes(origin)) {
        return callback(null, true)
      }

      // Return null/false rather than an Error so cors sends a clean 403-style
      // response instead of triggering Express's error handler (which has no
      // CORS headers and causes browser CORS blocking on top of the 500).
      return callback(null, false)
    },
  }),
)
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

ensureSeeded().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to seed database:", err)
})

// Serve the production build (if it exists)
const staticDir = join(process.cwd(), "frontend", "dist")
const hasStaticFrontend = existsSync(join(staticDir, "index.html"))

if (hasStaticFrontend) {
  app.use(express.static(staticDir))
}

app.get("/api/needs", async (_req, res, next) => {
  try {
    const services = await withDb((db) => {
      initSchema(db)
      return loadServices(db)
    })
    const needs = new Set<string>()
    services.forEach((svc) => {
      svc.needs.forEach((n: string) => needs.add(n))
    })
    res.json({ needs: Array.from(needs).sort() })
  } catch (err) {
    next(err)
  }
})

app.get("/api/services", async (_req, res, next) => {
  try {
    const services = await loadCatalogServices()
    res.json({ services })
  } catch (err) {
    next(err)
  }
})

app.post("/api/eligibility", async (req, res, next) => {
  try {
  const profile = req.body as Profile

  const requiredBooleans = [
    profile.atsi,
    profile.has_disability,
    profile.seeking_ndis_access,
    profile.diagnosed_mental_health_condition,
    profile.alcohol_or_drug_concern,
    profile.medicare_card,
    profile.needs_support_at_home,
    profile.urgent_non_life_threatening,
    profile.emergency_now,
    profile.mental_health_concern,
    profile.lives_in_australia,
    profile.australian_resident,
    profile.permanent_impairment,
    profile.reduced_functional_capacity,
  ]

  if (
    profile.age == null ||
    !profile.gender ||
    !profile.region_type ||
    !requiredBooleans.every((value) => typeof value === "boolean")
  ) {
    return res.status(400).json({
      error:
        "Age, gender, location type, and all Step 1 eligibility questions are required.",
    })
  }

  const services = await loadCatalogServices()

  const matches = findMatches(services, profile)
  res.json({ matches })
  } catch (err) { next(err) }
})

app.post("/api/providers/search", async (req, res) => {
  const { postcode, address, serviceIds, radiusKm } = req.body as {
    postcode?: string
    address?: string
    serviceIds?: number[]
    radiusKm?: number
  }

  const hasPostcode = postcode && /^\d{4}$/.test(postcode)
  const hasAddress = address && address.trim().length > 0

  if (!hasPostcode && !hasAddress) {
    return res.status(400).json({
      error: "Enter either a 4-digit Victorian postcode or a detailed address.",
    })
  }

  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return res.status(400).json({
      error: "Select at least one healthcare service before provider search.",
    })
  }

  const services = await loadCatalogServices()
  const selectedServices = services.filter((service) => serviceIds.includes(service.id))

  if (selectedServices.length === 0) {
    return res.status(404).json({
      error: "Selected healthcare services were not found.",
    })
  }

  try {
    const normalizedRadiusKm =
      typeof radiusKm === "number" && Number.isFinite(radiusKm)
        ? Math.min(Math.max(radiusKm, 2), 100)
        : 15
    const searchLocation = hasPostcode ? postcode! : address!
    const result = await findNearbyProviders(searchLocation, selectedServices, normalizedRadiusKm)
    return res.json(result)
  } catch (error) {
    return res.status(502).json({
      error: String(error),
    })
  }
})

function computeDiff(oldServices: any[], newServices: any[]) {
  const byName = (arr: any[]) =>
    arr.reduce((map, item) => {
      map[item.name] = item
      return map
    }, {} as Record<string, any>)

  const oldByName = byName(oldServices)
  const newByName = byName(newServices)

  const added = newServices.filter((s) => !oldByName[s.name])
  const removed = oldServices.filter((s) => !newByName[s.name])

  const updated = Object.entries(newByName)
    .filter(([name, newSvc]) => {
      const oldSvc = oldByName[name]
      if (!oldSvc) return false
      return JSON.stringify(oldSvc) !== JSON.stringify(newSvc)
    })
    .map(([name, newSvc]) => ({ before: oldByName[name], after: newSvc }))

  return { added, removed, updated }
}

async function loadUpdateSources(): Promise<string[]> {
  try {
    const raw = await readFile(UPDATE_SOURCES_PATH, "utf-8")
    const parsed = JSON.parse(raw) as { sources?: string[] }
    return Array.isArray(parsed.sources) ? parsed.sources : []
  } catch {
    return []
  }
}

async function runAutoRefreshNow() {
  lastAutoRefreshStatus = "running"
  lastAutoRefreshMessage = "Fetching latest sources"

  try {
    const sourceList = await loadUpdateSources()
    if (sourceList.length === 0) {
      lastAutoRefreshStatus = "blocked"
      lastAutoRefreshMessage = "No sources configured"
      return
    }

    const existing = await withDb((db) => {
      initSchema(db)
      return loadServices(db)
    })

    const fetchResult = await fetchAndValidateServices(sourceList, { level: 3 })
    const diff = computeDiff(existing, fetchResult.services)

    if (fetchResult.services.length === 0) {
      lastAutoRefreshStatus = "blocked"
      lastAutoRefreshMessage = "Auto refresh returned 0 services; keeping existing database unchanged"
      return
    }

    await withDb((db) => {
      initSchema(db)
      upsertServices(db, fetchResult.services)
      return null
    })

    lastAutoRefreshStatus = "success"
    if (fetchResult.validationWarnings.length > 0) {
      lastAutoRefreshMessage = `Applied ${fetchResult.services.length} services with ${fetchResult.validationWarnings.length} warnings (added ${diff.added.length}, removed ${diff.removed.length}, updated ${diff.updated.length})`
    } else {
      lastAutoRefreshMessage = `Applied ${fetchResult.services.length} services (added ${diff.added.length}, removed ${diff.removed.length}, updated ${diff.updated.length})`
    }
    lastAutoRefreshAt = new Date().toISOString()
  } catch (error) {
    lastAutoRefreshStatus = "error"
    lastAutoRefreshMessage = String(error)
  }
}

app.post("/api/update", async (req, res, next) => {
  try {
  const { services, apply } = req.body as {
    services?: any[]
    apply?: boolean
  }

  if (!Array.isArray(services)) {
    return res.status(400).json({ error: "Expected an array of services" })
  }

  const existing = await withDb((db) => {
    initSchema(db)
    return loadServices(db)
  })

  const diff = computeDiff(existing, services)

  if (apply) {
    await withDb((db) => {
      initSchema(db)
      upsertServices(db, services)
      return null
    })
  }

  res.json({ status: apply ? "applied" : "preview", diff })
  } catch (err) { next(err) }
})

app.post("/api/update/auto", async (req, res, next) => {
  try {
  const { sources, apply, allowWarnings, agentLevel } = req.body as {
    sources?: string[]
    apply?: boolean
    allowWarnings?: boolean
    agentLevel?: 1 | 2 | 3 | 4
  }

  let sourceList = sources
  if (!Array.isArray(sourceList) || sourceList.length === 0) {
    try {
      const raw = await readFile(UPDATE_SOURCES_PATH, "utf-8")
      const parsed = JSON.parse(raw) as { sources?: string[] }
      sourceList = Array.isArray(parsed.sources) ? parsed.sources : []
    } catch {
      sourceList = []
    }
  }

  if (!sourceList || sourceList.length === 0) {
    return res.status(400).json({
      error:
        "No update sources configured. Provide body.sources or create backend/data/update_sources.json",
    })
  }

  const existing = await withDb((db) => {
    initSchema(db)
    return loadServices(db)
  })

  const selectedLevel =
    agentLevel && [1, 2, 3, 4].includes(agentLevel) ? agentLevel : 1

  const fetchResult = await fetchAndValidateServices(sourceList, {
    level: selectedLevel,
  })
  const diff = computeDiff(existing, fetchResult.services)

  if (!allowWarnings && fetchResult.validationWarnings.length > 0) {
    return res.status(422).json({
      status: "blocked",
      reason: "Validation warnings found. Re-run with allowWarnings=true to apply anyway.",
      agentLevel: selectedLevel,
      stageSummary: fetchResult.stageSummary,
      reports: fetchResult.reports,
      validationWarnings: fetchResult.validationWarnings,
      diff,
    })
  }

  if (apply) {
    await withDb((db) => {
      initSchema(db)
      upsertServices(db, fetchResult.services)
      return null
    })
  }

  return res.json({
    status: apply ? "applied" : "preview",
    agentLevel: selectedLevel,
    fetchedCount: fetchResult.services.length,
    stageSummary: fetchResult.stageSummary,
    reports: fetchResult.reports,
    validationWarnings: fetchResult.validationWarnings,
    diff,
  })
  } catch (err) { next(err) }
})

app.get("/api/refresh/status", (_req, res) => {
  res.json({
    lastAutoRefreshAt,
    lastAutoRefreshStatus,
    lastAutoRefreshMessage,
    intervalMs: AUTO_REFRESH_INTERVAL_MS,
  })
})

app.post("/api/refresh/now", async (_req, res, next) => {
  try {
    await runAutoRefreshNow()
    res.json({
      lastAutoRefreshAt,
      lastAutoRefreshStatus,
      lastAutoRefreshMessage,
    })
  } catch (err) { next(err) }
})

// Global error handler — MUST have 4 params and be registered after all routes.
// Re-injects CORS headers so browsers can read error bodies across origins.
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    const requestOrigin = req.headers.origin as string | undefined
    if (
      !requestOrigin ||
      CORS_ALLOWLIST.length === 0 ||
      CORS_ALLOWLIST.includes(requestOrigin)
    ) {
      res.header("Access-Control-Allow-Origin", requestOrigin ?? "*")
      res.header("Vary", "Origin")
    }
    // eslint-disable-next-line no-console
    console.error("[error]", err.message ?? err)
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// Fall back to index.html for SPA routing when a local frontend build exists.
if (hasStaticFrontend) {
  app.get("/*", (_req, res) => {
    res.sendFile(join(staticDir, "index.html"))
  })
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`)
  // eslint-disable-next-line no-console
  console.log(
    `CORS: ${CORS_ALLOWLIST.length === 0 ? "open (all origins)" : `allowlist: ${CORS_ALLOWLIST.join(", ")}`}`,
  )

  runAutoRefreshNow().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Initial auto refresh failed:", error)
  })

  setInterval(() => {
    runAutoRefreshNow().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Scheduled auto refresh failed:", error)
    })
  }, AUTO_REFRESH_INTERVAL_MS)
})
