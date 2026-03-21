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

const KNOWN_CODES = new Set(Object.values(CATEGORY_LABEL_TO_CODE))

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

function selectedServicesToCategoryCodes(selectedServices: Service[]) {
  const requested = new Set<string>()

  selectedServices.forEach((service) => {
    const category = service.category?.trim()
    if (category && CATEGORY_LABEL_TO_CODE[category]) {
      requested.add(CATEGORY_LABEL_TO_CODE[category])
    }

    if (category && KNOWN_CODES.has(category)) {
      requested.add(category)
    }

    service.needs.forEach((need) => {
      if (KNOWN_CODES.has(need)) {
        requested.add(need)
      }
    })
  })

  return requested
}

function recordToProvider(record: VerifiedProviderRecord, matchedServices: string[], distanceKm: number): Provider {
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

  const requestedCategories = selectedServicesToCategoryCodes(selectedServices)
  if (requestedCategories.size === 0) {
    return []
  }

  const providers = records
    .map((record) => {
      const providerCategories = Array.from(
        new Set((record.services ?? []).map((service) => service.category).filter(Boolean)),
      )
      const matched = providerCategories.filter((code) => requestedCategories.has(code))
      if (matched.length === 0) return null

      const providerLat = Number(record.lat)
      const providerLon = Number(record.lon)
      if (!Number.isFinite(providerLat) || !Number.isFinite(providerLon)) return null

      const distanceKm = calculateDistanceKm(lat, lon, providerLat, providerLon)
      if (distanceKm > radiusKm) return null

      return recordToProvider(record, matched, distanceKm)
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
    Array.from(new Set((match.services ?? []).map((service) => service.category).filter(Boolean))),
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
