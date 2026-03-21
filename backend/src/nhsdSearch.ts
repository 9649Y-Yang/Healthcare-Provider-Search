/**
 * NHSD (National Health Services Directory) provider search.
 *
 * Official API docs: https://developers.nhsd.healthdirect.org.au/docs/consumer-api/index.html
 *
 * Authentication: Set the NHSD_API_KEY environment variable to your issued API key.
 * To apply for access: https://healthdirect-serviceline.atlassian.net/servicedesk/
 *
 * Base URL is configurable via NHSD_BASE_URL (defaults to production).
 * For the integration/testing environment use: https://api.int.nhsd.healthdirect.org.au
 */

import type { Provider, Service } from "./types"

// ── NHSD API response types ───────────────────────────────────────────────────

type NHSDContact = {
  value: string
  valueType: { idRef: string; label: string }
  priority?: number
  purpose?: { idRef: string; label: string }
  contactPerson?: string
}

type NHSDOpenRule = {
  pattern: string
  days: string[]
  openFrom: string
  openTo: string
  referenceDate?: string
}

type NHSDCalendar = {
  openRule?: NHSDOpenRule[]
  closedRule?: unknown[]
  timezone?: string
  alwaysOpen?: boolean
}

type NHSDPhysicalLocation = {
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  postcode?: string
  suburb?: { idRef?: string; label: string; postcode?: string }
  state?: { idRef?: string; label: string }
  country?: { idRef?: string; label: string }
  geocode?: { latitude: string; longitude: string }
}

type NHSDServiceItem = {
  id: string
  displayName?: string
  name: string
  description?: string
  serviceType?: Array<{ idRef: string; label: string }>
  contacts?: NHSDContact[]
  calendar?: NHSDCalendar
  organisation?: { id: string; name: string }
  location?: {
    id?: string
    deliveryMethod?: string
    physicalLocation?: NHSDPhysicalLocation
  }
  billingOptions?: Array<{ valueType: { idRef: string; label?: string }; value?: string }>
  offerings?: Array<{ valueType: { idRef: string; label?: string }; value?: string }>
  coverageLocationIndicator?: boolean
}

type NHSDSearchResponse = {
  count?: number
  offset?: number
  limit?: number
  _embedded?: {
    healthcareServicesSearchMeta?: Record<string, { geoDistanceInMeters?: number }>
    healthcareServices?: NHSDServiceItem[]
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NHSD_BASE_URL = process.env.NHSD_BASE_URL ?? "https://api.nhsd.healthdirect.org.au"

const DAY_ABBREV: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function extractContact(
  contacts: NHSDContact[] | undefined,
  type: "phone" | "website" | "email",
): string | undefined {
  return contacts?.find((c) => c.valueType?.idRef?.endsWith(`/contactType/${type}`))?.value
}

/**
 * Convert an NHSD calendar into a short human-readable hours string.
 * e.g. "Mon–Fri: 08:30–17:30; Sat: 09:00–13:00"
 */
function buildHoursSummary(calendar: NHSDCalendar | undefined): string | undefined {
  if (!calendar) return undefined
  if (calendar.alwaysOpen) return "Open 24/7"
  const rules = calendar.openRule
  if (!rules?.length) return undefined

  return rules
    .slice(0, 2) // show at most two rules (e.g. weekday + Saturday)
    .map((rule) => {
      const dayLabels = rule.days.map((d) => DAY_ABBREV[d] ?? d)

      // Compress consecutive days: ["Mon","Tue","Wed","Thu","Fri"] → "Mon–Fri"
      const dayKeys = Object.keys(DAY_ABBREV)
      const compressed = dayLabels.reduce<string[]>((acc, day, i, arr) => {
        if (i === 0) return [day]
        const prevIdx = dayKeys.findIndex((k) => DAY_ABBREV[k] === arr[i - 1])
        const currIdx = dayKeys.findIndex((k) => DAY_ABBREV[k] === day)
        if (currIdx - prevIdx === 1) {
          const last = acc[acc.length - 1]
          const updated = last.includes("–")
            ? last.replace(/–\S+$/, `–${day}`)
            : `${last}–${day}`
          return [...acc.slice(0, -1), updated]
        }
        return [...acc, day]
      }, [])

      const from = rule.openFrom?.slice(0, 5) ?? ""
      const to = rule.openTo?.slice(0, 5) ?? ""
      return `${compressed.join(", ")}: ${from}–${to}`
    })
    .join("; ")
}

/**
 * Map a raw NHSD service item into our unified Provider shape.
 * Returns null if the item has no valid geocode.
 */
function nhsdItemToProvider(
  item: NHSDServiceItem,
  matchedServices: string[],
  centerLat: number,
  centerLon: number,
  distanceMeters?: number,
): Provider | null {
  const geocode = item.location?.physicalLocation?.geocode
  const lat = Number(geocode?.latitude)
  const lon = Number(geocode?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null

  const phys = item.location?.physicalLocation
  const address = [
    phys?.addressLine1,
    phys?.addressLine2,
    phys?.addressLine3,
    phys?.suburb?.label,
    phys?.state?.label,
    phys?.postcode,
  ]
    .filter(Boolean)
    .join(", ")

  const distance_km =
    distanceMeters != null ? distanceMeters / 1000 : haversineKm(centerLat, centerLon, lat, lon)

  const bulk_billing =
    item.billingOptions?.some((b) => b.valueType?.idRef?.toLowerCase().includes("bulkbilling")) ??
    false

  const telehealth =
    item.offerings?.some((o) =>
      o.valueType?.idRef?.toLowerCase().includes("telehealthavailable"),
    ) ?? false

  return {
    id: item.id,
    name: item.displayName ?? item.name,
    address,
    lat,
    lon,
    category: item.serviceType?.[0]?.label ?? "Healthcare Service",
    matched_services: [...matchedServices],
    distance_km,
    google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`,
    phone: extractContact(item.contacts, "phone"),
    website: extractContact(item.contacts, "website"),
    bulk_billing,
    telehealth,
    hours_summary: buildHoursSummary(item.calendar),
    data_source: "nhsd",
    nhsd_healthdirect_url: `https://www.healthdirect.gov.au/australian-health-services/health-service/${item.id}`,
  }
}

// ── Main NHSD search ──────────────────────────────────────────────────────────

/**
 * Search the National Health Services Directory for providers near a postcode.
 *
 * One NHSD query is made per selected service type (using the service's first
 * provider_query as a keyword).  Results are deduplicated by NHSD service ID
 * and capped at 40, sorted by distance.
 *
 * If a service has `nhsd_service_type_codes` populated, those SNOMED CT-AU
 * codes are added as `filter.serviceType.codes` for more precise filtering.
 *
 * Requires NHSD_API_KEY environment variable.
 */
export async function searchNHSD(
  postcode: string,
  selectedServices: Service[],
  radiusKm: number,
  centerLat: number,
  centerLon: number,
): Promise<Provider[]> {
  const apiKey = process.env.NHSD_API_KEY
  if (!apiKey) throw new Error("NHSD_API_KEY environment variable is not set")

  // Build keyword → [service names] map, one keyword per selected service
  const keywordToServices = new Map<string, string[]>()
  selectedServices.forEach((svc) => {
    const keyword = svc.provider_queries?.[0] ?? svc.name
    const existing = keywordToServices.get(keyword) ?? []
    if (!existing.includes(svc.name)) existing.push(svc.name)
    keywordToServices.set(keyword, existing)
  })

  // Also collect any SNOMED service-type codes grouped by keyword
  const keywordToSnomedCodes = new Map<string, string[]>()
  selectedServices.forEach((svc) => {
    const keyword = svc.provider_queries?.[0] ?? svc.name
    const codes = (svc as Service & { nhsd_service_type_codes?: string[] }).nhsd_service_type_codes
    if (codes?.length) {
      const existing = keywordToSnomedCodes.get(keyword) ?? []
      codes.forEach((c) => { if (!existing.includes(c)) existing.push(c) })
      keywordToSnomedCodes.set(keyword, existing)
    }
  })

  const allProviders: Provider[] = []
  const seenIds = new Set<string>()
  let isFirst = true

  for (const [keyword, serviceNames] of keywordToServices.entries()) {
    if (!isFirst) await sleep(300) // Polite rate-limit gap between NHSD requests
    isFirst = false

    const params = new URLSearchParams({
      "location.proximity.near_postcode": postcode,
      "location.proximity.near_distance": String(Math.round(radiusKm * 1000)),
      "requestContext.serviceDeliveryMethod": "PHYSICAL",
      "responseControl.limit": "20",
    })

    // Prefer SNOMED codes if available; fall back to keyword text search
    const snomedCodes = keywordToSnomedCodes.get(keyword)
    if (snomedCodes?.length) {
      snomedCodes.forEach((code) => params.append("filter.serviceType.codes", code))
    } else {
      params.set("search.keywords", keyword)
    }

    let response: Response
    try {
      response = await fetch(`${NHSD_BASE_URL}/v5/healthcareServices/_search?${params}`, {
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
      })
    } catch {
      // Network error for this keyword — skip and continue with others
      continue
    }

    if (!response.ok) continue

    const data = (await response.json()) as NHSDSearchResponse
    const meta = data._embedded?.healthcareServicesSearchMeta ?? {}
    const items = data._embedded?.healthcareServices ?? []

    for (const item of items) {
      if (seenIds.has(item.id)) {
        // Already added — just merge the matched service names
        const existing = allProviders.find((p) => p.id === item.id)
        if (existing) {
          serviceNames.forEach((name) => {
            if (!existing.matched_services.includes(name)) existing.matched_services.push(name)
          })
        }
        continue
      }

      const distMeters = meta[item.id]?.geoDistanceInMeters
      const provider = nhsdItemToProvider(item, serviceNames, centerLat, centerLon, distMeters)
      if (!provider) continue
      if (provider.distance_km > radiusKm) continue

      seenIds.add(item.id)
      allProviders.push(provider)
    }
  }

  return allProviders.sort((a, b) => a.distance_km - b.distance_km).slice(0, 40)
}
