import fs from "node:fs"
import path from "node:path"
import type { Provider } from "./types"

type CuratedNdisProvider = {
  name: string
  postcode: string
  address: string
  suburb?: string
  service_type: string
  service_types?: string[]
  phone?: string
  email?: string
  website?: string
  lat?: number
  lon?: number
  ndia_registered?: boolean
  last_updated?: string
}

const CURATED_NDIS_FILE = path.join(process.cwd(), "data", "ndis_providers_curated.json")
let ndisProvidersCache: CuratedNdisProvider[] | null = null
let cacheTimestamp: number | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Load curated NDIS providers from JSON file with in-memory caching.
 * Falls back to empty array if file doesn't exist.
 */
export function loadCuratedNdisProviders(): CuratedNdisProvider[] {
  const now = Date.now()

  // Return cached data if still fresh
  if (
    ndisProvidersCache &&
    cacheTimestamp &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return ndisProvidersCache
  }

  try {
    if (!fs.existsSync(CURATED_NDIS_FILE)) {
      console.warn(
        `[NDIS] Curated NDIS file not found at ${CURATED_NDIS_FILE}. NDIS providers will not be available.`,
      )
      ndisProvidersCache = []
      cacheTimestamp = now
      return []
    }

    const content = fs.readFileSync(CURATED_NDIS_FILE, "utf-8")
    ndisProvidersCache = JSON.parse(content) as CuratedNdisProvider[]
    cacheTimestamp = now

    console.log(
      `[NDIS] Loaded ${ndisProvidersCache.length} curated NDIS providers into cache.`,
    )
    return ndisProvidersCache
  } catch (err) {
    console.error(
      `[NDIS] Error loading curated NDIS providers: ${err instanceof Error ? err.message : String(err)}`,
    )
    ndisProvidersCache = []
    cacheTimestamp = now
    return []
  }
}

/**
 * Convert curated NDIS provider to standard Provider type for uniformity.
 */
function mapToProvider(ndisProvider: CuratedNdisProvider, index: number): Provider {
  const lat = ndisProvider.lat || -37.8136
  const lon = ndisProvider.lon || 144.9631
  const googleMapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(ndisProvider.name)}/@${lat},${lon},15z`

  return {
    id: `ndis_${ndisProvider.postcode}_${index}`,
    name: ndisProvider.name,
    address: ndisProvider.address,
    lat,
    lon,
    category: "Disability Support & NDIS",
    matched_services: ["ndis", "disability_support"],
    matched_needs: ndisProvider.service_types || [ndisProvider.service_type],
    distance_km: 0,
    google_maps_url: googleMapsUrl,
    phone: ndisProvider.phone,
    website: ndisProvider.website,
    bulk_billing: false,
    telehealth: false,
    collection_date: ndisProvider.last_updated || new Date().toISOString(),
    abn: "",
    data_source: "verified",
    verified_provider: true,
  }
}

/**
 * Filter curated NDIS providers by postcode range and distance.
 */
export function filterNdisByLocation(
  latitude: number,
  longitude: number,
  radiusKm: number = 15,
): Provider[] {
  const ndisProviders = loadCuratedNdisProviders()

  function haversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (value: number) => (value * Math.PI) / 180
    const earthRadiusKm = 6371
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return earthRadiusKm * c
  }

  return ndisProviders
    .filter((ndis) => {
      if (!ndis.lat || !ndis.lon) return false
      const distance = haversineDistanceKm(latitude, longitude, ndis.lat, ndis.lon)
      return distance <= radiusKm
    })
    .map((ndis, index) => mapToProvider(ndis, index))
}

/**
 * Check if a service ID map includes NDIS/disability-related services.
 */
export function isNdisRelatedSearch(serviceIds: number[], services: any[]): boolean {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) return false

  const selectedServices = services.filter((s: any) => serviceIds.includes(s.id))
  const disabilityKeywords = [
    "ndis",
    "disability",
    "disability support",
    "behaviour",
    "behavior",
    "assistive",
    "supported independent living",
  ]

  return selectedServices.some((service: any) => {
    const desc = (service.description || "").toLowerCase()
    const category = (service.category || "").toLowerCase()
    const needs = (service.needs || []).map((n: string) => n.toLowerCase())

    return (
      disabilityKeywords.some((kw) => desc.includes(kw) || category.includes(kw)) ||
      needs.some((need: string) =>
        disabilityKeywords.some((kw) => need.includes(kw)),
      )
    )
  })
}

/**
 * Prioritize curated NDIS providers in search results when NDIS services are selected.
 */
export function priorizeNdisProviders(
  allProviders: Provider[],
  ndisRelated: boolean,
): Provider[] {
  if (!ndisRelated || allProviders.length === 0) {
    return allProviders
  }

  const ndisProviders = allProviders.filter(
    (p) => p.data_source === "verified" && p.verified_provider,
  )
  const otherProviders = allProviders.filter(
    (p) => p.data_source !== "verified" || !p.verified_provider,
  )

  // Return NDIS providers first, then others
  return [...ndisProviders, ...otherProviders]
}

export function getCuratedNdisStatus() {
  const providers = loadCuratedNdisProviders()
  const postcodes = new Set(providers.map((p) => p.postcode).filter(Boolean))
  const serviceTypes = new Set(
    providers
      .flatMap((p) => p.service_types ?? [p.service_type])
      .filter((value): value is string => Boolean(value)),
  )
  const lastUpdated = providers
    .map((p) => p.last_updated)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  return {
    available: providers.length > 0,
    providerCount: providers.length,
    postcodeCount: postcodes.size,
    serviceTypeCount: serviceTypes.size,
    lastUpdated: lastUpdated ?? null,
    sourceFile: CURATED_NDIS_FILE,
  }
}
