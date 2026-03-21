import type { Profile, Service } from "./types"

const NEED_ALIASES: Record<string, string[]> = {
  general_practice: ["general_practice", "prescriptions", "preventive_care", "referrals"],
  urgent_care: ["urgent_care", "minor_injury", "minor_condition", "after_hours", "pharmacy_support"],
  allied_health: [
    "allied_health",
    "community_health",
    "physiotherapy",
    "occupational_therapy",
    "speech_pathology",
    "dietitian",
    "podiatry",
    "rehabilitation",
    "pain_management",
    "foot_care",
    "nutrition",
  ],
  disability_support: [
    "disability_support",
    "ndis",
    "assistive_technology",
    "daily_living_support",
    "personal_care",
    "therapy",
    "assessment",
    "therapy_supports",
    "disability_related_health_supports",
    "social_recreation_supports",
    "behaviour_support",
    "employment_supports",
    "supported_independent_living",
  ],
  aged_care: ["aged_care", "home_support", "residential_care", "nursing_support", "respite", "carer_support", "assessment"],
  mental_health: [
    "mental_health",
    "counselling",
    "psychology",
    "psychiatry",
    "wellbeing",
    "community_support",
    "crisis_support",
    "emergency_support",
    "youth_support",
  ],
  alcohol_drug: ["alcohol_drug", "addiction_support", "hotline", "counselling"],
  womens_health: ["womens_health", "reproductive_health", "screening", "contraception", "sexual_health"],
  mens_health: ["mens_health", "sexual_health", "screening", "preventive_care"],
  sexual_health: ["sexual_health", "reproductive_health", "screening", "contraception"],
  aboriginal_health: ["aboriginal_health", "culturally_safe_care", "social_and_emotional_wellbeing", "womens_health"],
}

function matchesAge(elig: Service["eligibility"], profile: Profile) {
  const age = profile.age
  if (age == null) return false
  if (
    profile.atsi &&
    elig.atsi_age_min != null &&
    age >= elig.atsi_age_min &&
    (elig.age_max == null || age <= elig.age_max)
  ) {
    return true
  }
  if (elig.age_min != null && age < elig.age_min) return false
  if (elig.age_max != null && age > elig.age_max) return false
  return true
}

function matchesBool(
  elig: Service["eligibility"],
  key: string,
  value?: boolean | null,
) {
  if (!(key in elig)) return true
  if (value == null) return false
  return Boolean(elig[key]) === Boolean(value)
}

function matchesGender(elig: Service["eligibility"], gender?: string | null) {
  if (!elig.gender) return true
  if (!gender) return false
  const allowed = Array.isArray(elig.gender) ? elig.gender : [elig.gender]
  return allowed.includes(gender)
}

function matchesEnum(
  elig: Service["eligibility"],
  key: string,
  value?: string | null,
) {
  if (!(key in elig)) return true
  if (!value) return false
  const allowedRaw = elig[key]
  if (typeof allowedRaw !== "string" && !Array.isArray(allowedRaw)) return true
  const allowed = Array.isArray(allowedRaw) ? allowedRaw : [allowedRaw]
  return allowed.includes(value)
}

function matchesList(
  elig: Service["eligibility"],
  key: keyof Service["eligibility"],
  values?: string[] | null,
) {
  if (!values || values.length === 0) return true
  const eligValues = elig[key]
  if (!eligValues) return true
  const list = Array.isArray(eligValues) ? eligValues : [eligValues]
  const expandedValues = values.flatMap((value) => [value, ...(NEED_ALIASES[value] ?? [])])
  return expandedValues.some((value) => list.includes(value))
}

export function evaluate(service: Service, profile: Profile) {
  const elig = service.eligibility
  const reasons: string[] = []
  let score = 1

  if (!matchesAge(elig, profile)) {
    return {
      match: false,
      reasons: ["Age requirement not met"],
      score: 0,
    }
  }

  if (!matchesGender(elig, profile.gender)) {
    return {
      match: false,
      reasons: ["Gender-specific eligibility not met"],
      score: 0,
    }
  }

  if (!matchesBool(elig, "atsi", profile.atsi)) {
    return {
      match: false,
      reasons: ["Aboriginal and Torres Strait Islander requirement not met"],
      score: 0,
    }
  }

  if (!matchesBool(elig, "has_disability", profile.has_disability)) {
    return {
      match: false,
      reasons: ["Disability-related eligibility not met"],
      score: 0,
    }
  }

  const booleanRequirements: Array<{
    key: string
    value: boolean | null | undefined
    failReason: string
    successReason?: string
  }> = [
    {
      key: "seeking_ndis_access",
      value: profile.seeking_ndis_access,
      failReason: "NDIS access-intent requirement not met",
      successReason: "Matches NDIS access pathway intent",
    },
    {
      key: "diagnosed_mental_health_condition",
      value: profile.diagnosed_mental_health_condition,
      failReason: "Diagnosed mental health condition requirement not met",
      successReason: "Matches diagnosed-condition mental health pathway",
    },
    {
      key: "alcohol_or_drug_concern",
      value: profile.alcohol_or_drug_concern,
      failReason: "Alcohol or drug support requirement not met",
      successReason: "Relevant for alcohol and other drug support",
    },
    {
      key: "medicare_card",
      value: profile.medicare_card,
      failReason: "Medicare card requirement not met",
      successReason: "Matches Medicare-supported care pathway",
    },
    {
      key: "needs_support_at_home",
      value: profile.needs_support_at_home,
      failReason: "Daily living support need requirement not met",
      successReason: "Aligned with home and daily support needs",
    },
    {
      key: "urgent_non_life_threatening",
      value: profile.urgent_non_life_threatening,
      failReason: "Urgent non-life-threatening requirement not met",
      successReason: "Matches urgent (non-emergency) care criteria",
    },
    {
      key: "emergency_now",
      value: profile.emergency_now,
      failReason: "Emergency status is outside this pathway",
    },
    {
      key: "mental_health_concern",
      value: profile.mental_health_concern,
      failReason: "Mental health support requirement not met",
      successReason: "Relevant for mental health and counselling support",
    },
    {
      key: "lives_in_australia",
      value: profile.lives_in_australia,
      failReason: "Australian residence location requirement not met",
      successReason: "Includes Australia-based access requirement",
    },
    {
      key: "australian_resident",
      value: profile.australian_resident,
      failReason: "Australian residency status requirement not met",
      successReason: "Includes citizen/permanent resident style requirement",
    },
    {
      key: "permanent_impairment",
      value: profile.permanent_impairment,
      failReason: "Permanent impairment requirement not met",
      successReason: "Aligned with permanent-impairment eligibility cue",
    },
    {
      key: "reduced_functional_capacity",
      value: profile.reduced_functional_capacity,
      failReason: "Functional-capacity impact requirement not met",
      successReason: "Aligned with daily functional-capacity impact cue",
    },
  ]

  for (const requirement of booleanRequirements) {
    if (!matchesBool(elig, requirement.key, requirement.value)) {
      return {
        match: false,
        reasons: [requirement.failReason],
        score: 0,
      }
    }

    if (requirement.successReason && requirement.key in elig) {
      reasons.push(requirement.successReason)
      score += 1
    }
  }

  if (!matchesEnum(elig, "region_type", profile.region_type)) {
    return {
      match: false,
      reasons: ["Location type requirement not met"],
      score: 0,
    }
  }

  if (!matchesList(elig, "needs", profile.needs)) {
    return {
      match: false,
      reasons: ["Selected service type does not match requested needs"],
      score: 0,
    }
  }

  if (elig.age_min != null || elig.age_max != null || elig.atsi_age_min != null) {
    const ageText =
      elig.atsi_age_min != null && profile.atsi
        ? `Relevant because Aboriginal and Torres Strait Islander access can start from age ${elig.atsi_age_min}`
        : `Relevant for age ${profile.age}`
    reasons.push(ageText)
    score += 2
  }

  if (service.name === "Aged care assessment and home support") {
    reasons.push(
      "My Aged Care is an assessment-first pathway: age and care needs are checked before government-subsidised aged care starts.",
    )
    score += 2
  }

  if ("region_type" in elig && profile.region_type) {
    reasons.push(
      profile.region_type === "regional_rural"
        ? "Relevant for regional or rural access pathways"
        : "Relevant for metropolitan access pathways",
    )
    score += 1
  }

  if (elig.gender) {
    reasons.push(`Relevant for ${profile.gender} patients`)
    score += 1
  }

  if (elig.atsi && profile.atsi) {
    reasons.push("Provides culturally safe Aboriginal and Torres Strait Islander care")
    score += 3
  }

  if (elig.has_disability && profile.has_disability) {
    reasons.push("Supports disability and NDIS-related care pathways")
    score += 2
  }

  if (service.needs.length > 0) {
    reasons.push(`Covers: ${service.needs.slice(0, 3).join(", ")}`)
  }

  return {
    match: true,
    reasons,
    score,
  }
}

export function findMatches(services: Service[], profile: Profile) {
  const matches: Array<{ service: Service; why: string[] }> = []
  const scored: Array<{ service: Service; why: string[]; score: number }> = []

  services.forEach((svc) => {
    if (!svc.active) return
    const { match, reasons, score } = evaluate(svc, profile)
    if (match) scored.push({ service: svc, why: reasons, score })
  })

  scored
    .sort((left, right) => right.score - left.score)
    .forEach(({ service, why }) => matches.push({ service, why }))

  return matches
}

export function getNeedsFromServices(services: Service[]) {
  const needs = new Set<string>()
  services.forEach((svc) => {
    svc.needs?.forEach((n) => needs.add(n))
  })
  return Array.from(needs).sort()
}
