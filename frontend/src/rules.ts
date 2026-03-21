import type { Eligibility, Profile, Service } from "./types"

function matchesAge(elig: Eligibility, age?: number | null): boolean {
  if (age == null) return true
  if (elig.age_min != null && age < elig.age_min) return false
  if (elig.age_max != null && age > elig.age_max) return false
  return true
}

function matchesBool(
  elig: Eligibility,
  key: keyof Eligibility,
  value?: boolean | null,
): boolean {
  if (value == null) return true
  if (!(key in elig)) return true
  return Boolean(elig[key]) === Boolean(value)
}

function matchesList(
  elig: Eligibility,
  key: keyof Eligibility,
  values?: string[] | null,
): boolean {
  if (!values || values.length === 0) return true
  const eligValues = elig[key]
  if (!eligValues) return true
  const list = Array.isArray(eligValues) ? eligValues : [eligValues]
  return values.some((v) => list.includes(v))
}


export function evaluate(service: Service, profile: Profile) {
  const elig = service.eligibility ?? {}
  const reasons: string[] = []

  if (!matchesAge(elig, profile.age)) {
    reasons.push("Age is outside required range")
  }
  if (!matchesBool(elig, "atsi", profile.atsi)) {
    reasons.push("Aboriginal/Torres Strait Islander requirement not met")
  }
  if (!matchesBool(elig, "has_disability", profile.has_disability)) {
    reasons.push("Disability requirement not met")
  }
  if (!matchesList(elig, "needs", profile.needs)) {
    reasons.push("No required need matched")
  }

  return {
    match: reasons.length === 0,
    reasons,
  }
}

export function findMatches(services: Service[], profile: Profile) {
  const matches: Array<{ service: Service; why: string[] }> = []

  services.forEach((svc) => {
    if (!svc.active) return
    const { match, reasons } = evaluate(svc, profile)
    if (match) matches.push({ service: svc, why: reasons })
  })

  return matches
}

export function getNeedsFromServices(services: Service[]) {
  const needs = new Set<string>()
  services.forEach((svc) => {
    svc.needs?.forEach((n) => needs.add(n))
  })
  return Array.from(needs).sort()
}
