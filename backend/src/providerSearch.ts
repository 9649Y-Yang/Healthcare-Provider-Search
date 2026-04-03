import type { Provider, ProviderSearchResult, Service } from "./types"
import { searchGooglePlaces } from "./googlePlacesSearch"
import { searchNHSD } from "./nhsdSearch"
import { buildOfficialPathways, buildSourceSequence } from "./providerRouting"
import { searchVerifiedProviders } from "./verifiedProvidersSearch"
import {
  filterNdisByLocation,
  isNdisRelatedSearch,
  priorizeNdisProviders,
} from "./ndisProvidersSearch"

// Provider type is defined in ./types and re-exported here for consumers
export type { Provider } from "./types"

type PostcodeLocation = {
  lat: number
  lon: number
  displayName: string
  radiusKm?: number
  googleMapsUrl?: string
}

const USER_AGENT =
  "HealthcareProviderSearchBot/1.0 (local dev; contact: local@localhost)"
const locationCache = new Map<string, PostcodeLocation>()
const searchCache = new Map<string, Array<Record<string, unknown>>>()
const PROVIDER_NAME_KEYWORDS = [
  "medical",
  "health",
  "clinic",
  "hospital",
  "gp",
  "general practice",
  "urgent care",
  "headspace",
  "mental health",
  "psychology",
  "psychiatry",
  "physio",
  "physiotherapy",
  "aboriginal health",
  "disability",
  "ndis",
  "therapy",
  "community health",
  "home care",
  "aged care",
  "nursing",
  "care services",
  "family planning",
  "women's health",
  "mens health",
  "urology",
  "sexual health",
]
const EXCLUDED_PROVIDER_KEYWORDS = [
  "cafe",
  "café",
  "restaurant",
  "bar",
  "pub",
  "coffee",
  "pizza",
  "burger",
  "bakery",
  "supermarket",
  "parking",
  "car park",
  "court",
  "courthouse",
  "school",
  "college",
  "university",
  "hotel",
  "motel",
  "apartments",
]
const ALLOWED_PROVIDER_TYPES = new Set([
  "clinic",
  "doctors",
  "doctor",
  "hospital",
  "healthcare",
  "physiotherapist",
  "psychotherapist",
  "psychologist",
  "social_facility",
  "nursing_home",
  "yes",
  "government",
])

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function includesAnyKeyword(text: string, keywords: string[]) {
  const normalized = text.toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword))
}

function isLikelyHealthcareProvider(item: Record<string, unknown>, query: string) {
  const displayName = String(item.display_name ?? "")
  const typeText = String(item.type ?? "")
  const queryText = query.toLowerCase()
  const combined = `${displayName} ${typeText}`.toLowerCase()

  if (includesAnyKeyword(combined, EXCLUDED_PROVIDER_KEYWORDS)) {
    return false
  }

  if (ALLOWED_PROVIDER_TYPES.has(typeText.toLowerCase())) {
    return true
  }

  if (includesAnyKeyword(combined, PROVIDER_NAME_KEYWORDS)) {
    return true
  }

  if (queryText.includes("aged care")) {
    return (
      includesAnyKeyword(combined, ["aged care", "home care", "nursing", "care services", "care provider"]) &&
      !includesAnyKeyword(combined, EXCLUDED_PROVIDER_KEYWORDS)
    )
  }

  return false
}

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
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

async function geocodeLocation(query: string): Promise<PostcodeLocation> {
  const cacheKey = query.toLowerCase()
  const cached = locationCache.get(cacheKey)
  if (cached) return cached

  const isPostcode = /^\d{4}$/.test(query)
  const nominatimQuery = isPostcode
    ? `${query} Victoria Australia`
    : `${query}, Victoria, Australia`

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&email=local@localhost&q=" +
    encodeURIComponent(nominatimQuery)

  let result: PostcodeLocation | null = null

  try {
    let response: Response | null = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      })

      if (response.ok) break
      if (response.status !== 429 || attempt === 3) {
        throw new Error(`Location lookup failed with HTTP ${response.status}`)
      }
      await sleep(1200 * attempt)
    }

    if (!response || !response.ok) {
      throw new Error("Location lookup failed")
    }

    const payload = (await response.json()) as Array<Record<string, unknown>>
    const first = payload[0]
    if (!first) {
      if (isPostcode) {
        throw new Error("No location found for that Victorian postcode")
      } else {
        throw new Error("No location found for that address")
      }
    }

    result = {
      lat: Number(first.lat),
      lon: Number(first.lon),
      displayName: String(first.display_name ?? query),
      googleMapsUrl:
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(nominatimQuery),
    }
  } catch {
    if (isPostcode) {
      const fallbackResponse = await fetch(`https://api.zippopotam.us/AU/${query}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      })

      if (!fallbackResponse.ok) {
        throw new Error(`Postcode lookup failed with HTTP ${fallbackResponse.status}`)
      }

      const fallbackPayload = (await fallbackResponse.json()) as {
        country?: string
        places?: Array<Record<string, string>>
      }
      const place = fallbackPayload.places?.[0]
      if (!place) {
        throw new Error("No location found for that Victorian postcode")
      }

      result = {
        lat: Number(place.latitude),
        lon: Number(place.longitude),
        displayName: `${query}, ${place["place name"] ?? "Victoria"}, ${place.state ?? "Victoria"}, ${fallbackPayload.country ?? "Australia"}`,
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(`${query} Victoria Australia`),
      }
    } else {
      throw new Error("Failed to geocode address. Please try a different address format.")
    }
  }

  if (!result) {
    throw new Error("No location found for that search query")
  }

  locationCache.set(cacheKey, result)
  return result
}

async function searchNominatim(query: string) {
  const cached = searchCache.get(query)
  if (cached) return cached

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=au&email=local@localhost&q=" +
    encodeURIComponent(query)

  let response: Response | null = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    })

    if (response.ok) break
    if (response.status !== 429 || attempt === 2) {
      throw new Error(`Provider search failed with HTTP ${response.status}`)
    }
    await sleep(900 * attempt)
  }

  if (!response || !response.ok) {
    return []
  }

  const result = (await response.json()) as Array<Record<string, unknown>>
  searchCache.set(query, result)
  return result
}

async function searchPhoton(query: string) {
  const cacheKey = `photon:${query}`
  const cached = searchCache.get(cacheKey)
  if (cached) return cached

  const url =
    "https://photon.komoot.io/api/?limit=8&q=" + encodeURIComponent(query)

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  })

  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as {
    features?: Array<Record<string, unknown>>
  }

  const result = (payload.features ?? []).map((feature) => {
    const geometry = feature.geometry as { coordinates?: [number, number] } | undefined
    const properties = feature.properties as Record<string, unknown> | undefined
    const lon = geometry?.coordinates?.[0]
    const lat = geometry?.coordinates?.[1]
    const name = String(properties?.name ?? query)
    const street = String(properties?.street ?? "")
    const city = String(properties?.city ?? properties?.district ?? "")
    const state = String(properties?.state ?? "Victoria")
    const postcode = String(properties?.postcode ?? "")

    return {
      lat,
      lon,
      display_name: [name, street, city, state, postcode, "Australia"]
        .filter((part) => part && part !== "undefined")
        .join(", "),
      type: String(properties?.type ?? properties?.osm_value ?? query),
    }
  }) as Array<Record<string, unknown>>

  searchCache.set(cacheKey, result)
  return result
}

async function searchNominatimVariants(query: string, postcode: string, centerLabel: string) {
  const variants = [
    `${query} ${postcode} Victoria Australia`,
    `${query} ${centerLabel}`,
    `${query} Melbourne Victoria Australia`,
  ]

  const combined: Array<Record<string, unknown>> = []
  for (const variant of variants) {
    let results: Array<Record<string, unknown>> = []
    try {
      results = await searchNominatim(variant)
    } catch {
      results = []
    }
    combined.push(...results)
    if (combined.length >= 8) break
  }

  if (combined.length === 0) {
    for (const variant of variants) {
      const results = await searchPhoton(variant)
      combined.push(...results)
      if (combined.length >= 8) break
    }
  }

  return combined
}

async function searchOsmProviders(
  postcode: string,
  selectedServices: Service[],
  radiusKm: number,
  center: PostcodeLocation,
): Promise<Provider[]> {
  const queryToServices = new Map<string, string[]>()

  selectedServices.forEach((service) => {
    const queries =
      service.provider_queries && service.provider_queries.length > 0
        ? service.provider_queries
        : [service.name]

    queries.slice(0, 2).forEach((query) => {
      const existing = queryToServices.get(query) ?? []
      existing.push(service.name)
      queryToServices.set(query, existing)
    })
  })

  const deduped = new Map<string, Provider>()

  for (const [query, matchedServices] of queryToServices.entries()) {
    const results = await searchNominatimVariants(query, postcode, center.displayName)
    results.forEach((item, index) => {
      if (!isLikelyHealthcareProvider(item, query)) return

      const lat = Number(item.lat)
      const lon = Number(item.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return

      const displayName = String(item.display_name ?? query)
      const name = displayName.split(",")[0]?.trim() || query
      const osmType = typeof item.osm_type === "string" ? item.osm_type : undefined
      const osmId = item.osm_id
      const osmUrl =
        osmType && osmId
          ? `https://www.openstreetmap.org/${osmType}/${String(osmId)}`
          : undefined
      const googleMapsUrl =
        "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(`${lat},${lon}`)
      const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lon.toFixed(4)}`
      const distance_km = haversineDistanceKm(center.lat, center.lon, lat, lon)
      if (distance_km > radiusKm) return

      if (!deduped.has(key)) {
        deduped.set(key, {
          id: `${query}-${index}-${lat}-${lon}`,
          name,
          address: displayName,
          lat,
          lon,
          category: String(item.type ?? query),
          matched_services: [...matchedServices],
          distance_km,
          google_maps_url: googleMapsUrl,
          osm_url: osmUrl,
          data_source: "osm",
        })
        return
      }

      const existing = deduped.get(key)
      if (!existing) return
      existing.matched_services = Array.from(
        new Set([...existing.matched_services, ...matchedServices]),
      )
      existing.distance_km = Math.min(existing.distance_km, distance_km)
    })
  }

  return Array.from(deduped.values())
    .sort((left, right) => left.distance_km - right.distance_km)
    .slice(0, 40)
}

export async function findNearbyProviders(
  searchQuery: string,
  selectedServices: Service[],
  radiusKm = 15,
): Promise<ProviderSearchResult> {
  const center = await geocodeLocation(searchQuery)
  center.radiusKm = radiusKm

  const official_pathways = buildOfficialPathways(searchQuery, selectedServices)
  const source_sequence = buildSourceSequence(selectedServices)

  // Check if this is NDIS-related and prioritize curated providers
  const isNdis = isNdisRelatedSearch(
    selectedServices.map((s) => s.id),
    selectedServices,
  )

  // If NDIS-related, fetch curated NDIS providers immediately
  if (isNdis) {
    const ndisProviders = filterNdisByLocation(center.lat, center.lon, radiusKm)
    if (ndisProviders.length > 0) {
      return { center, providers: ndisProviders, official_pathways, source_sequence }
    }
  }

  for (const source of source_sequence) {
    try {
      if (source === "verified") {
        const providers = await searchVerifiedProviders(
          center.lat,
          center.lon,
          selectedServices,
          radiusKm,
        )
        if (providers.length > 0) {
          // If NDIS-related, augment verified results with NDIS providers
          if (isNdis) {
            const ndisProviders = filterNdisByLocation(center.lat, center.lon, radiusKm)
            const combined = priorizeNdisProviders(
              [...ndisProviders, ...providers],
              true,
            )
            return { center, providers: combined, official_pathways, source_sequence }
          }
          return { center, providers, official_pathways, source_sequence }
        }
      }

      if (source === "nhsd" && process.env.NHSD_API_KEY) {
        const providers = await searchNHSD(
          searchQuery,
          selectedServices,
          radiusKm,
          center.lat,
          center.lon,
        )
        if (providers.length > 0) {
          return { center, providers, official_pathways, source_sequence }
        }
      }

      if (source === "google" && process.env.GOOGLE_PLACES_API_KEY) {
        const providers = await searchGooglePlaces(searchQuery, selectedServices, radiusKm, {
          lat: center.lat,
          lon: center.lon,
        })
        if (providers.length > 0) {
          return { center, providers, official_pathways, source_sequence }
        }
      }

      if (source === "osm") {
        const providers = await searchOsmProviders(searchQuery, selectedServices, radiusKm, center)
        return { center, providers, official_pathways, source_sequence }
      }
    } catch {
      // Continue to the next fallback source.
    }
  }

  return {
    center,
    providers: [],
    official_pathways,
    source_sequence,
  }
}