import fs from "node:fs"
import path from "node:path"
import type { Provider, Service } from "./types"

type VerifiedProviderService = {
  name: string
  category: string
}

type VerifiedProviderRecord = {
  id: string
  name: string
  type: string
  address: string
  suburb?: string
  postcode?: string
  lat?: number
  lon?: number
  phone?: string
  website?: string
  bulk_billing?: boolean
  telehealth_available?: boolean
  collection_date?: string
  abn?: string
  services: VerifiedProviderService[]
  needs?: string[]
}

const VERIFIED_PROVIDERS_FILE = path.join(process.cwd(), "data", "verified_providers.json")
const CACHE_TTL_MS = 60 * 60 * 1000

const CATEGORY_LABEL_TO_CODE: Record<string, string> = {
  "Primary Care & General Practice": "general_practice",
  "Urgent & Emergency Care": "urgent_care",
  "Community & Allied Health Services": "allied_health",
  "Mental Health & Wellbeing": "mental_health",
  "Alcohol & Drug Services": "alcohol_drug",
  "Women's & Reproductive Health Services": "womens_health",
  "Men's Health Services": "mens_health",
  "Sexual Health Services": "sexual_health",
  "Aboriginal & Culturally Safe Services": "aboriginal_health",
  "Aged Care & Support": "aged_care",
  "Disability Support & NDIS": "disability_support",
}

const GENERIC_SERVICE_NEEDS = new Set([
  "disability_support",
  "ndis",
  "allied_health",
  "aged_care",
  "mental_health",
  "general_practice",
  "urgent_care",
  "womens_health",
  "mens_health",
  "sexual_health",
  "aboriginal_health",
  "community_support",
  "home_support",
  "daily_living_support",
])

const AGED_CARE_SUB_NEEDS = new Set([
  "assessment",
  "home_support",
  "personal_care",
  "residential_care",
  "nursing_support",
  "respite",
  "carer_support",
])

function normalizedSpecificNeedsForService(service: Service) {
  const normalized = (service.needs ?? []).map((need) => normalizeNeed(String(need))).filter(Boolean)
  return normalized.filter((need) => !GENERIC_SERVICE_NEEDS.has(need))
}

let cachedRecords: VerifiedProviderRecord[] | null = null
let lastLoadTime = 0

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function loadVerifiedRecords(): VerifiedProviderRecord[] {
  const now = Date.now()
  if (cachedRecords && now - lastLoadTime < CACHE_TTL_MS) {
    return cachedRecords
  }

  try {
    const rawData = fs.readFileSync(VERIFIED_PROVIDERS_FILE, "utf-8")
    const parsed = JSON.parse(rawData) as VerifiedProviderRecord[]
    cachedRecords = Array.isArray(parsed) ? parsed : []
    lastLoadTime = now
    return cachedRecords
  } catch (error) {
    console.error("Error loading verified providers:", error)
    cachedRecords = []
    lastLoadTime = now
    return cachedRecords
  }
}

function selectedServicesToRequestedNeeds(selectedServices: Service[]) {
  const requested = new Set<string>()

  selectedServices.forEach((service) => {
    const specificNeeds = normalizedSpecificNeedsForService(service)
    if (specificNeeds.length > 0) {
      specificNeeds.forEach((need) => requested.add(need))
      return
    }

    const primaryNeed = normalizeNeed(String(service.needs?.[0] ?? ""))
    if (primaryNeed) requested.add(primaryNeed)

    const category = service.category?.trim()
    if (category && CATEGORY_LABEL_TO_CODE[category]) {
      requested.add(CATEGORY_LABEL_TO_CODE[category])
    }
  })

  return requested
}

function normalizeNeed(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function deriveNeedsFromServices(services: VerifiedProviderService[] = []): string[] {
  const needs = new Set<string>()

  services.forEach((service) => {
    const category = String(service.category || "").trim()
    const serviceName = String(service.name || "")
    const lcName = serviceName.toLowerCase()

    if (category) needs.add(category)
    if (category === "disability_support") needs.add("ndis")

    if (lcName.includes("occupational")) needs.add("occupational_therapy")
    if (lcName.includes("speech")) needs.add("speech_pathology")
    if (lcName.includes("physio")) needs.add("physiotherapy")
    if (lcName.includes("diet")) needs.add("dietitian")
    if (lcName.includes("podiat")) needs.add("podiatry")
    if (lcName.includes("behaviour")) needs.add("behaviour_support")
    if (lcName.includes("therapy")) needs.add("therapy_supports")
    if (lcName.includes("nursing")) needs.add("nursing_support")
    if (lcName.includes("assistive")) needs.add("assistive_technology")
    if (lcName.includes("assessment")) needs.add("assessment")
    if (lcName.includes("residential")) needs.add("residential_care")
    if (lcName.includes("home care") || lcName.includes("home support") || lcName.includes("support at home")) {
      needs.add("home_support")
    }
    if (lcName.includes("personal care")) needs.add("personal_care")
    if (lcName.includes("respite")) {
      needs.add("respite")
      needs.add("carer_support")
    }
    if (lcName.includes("carer")) needs.add("carer_support")
    if (lcName.includes("daily activit") || lcName.includes("daily life")) {
      needs.add("daily_living_support")
    }
    if (lcName.includes("supported independent living") || /\bsil\b/i.test(serviceName)) {
      needs.add("supported_independent_living")
      needs.add("home_support")
    }
  })

  return Array.from(needs)
}

function providerNeeds(record: VerifiedProviderRecord) {
  const explicitNeeds = Array.isArray(record.needs)
    ? record.needs.map((need) => normalizeNeed(String(need))).filter(Boolean)
    : []

  if (explicitNeeds.length > 0) {
    return new Set(explicitNeeds)
  }

  return new Set(deriveNeedsFromServices(record.services).map(normalizeNeed).filter(Boolean))
}

function recordToProvider(
  record: VerifiedProviderRecord,
  matchedServices: string[],
  matchedNeeds: string[],
  distanceKm: number,
): Provider {
  const query = `${record.name} ${record.address} ${record.suburb ?? ""} ${record.postcode ?? ""}`.trim()
  const lat = Number(record.lat)
  const lon = Number(record.lon)

  return {
    id: record.id,
    name: record.name,
    address: record.address,
    lat,
    lon,
    category: record.type,
    matched_services: matchedServices,
    matched_needs: matchedNeeds,
    distance_km: Math.round(distanceKm * 10) / 10,
    google_maps_url:
      "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query),
    osm_url: "https://www.openstreetmap.org/search?q=" + encodeURIComponent(query),
    phone: record.phone,
    website: record.website,
    bulk_billing: record.bulk_billing,
    telehealth: record.telehealth_available,
    data_source: "verified",
    verified_provider: true,
    collection_date: record.collection_date,
    abn: record.abn,
  }
}

export async function searchVerifiedProviders(
  lat: number,
  lon: number,
  selectedServices: Service[],
  radiusKm = 15,
): Promise<Provider[]> {
  const records = loadVerifiedRecords()
  if (records.length === 0) {
    return []
  }

  const requestedNeeds = selectedServicesToRequestedNeeds(selectedServices)
  if (requestedNeeds.size === 0) {
    return []
  }

  const isAgedCareSearch = selectedServices.some(
    (service) => service.category?.trim() === "Aged Care & Support",
  )

  const providers = records
    .map((record) => {
      const normalizedRequestedNeeds = new Set(
        Array.from(requestedNeeds).map((need) => normalizeNeed(need)).filter(Boolean),
      )

      const currentProviderNeeds = providerNeeds(record)
      let matchedNeeds = Array.from(normalizedRequestedNeeds).filter((need) =>
        currentProviderNeeds.has(need),
      )

      if (isAgedCareSearch) {
        const providerHasAgedCare =
          currentProviderNeeds.has("aged_care") ||
          (record.services ?? []).some((service) => service.category === "aged_care")

        if (!providerHasAgedCare) {
          return null
        }

        if (matchedNeeds.length === 0) {
          const requestedAgedSubNeeds = Array.from(normalizedRequestedNeeds).filter((need) =>
            AGED_CARE_SUB_NEEDS.has(need),
          )
          if (requestedAgedSubNeeds.length > 0) {
            matchedNeeds = ["aged_care"]
          }
        }
      }

      if (matchedNeeds.length === 0) return null

      const matchedServiceNames = selectedServices
        .filter((service) => {
          const specificNeeds = normalizedSpecificNeedsForService(service)
          if (specificNeeds.length > 0) {
            return specificNeeds.some((need) => currentProviderNeeds.has(need))
          }

          const primaryNeed = normalizeNeed(String(service.needs?.[0] ?? ""))
          if (primaryNeed && currentProviderNeeds.has(primaryNeed)) return true

          const category = service.category?.trim()
          const mappedCategory = category ? CATEGORY_LABEL_TO_CODE[category] : ""
          return mappedCategory ? currentProviderNeeds.has(mappedCategory) : false
        })
        .map((service) => service.name)
      if (matchedServiceNames.length === 0) return null

      const providerLat = Number(record.lat)
      const providerLon = Number(record.lon)
      if (!Number.isFinite(providerLat) || !Number.isFinite(providerLon)) return null

      const distanceKm = calculateDistanceKm(lat, lon, providerLat, providerLon)
      if (distanceKm > radiusKm) return null

      return recordToProvider(record, matchedServiceNames, matchedNeeds, distanceKm)
    })
    .filter((provider): provider is Provider => Boolean(provider))
    .sort((left, right) => left.distance_km - right.distance_km)

  return providers
}

export function getVerifiedProviderById(id: string): Provider | null {
  const records = loadVerifiedRecords()
  const match = records.find((record) => record.id === id)
  if (!match || !Number.isFinite(Number(match.lat)) || !Number.isFinite(Number(match.lon))) {
    return null
  }

  return recordToProvider(
    match,
    Array.from(new Set((match.services ?? []).map((service) => service.name).filter(Boolean))),
    Array.from(providerNeeds(match)),
    0,
  )
}

export function reloadVerifiedProviders() {
  cachedRecords = null
  lastLoadTime = 0
  loadVerifiedRecords()
}

export function getVerifiedProviderStats(): {
  total: number
  byType: Record<string, number>
  bySuburb: Record<string, number>
  byCategory: Record<string, number>
} {
  const records = loadVerifiedRecords()

  const stats = {
    total: records.length,
    byType: {} as Record<string, number>,
    bySuburb: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
  }

  records.forEach((record) => {
    stats.byType[record.type] = (stats.byType[record.type] ?? 0) + 1
    const suburb = record.suburb ?? "Unknown"
    stats.bySuburb[suburb] = (stats.bySuburb[suburb] ?? 0) + 1
    ;(record.services ?? []).forEach((service) => {
      stats.byCategory[service.category] = (stats.byCategory[service.category] ?? 0) + 1
    })
  })

  return stats
}
