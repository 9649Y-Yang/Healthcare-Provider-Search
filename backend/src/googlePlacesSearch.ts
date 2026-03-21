import type { Provider, Service } from "./types"

type LatLng = {
  lat: number
  lon: number
}

type GooglePlacesSearchResponse = {
  places?: GooglePlace[]
}

type GooglePlace = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  nationalPhoneNumber?: string
  websiteUri?: string
  businessStatus?: string
  rating?: number
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }
}

type GoogleSearchPlan = {
  includedTypes: string[]
  textQueries: string[]
}

const GOOGLE_PLACES_BASE_URL =
  process.env.GOOGLE_PLACES_BASE_URL ?? "https://places.googleapis.com/v1"

const DEFAULT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.businessStatus",
  "places.rating",
  "places.currentOpeningHours",
].join(",")

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function buildHoursSummary(place: GooglePlace): string | undefined {
  const days = place.currentOpeningHours?.weekdayDescriptions
  if (days && days.length > 0) {
    return days.slice(0, 2).join("; ")
  }
  return place.currentOpeningHours?.openNow === true
    ? "Open now"
    : place.currentOpeningHours?.openNow === false
      ? "Closed now"
      : undefined
}

function serviceToGooglePlan(service: Service): GoogleSearchPlan {
  const category = service.category ?? ""
  const lowerNeeds = new Set(service.needs.map((need) => need.toLowerCase()))
  const textQueries = [...(service.provider_queries ?? []), service.name]

  if (category === "Primary Care & General Practice") {
    return { includedTypes: ["doctor", "medical_clinic"], textQueries }
  }

  if (category === "Urgent & Emergency Care") {
    return {
      includedTypes: ["hospital", "medical_clinic", "pharmacy"],
      textQueries,
    }
  }

  if (category === "Community & Allied Health Services") {
    const includedTypes = lowerNeeds.has("physiotherapy")
      ? ["physiotherapist"]
      : ["medical_clinic"]
    return { includedTypes, textQueries }
  }

  if (category === "Mental Health & Wellbeing") {
    return { includedTypes: ["psychologist", "medical_clinic"], textQueries }
  }

  if (category === "Alcohol & Drug Services") {
    return { includedTypes: ["medical_clinic"], textQueries }
  }

  if (category === "Women's & Reproductive Health Services") {
    return { includedTypes: ["medical_clinic"], textQueries }
  }

  if (category === "Men's Health Services") {
    return { includedTypes: ["medical_clinic"], textQueries }
  }

  if (category === "Sexual Health Services") {
    return { includedTypes: ["medical_clinic"], textQueries }
  }

  if (category === "Aboriginal & Culturally Safe Services") {
    return { includedTypes: ["medical_clinic"], textQueries }
  }

  if (category === "Aged Care & Support") {
    return { includedTypes: ["hospital"], textQueries }
  }

  if (category === "Disability Support & NDIS") {
    return { includedTypes: [], textQueries }
  }

  return { includedTypes: ["medical_clinic"], textQueries }
}

function toGoogleMapsUrl(lat: number, lon: number) {
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(`${lat},${lon}`)
  )
}

function placeToProvider(
  place: GooglePlace,
  matchedServices: string[],
  distanceKm: number,
): Provider | null {
  const lat = Number(place.location?.latitude)
  const lon = Number(place.location?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return {
    id: place.id ?? `${lat}-${lon}`,
    name: place.displayName?.text ?? "Google Places Result",
    address: place.formattedAddress ?? "",
    lat,
    lon,
    category: "Healthcare Service",
    matched_services: [...matchedServices],
    distance_km: distanceKm,
    google_maps_url: toGoogleMapsUrl(lat, lon),
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    rating: typeof place.rating === "number" ? place.rating : undefined,
    business_status: place.businessStatus,
    hours_summary: buildHoursSummary(place),
    data_source: "google",
  }
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
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

async function searchNearby(
  apiKey: string,
  center: LatLng,
  radiusKm: number,
  includedTypes: string[],
) {
  if (includedTypes.length === 0) return []

  const response = await fetch(`${GOOGLE_PLACES_BASE_URL}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": DEFAULT_FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      regionCode: "AU",
      locationRestriction: {
        circle: {
          center: {
            latitude: center.lat,
            longitude: center.lon,
          },
          radius: Math.min(Math.max(radiusKm * 1000, 500), 50000),
        },
      },
    }),
  })

  if (!response.ok) return []
  const payload = (await response.json()) as GooglePlacesSearchResponse
  return payload.places ?? []
}

async function searchText(
  apiKey: string,
  center: LatLng,
  radiusKm: number,
  query: string,
  postcode: string,
) {
  const response = await fetch(`${GOOGLE_PLACES_BASE_URL}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": DEFAULT_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: `${query} ${postcode} Victoria Australia`,
      maxResultCount: 10,
      rankPreference: "DISTANCE",
      regionCode: "AU",
      locationBias: {
        circle: {
          center: {
            latitude: center.lat,
            longitude: center.lon,
          },
          radius: Math.min(Math.max(radiusKm * 1000, 500), 50000),
        },
      },
    }),
  })

  if (!response.ok) return []
  const payload = (await response.json()) as GooglePlacesSearchResponse
  return payload.places ?? []
}

export async function searchGooglePlaces(
  postcode: string,
  selectedServices: Service[],
  radiusKm: number,
  center: LatLng,
): Promise<Provider[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY environment variable is not set")

  const deduped = new Map<string, Provider>()
  let isFirst = true

  for (const service of selectedServices) {
    if (!isFirst) await sleep(250)
    isFirst = false

    const plan = serviceToGooglePlan(service)
    const nearbyResults = await searchNearby(apiKey, center, radiusKm, plan.includedTypes).catch(
      () => [],
    )

    const textResults =
      nearbyResults.length >= 8
        ? []
        : await searchText(
            apiKey,
            center,
            radiusKm,
            plan.textQueries[0] ?? service.name,
            postcode,
          ).catch(() => [])

    for (const place of [...nearbyResults, ...textResults]) {
      const lat = Number(place.location?.latitude)
      const lon = Number(place.location?.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

      const distanceKm = haversineDistanceKm(center.lat, center.lon, lat, lon)
      if (distanceKm > radiusKm) continue

      const provider = placeToProvider(place, [service.name], distanceKm)
      if (!provider) continue

      const key = provider.id
      const existing = deduped.get(key)
      if (!existing) {
        deduped.set(key, provider)
        continue
      }

      existing.matched_services = Array.from(
        new Set([...existing.matched_services, service.name]),
      )
      if (!existing.phone && provider.phone) existing.phone = provider.phone
      if (!existing.website && provider.website) existing.website = provider.website
      if (!existing.hours_summary && provider.hours_summary) {
        existing.hours_summary = provider.hours_summary
      }
      if (!existing.rating && provider.rating) existing.rating = provider.rating
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => left.distance_km - right.distance_km)
    .slice(0, 40)
}