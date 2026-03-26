import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ProviderMap from "./ProviderMap"
import type { MatchResult, Profile, ProviderSearchResult, Service } from "./types"
import "./App.css"

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? ""
const apiUrl = (path: string) => `${API_BASE_URL}${path}`

const SUPPORT_NEED_OPTIONS = [
  { value: "general_practice", label: "General practice" },
  { value: "urgent_care", label: "Urgent care" },
  { value: "allied_health", label: "Community/allied health" },
  { value: "disability_support", label: "Disability/NDIS support" },
  { value: "aged_care", label: "Aged care" },
  { value: "mental_health", label: "Mental health" },
  { value: "alcohol_drug", label: "Alcohol/drug support" },
  { value: "womens_health", label: "Women's & reproductive health" },
  { value: "mens_health", label: "Men's health" },
  { value: "sexual_health", label: "Sexual health" },
  { value: "aboriginal_health", label: "Aboriginal health services" },
]

const SUPPORT_TYPE_CATEGORY_MAP: Record<string, string[]> = {
  general_practice: ["Primary Care & General Practice"],
  urgent_care: ["Urgent & Emergency Care"],
  allied_health: ["Community & Allied Health Services"],
  disability_support: ["Disability Support & NDIS"],
  aged_care: ["Aged Care & Support"],
  mental_health: ["Mental Health & Wellbeing"],
  alcohol_drug: ["Alcohol & Drug Services"],
  womens_health: ["Women's & Reproductive Health Services"],
  mens_health: ["Men's Health Services"],
  sexual_health: ["Sexual Health Services"],
  aboriginal_health: ["Aboriginal & Culturally Safe Services"],
}

function matchesSupportType(service: Service, supportType: string) {
  const categories = SUPPORT_TYPE_CATEGORY_MAP[supportType] ?? []
  return categories.includes(service.category ?? "")
}

type MapBounds = {
  north: number
  south: number
  east: number
  west: number
}

type HelpTooltipProps = {
  id: string
  text: string
  ariaLabel: string
  openTooltipId: string | null
  onToggle: (id: string) => void
}

function HelpTooltip({ id, text, ariaLabel, openTooltipId, onToggle }: HelpTooltipProps) {
  const isOpen = openTooltipId === id

  return (
    <span className="helpTipWrap">
      <button
        type="button"
        className="helpTip"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => onToggle(id)}
      >
        ⓘ
      </button>
      {isOpen && (
        <span role="tooltip" className="helpTipContent">
          {text}
        </span>
      )}
    </span>
  )
}

export default function App() {
  const appRef = useRef<HTMLDivElement | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [profile, setProfile] = useState<Profile>({
    age: null,
    gender: null,
    region_type: null,
    atsi: null,
    has_disability: null,
    seeking_ndis_access: null,
    diagnosed_mental_health_condition: null,
    alcohol_or_drug_concern: null,
    medicare_card: null,
    needs_support_at_home: null,
    urgent_non_life_threatening: null,
    emergency_now: null,
    mental_health_concern: null,
    lives_in_australia: null,
    australian_resident: null,
    permanent_impairment: null,
    reduced_functional_capacity: null,
  })
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [step2NeedFilters, setStep2NeedFilters] = useState<string[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([])
  const [postcode, setPostcode] = useState("")
  const [address, setAddress] = useState("")
  const [searchType, setSearchType] = useState<"postcode" | "address">("postcode")
  const [radiusKm, setRadiusKm] = useState(15)
  const [providerResult, setProviderResult] = useState<ProviderSearchResult | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [providerSearchStarted, setProviderSearchStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [providerLoading, setProviderLoading] = useState(false)
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [mapViewportVersion, setMapViewportVersion] = useState(0)
  const [appliedViewportVersion, setAppliedViewportVersion] = useState<number | null>(null)
  const [restrictToMapArea, setRestrictToMapArea] = useState(false)
  const [providerSearchVersion, setProviderSearchVersion] = useState(0)

  const eligibleSupportNeedOptions = useMemo(() => {
    return SUPPORT_NEED_OPTIONS.filter((option) =>
      matches.some((match) => matchesSupportType(match.service, option.value)),
    )
  }, [matches])

  useEffect(() => {
    const eligibleSet = new Set(eligibleSupportNeedOptions.map((option) => option.value))
    setStep2NeedFilters((current) => current.filter((value) => eligibleSet.has(value)))
  }, [eligibleSupportNeedOptions])

  const loadServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl("/api/services"))
      if (!res.ok) throw new Error(`Failed to load data: ${res.status}`)
      const data: { services: Service[] } = await res.json()
      setServices(data.services)
    } catch (ex) {
      setError(String(ex))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServices()
  }, [])

  const selectedServices = useMemo(
    () => matches.filter((match) => selectedServiceIds.includes(match.service.id)),
    [matches, selectedServiceIds],
  )

  const filteredMatches = useMemo(() => {
    if (step2NeedFilters.length === 0) return matches
    return matches.filter((match) =>
      step2NeedFilters.some((filterValue) =>
        matchesSupportType(match.service, filterValue),
      ),
    )
  }, [matches, step2NeedFilters])

  const groupedMatches = useMemo(() => {
    const groups = new Map<string, MatchResult[]>()
    filteredMatches.forEach((match) => {
      const key = match.service.category ?? "Other Services"
      const existing = groups.get(key) ?? []
      existing.push(match)
      groups.set(key, existing)
    })
    return Array.from(groups.entries())
  }, [filteredMatches])

  const providersInCurrentArea = useMemo(() => {
    if (!providerResult) return []
    if (!mapBounds) return providerResult.providers

    return providerResult.providers.filter((provider) => {
      return (
        provider.lat <= mapBounds.north &&
        provider.lat >= mapBounds.south &&
        provider.lon <= mapBounds.east &&
        provider.lon >= mapBounds.west
      )
    })
  }, [providerResult, mapBounds])

  const displayedProviders = useMemo(() => {
    if (!providerResult) return []
    return restrictToMapArea ? providersInCurrentArea : providerResult.providers
  }, [providerResult, restrictToMapArea, providersInCurrentArea])

  const hasPendingMapArea = Boolean(
    providerResult &&
      mapBounds &&
      appliedViewportVersion !== null &&
      mapViewportVersion !== appliedViewportVersion,
  )

  const handleMapBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds)
    setMapViewportVersion((current) => current + 1)
  }, [])

  const applyMapAreaFilter = () => {
    if (!providerResult || !mapBounds) return
    setRestrictToMapArea(true)
    setAppliedViewportVersion(mapViewportVersion)
  }

  const clearMapAreaFilter = () => {
    setRestrictToMapArea(false)
    setAppliedViewportVersion(mapViewportVersion)
  }

  const toggleTooltip = (id: string) => {
    setOpenTooltipId((current) => (current === id ? null : id))
  }

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!openTooltipId) return
      const target = event.target as HTMLElement | null
      if (!target) return

      if (target.closest(".helpTipWrap")) return
      if (appRef.current && !appRef.current.contains(target)) return

      setOpenTooltipId(null)
    }

    document.addEventListener("mousedown", handleDocumentClick)
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick)
    }
  }, [openTooltipId])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setProviderResult(null)
    setProviderError(null)
    setSelectedServiceIds([])
    setError(null)
    setMatches([])

    if (
      profile.age == null ||
      !profile.gender ||
      !profile.region_type ||
      profile.atsi == null ||
      profile.has_disability == null ||
      profile.seeking_ndis_access == null ||
      profile.diagnosed_mental_health_condition == null ||
      profile.alcohol_or_drug_concern == null ||
      profile.medicare_card == null ||
      profile.needs_support_at_home == null ||
      profile.urgent_non_life_threatening == null ||
      profile.emergency_now == null ||
      profile.mental_health_concern == null ||
      profile.lives_in_australia == null ||
      profile.australian_resident == null ||
      profile.permanent_impairment == null ||
      profile.reduced_functional_capacity == null
    ) {
      setError("Please complete all Step 1 questions before checking eligibility.")
      return
    }

    try {
      const res = await fetch(apiUrl("/api/eligibility"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      })
      if (!res.ok) throw new Error(`Failed to query eligibility: ${res.status}`)
      const data = await res.json()
      setMatches(data.matches ?? [])
    } catch (ex) {
      setError(String(ex))
    }
  }

  const updateProfile = (partial: Partial<Profile>) => {
    setError(null)
    setProfile((prev) => {
      const next = { ...prev, ...partial }
      // Auto-cascade: when a parent question makes a child irrelevant, reset child to false
      // so hidden questions are never null and backend validation still passes.
      if (partial.lives_in_australia === false) next.australian_resident = false
      if (partial.has_disability === false) {
        next.seeking_ndis_access = false
        next.permanent_impairment = false
        next.reduced_functional_capacity = false
      }
      if (partial.mental_health_concern === false) next.diagnosed_mental_health_condition = false
      if (partial.urgent_non_life_threatening === false) next.emergency_now = false
      return next
    })
  }

  const toggleServiceSelection = (serviceId: number) => {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    )
    setProviderResult(null)
    setProviderError(null)
  }

  const toggleStep2NeedFilter = (needValue: string) => {
    setStep2NeedFilters((current) =>
      current.includes(needValue)
        ? current.filter((value) => value !== needValue)
        : [...current, needValue],
    )
  }

  const handleProviderSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    setProviderSearchStarted(true)
    setProviderError(null)
    setProviderResult(null)
    setMapBounds(null)
    setMapViewportVersion(0)
    setAppliedViewportVersion(null)
    setRestrictToMapArea(false)

    if (searchType === "postcode") {
      if (!/^\d{4}$/.test(postcode)) {
        setProviderError("Enter a valid 4-digit Victorian postcode.")
        return
      }
    } else {
      if (!address.trim()) {
        setProviderError("Enter a detailed address (e.g., street, suburb).")
        return
      }
    }

    try {
      setProviderLoading(true)
      const res = await fetch(apiUrl("/api/providers/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: searchType === "postcode" ? postcode : undefined,
          address: searchType === "address" ? address : undefined,
          serviceIds: selectedServiceIds,
          radiusKm,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Provider search failed: ${res.status}`)
      }
      setProviderResult(data)
      setAppliedViewportVersion(0)
      setProviderSearchVersion((current) => current + 1)
    } catch (ex) {
      setProviderError(String(ex))
    } finally {
      setProviderLoading(false)
    }
  }

  return (
    <div className="app" ref={appRef}>
      <header className="header">
        <div>
          <h1>Healthcare Provider Search (Victoria)</h1>
          <p>
            Complete Step 1 eligibility, choose services in Step 2, then find nearby providers in Step 3 using
            either a Victorian postcode or a detailed address.
          </p>
        </div>
      </header>

      <main className="grid">
        <section className="panel stepPanel">
          <div className="stepTag">Step 1</div>
          <h2>Tell us the basics first</h2>
          <p className="info">
            These questions are used to filter service pathways before provider search.
            This helps show services that better match your care context (for example My Aged Care, NDIS, or urgent care).
          </p>
          <form onSubmit={handleSubmit} className="form">
            <div className="field">
              <span className="fieldLabel">
                Do you live in Australia?
                <HelpTooltip
                  id="lives-in-australia"
                  text="Some pathways, including NDIS access, require you to live in Australia."
                  ariaLabel="Why we ask if you live in Australia"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="livesInAustralia"
                    checked={profile.lives_in_australia === true}
                    onChange={() => updateProfile({ lives_in_australia: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="livesInAustralia"
                    checked={profile.lives_in_australia === false}
                    onChange={() => updateProfile({ lives_in_australia: false })}
                  />
                  No
                </label>
              </div>
            </div>

            {profile.lives_in_australia === true && (
            <div className="field conditionalField">
              <span className="fieldLabel">
                Are you an Australian citizen, permanent resident, or Protected SCV holder?
                <HelpTooltip
                  id="australian-resident"
                  text="Protected SCV means Protected Special Category Visa, mainly for eligible New Zealand citizens."
                  ariaLabel="What Protected SCV means"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="australianResident"
                    checked={profile.australian_resident === true}
                    onChange={() => updateProfile({ australian_resident: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="australianResident"
                    checked={profile.australian_resident === false}
                    onChange={() => updateProfile({ australian_resident: false })}
                  />
                  No
                </label>
              </div>
            </div>
            )}

            <div className="field">
              <label htmlFor="age">
                Age
                <HelpTooltip
                  id="age"
                  text="Age can affect eligibility for youth, disability, and aged-care pathways."
                  ariaLabel="Why age matters"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </label>
              <input
                id="age"
                type="number"
                min={0}
                value={profile.age ?? ""}
                onChange={(e) =>
                  updateProfile({
                    age: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="e.g. 34"
              />
            </div>

            <div className="field">
              <label htmlFor="gender">
                Gender
                <HelpTooltip
                  id="gender"
                  text="Some services are designed for specific groups, including women’s and men’s health services."
                  ariaLabel="Why gender is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </label>
              <select
                id="gender"
                value={profile.gender ?? ""}
                onChange={(e) =>
                  updateProfile({ gender: e.target.value === "" ? null : e.target.value })
                }
              >
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="regionType">
                Where do you usually live?
                <HelpTooltip
                  id="region-type"
                  text="Some programs are available only in metropolitan areas or in regional and rural areas."
                  ariaLabel="Why location type is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </label>
              <select
                id="regionType"
                value={profile.region_type ?? ""}
                onChange={(e) =>
                  updateProfile({
                    region_type:
                      e.target.value === ""
                        ? null
                        : (e.target.value as "metro" | "regional_rural"),
                  })
                }
              >
                <option value="">Select location type</option>
                <option value="metro">Metropolitan</option>
                <option value="regional_rural">Regional or rural</option>
              </select>
            </div>

            <div className="field">
              <span className="fieldLabel">
                Aboriginal or Torres Strait Islander
                <HelpTooltip
                  id="atsi"
                  text="This helps match culturally safe services and applies the correct age rules for some pathways."
                  ariaLabel="Why Aboriginal and Torres Strait Islander status is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="atsi"
                    checked={profile.atsi === true}
                    onChange={() => updateProfile({ atsi: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="atsi"
                    checked={profile.atsi === false}
                    onChange={() => updateProfile({ atsi: false })}
                  />
                  No
                </label>
              </div>
            </div>

            <div className="field">
              <span className="fieldLabel">
                Disability or NDIS-related support needs
                <HelpTooltip
                  id="disability-support"
                  text="This is used to match disability and NDIS-related service pathways."
                  ariaLabel="Why disability support needs are asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="disability"
                    checked={profile.has_disability === true}
                    onChange={() => updateProfile({ has_disability: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="disability"
                    checked={profile.has_disability === false}
                    onChange={() => updateProfile({ has_disability: false })}
                  />
                  No
                </label>
              </div>
            </div>

            {profile.has_disability === true && (
            <div className="field conditionalField">
              <span className="fieldLabel">
                Do you have a permanent impairment?
                <HelpTooltip
                  id="permanent-impairment"
                  text="NDIS access usually requires disability caused by a permanent impairment."
                  ariaLabel="Why permanent impairment is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="permanentImpairment"
                    checked={profile.permanent_impairment === true}
                    onChange={() => updateProfile({ permanent_impairment: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="permanentImpairment"
                    checked={profile.permanent_impairment === false}
                    onChange={() => updateProfile({ permanent_impairment: false })}
                  />
                  No
                </label>
              </div>
            </div>
            )}

            {profile.has_disability === true && (
            <div className="field conditionalField">
              <span className="fieldLabel">
                Does your condition substantially reduce your ability to complete everyday activities?
                <HelpTooltip
                  id="functional-capacity"
                  text="NDIS criteria include substantial impact on daily functional activities."
                  ariaLabel="Why functional capacity is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="reducedFunctionalCapacity"
                    checked={profile.reduced_functional_capacity === true}
                    onChange={() => updateProfile({ reduced_functional_capacity: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="reducedFunctionalCapacity"
                    checked={profile.reduced_functional_capacity === false}
                    onChange={() => updateProfile({ reduced_functional_capacity: false })}
                  />
                  No
                </label>
              </div>
            </div>
            )}

            {profile.has_disability === true && (
            <div className="field conditionalField">
              <span className="fieldLabel">
                Are you seeking access to the NDIS?
                <HelpTooltip
                  id="seeking-ndis"
                  text="This is for people applying for NDIS access, not only current participants."
                  ariaLabel="Why NDIS access intent is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="seekingNdisAccess"
                    checked={profile.seeking_ndis_access === true}
                    onChange={() => updateProfile({ seeking_ndis_access: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="seekingNdisAccess"
                    checked={profile.seeking_ndis_access === false}
                    onChange={() => updateProfile({ seeking_ndis_access: false })}
                  />
                  No
                </label>
              </div>
            </div>
            )}

            <div className="field">
              <span className="fieldLabel">
                Do you have a Medicare card?
                <HelpTooltip
                  id="medicare-card"
                  text="Some subsidised services and care plans depend on Medicare eligibility."
                  ariaLabel="Why Medicare card is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="medicareCard"
                    checked={profile.medicare_card === true}
                    onChange={() => updateProfile({ medicare_card: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="medicareCard"
                    checked={profile.medicare_card === false}
                    onChange={() => updateProfile({ medicare_card: false })}
                  />
                  No
                </label>
              </div>
            </div>

            <div className="field">
              <span className="fieldLabel">
                Do you usually need disability-related support to complete daily activities?
                <HelpTooltip
                  id="daily-support"
                  text="This includes support needs in daily life, at home, in the community, or in routines."
                  ariaLabel="Why daily support needs are asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="homeSupport"
                    checked={profile.needs_support_at_home === true}
                    onChange={() => updateProfile({ needs_support_at_home: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="homeSupport"
                    checked={profile.needs_support_at_home === false}
                    onChange={() => updateProfile({ needs_support_at_home: false })}
                  />
                  No
                </label>
              </div>
            </div>

            <div className="field">
              <span className="fieldLabel">
                Do you need same-day urgent care for a problem that is not immediately life-threatening?
                <HelpTooltip
                  id="urgent-care"
                  text="Urgent care examples: fever, minor infection, sprain, or small cut. Emergencies like chest pain, severe breathing trouble, heavy bleeding, or collapse need 000/ED care."
                  ariaLabel="What urgent non life threatening means"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <p className="info">
                This means you need care today, but it is not a 000-level emergency.
              </p>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="urgentNonEmergency"
                    checked={profile.urgent_non_life_threatening === true}
                    onChange={() => updateProfile({ urgent_non_life_threatening: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="urgentNonEmergency"
                    checked={profile.urgent_non_life_threatening === false}
                    onChange={() => updateProfile({ urgent_non_life_threatening: false })}
                  />
                  No
                </label>
              </div>
            </div>

            {profile.urgent_non_life_threatening === true && (
            <div className="field conditionalField">
              <span className="fieldLabel">
                Right now, do you have signs of a life-threatening emergency?
                <HelpTooltip
                  id="emergency-now"
                  text="Emergency signs include severe chest pain, severe breathing trouble, stroke symptoms, heavy bleeding, collapse, or unconsciousness."
                  ariaLabel="Why emergency signs are asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <p className="info">
                If yes, this is emergency care (call 000 or go to ED), not urgent care clinic.
              </p>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="emergencyNow"
                    checked={profile.emergency_now === true}
                    onChange={() => updateProfile({ emergency_now: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="emergencyNow"
                    checked={profile.emergency_now === false}
                    onChange={() => updateProfile({ emergency_now: false })}
                  />
                  No
                </label>
              </div>
            </div>
            )}

            <div className="field">
              <span className="fieldLabel">
                Are you seeking support for a mental health concern?
                <HelpTooltip
                  id="mental-health-concern"
                  text="This helps prioritise mental health pathways and care plan options."
                  ariaLabel="Why mental health concern is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="mentalHealthConcern"
                    checked={profile.mental_health_concern === true}
                    onChange={() => updateProfile({ mental_health_concern: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="mentalHealthConcern"
                    checked={profile.mental_health_concern === false}
                    onChange={() => updateProfile({ mental_health_concern: false })}
                  />
                  No
                </label>
              </div>
            </div>

            {profile.mental_health_concern === true && (
            <div className="field conditionalField">
              <span className="fieldLabel">
                Have you been diagnosed with a mental health condition?
                <HelpTooltip
                  id="diagnosed-mental-health"
                  text="Some pathways, including GP mental health treatment plan referrals, depend on diagnosis status."
                  ariaLabel="Why diagnosis status is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="diagnosedMentalHealthCondition"
                    checked={profile.diagnosed_mental_health_condition === true}
                    onChange={() => updateProfile({ diagnosed_mental_health_condition: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="diagnosedMentalHealthCondition"
                    checked={profile.diagnosed_mental_health_condition === false}
                    onChange={() => updateProfile({ diagnosed_mental_health_condition: false })}
                  />
                  No
                </label>
              </div>
            </div>
            )}

            <div className="field">
              <span className="fieldLabel">
                Are you seeking support for alcohol or drug use concerns?
                <HelpTooltip
                  id="alcohol-drug"
                  text="This controls whether alcohol and other drug services are shown in Step 2."
                  ariaLabel="Why alcohol or drug support is asked"
                  openTooltipId={openTooltipId}
                  onToggle={toggleTooltip}
                />
              </span>
              <div className="choiceRow">
                <label className="choicePill">
                  <input
                    type="radio"
                    name="alcoholDrugConcern"
                    checked={profile.alcohol_or_drug_concern === true}
                    onChange={() => updateProfile({ alcohol_or_drug_concern: true })}
                  />
                  Yes
                </label>
                <label className="choicePill">
                  <input
                    type="radio"
                    name="alcoholDrugConcern"
                    checked={profile.alcohol_or_drug_concern === false}
                    onChange={() => updateProfile({ alcohol_or_drug_concern: false })}
                  />
                  No
                </label>
              </div>
            </div>

            <button type="submit" className="primary" disabled={loading}>
              Find eligible healthcare services
            </button>

            {loading && <p className="info">Loading healthcare pathways...</p>}
            {error && <p className="error">{error}</p>}
          </form>
        </section>

        <section className="panel results">
          <div className="stepTag">Step 2</div>
          <h2>Select the specific services you want</h2>
          {!submitted ? (
            <p>
              Submit Step 1 first. Step 2 then shows service options matched to your profile.
            </p>
          ) : matches.length === 0 ? (
            <p>No realistic healthcare pathways matched that profile. Adjust the details and try again.</p>
          ) : (
            <div className="categoryGroups">
              <section className="categorySection">
                <h3 className="categoryTitle">Which service types are you seeking?</h3>
                <p className="info">Only service types relevant to your Step 1 profile are shown below.</p>
                <div className="choiceRow">
                  {eligibleSupportNeedOptions.map((option) => (
                    <label className="choicePill" key={option.value}>
                      <input
                        type="checkbox"
                        checked={step2NeedFilters.includes(option.value)}
                        onChange={() => toggleStep2NeedFilter(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </section>

              {filteredMatches.length === 0 && (
                <p>No services match the selected support-type filters. Clear some filters to view more options.</p>
              )}

              {groupedMatches.map(([category, items]) => (
                <section key={category} className="categorySection">
                  <h3 className="categoryTitle">{category}</h3>
                  <div className="cards">
                    {items.map((match) => (
                      <article
                        key={match.service.id}
                        className={`card selectableCard ${selectedServiceIds.includes(match.service.id) ? "selectedCard" : ""}`}
                      >
                        <div className="cardHead">
                          <h3>{match.service.name}</h3>
                          <label className="simpleCheckbox">
                            <input
                              type="checkbox"
                              checked={selectedServiceIds.includes(match.service.id)}
                              onChange={() => toggleServiceSelection(match.service.id)}
                            />
                            Select
                          </label>
                        </div>
                        <p>{match.service.description}</p>
                        <p className="meta">Needs: {match.service.needs.join(", ")}</p>
                        <ul className="reasonList">
                          {match.why.map((reason, index) => (
                            <li key={index}>{reason}</li>
                          ))}
                        </ul>
                        {match.service.source_summary && <p className="info">{match.service.source_summary}</p>}
                        {match.service.source_url && (
                          <p className="source">
                            Source:{" "}
                            <a href={match.service.source_url} target="_blank" rel="noreferrer">
                              {match.service.source_url}
                            </a>
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="panel providerPanel">
          <div className="stepTag">Step 3</div>
          <h2>Find nearby providers</h2>
          {selectedServiceIds.length === 0 ? (
            <p>Select one or more services from Step 2 before searching for providers.</p>
          ) : (
            <>
              <p className="info">
                Selected services: {selectedServices.map((item) => item.service.name).join(", ")}
              </p>

              <form onSubmit={handleProviderSearch} className="form">
                <div className="field">
                  <span className="fieldLabel">Search by:</span>
                  <div className="choiceRow">
                    <label className="choicePill">
                      <input
                        type="radio"
                        name="searchType"
                        checked={searchType === "postcode"}
                        onChange={() => {
                          setSearchType("postcode")
                          setAddress("")
                        }}
                      />
                      Postcode
                    </label>
                    <label className="choicePill">
                      <input
                        type="radio"
                        name="searchType"
                        checked={searchType === "address"}
                        onChange={() => {
                          setSearchType("address")
                          setPostcode("")
                        }}
                      />
                      Address
                    </label>
                  </div>
                  <p className="info">Use postcode for broad local search, or a full address for more precise map centering.</p>
                </div>

                {searchType === "postcode" ? (
                  <div className="field">
                    <label htmlFor="postcode">Victorian postcode</label>
                    <input
                      id="postcode"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="e.g. 3000"
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="address">Detailed address</label>
                    <input
                      id="address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. 300 Grattan Street, Parkville VIC"
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="radiusKm">Search radius</label>
                  <select
                    id="radiusKm"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                  >
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={15}>15 km</option>
                    <option value={25}>25 km</option>
                    <option value={50}>50 km</option>
                  </select>
                </div>
                <button type="submit" className="primary" disabled={providerLoading}>
                  {providerLoading ? "Searching..." : "Find providers near me"}
                </button>
              </form>

              <p className="info">
                You can pan and zoom the map freely. Use "Search in this area" to refresh results for the current viewport,
                or adjust radius to widen/narrow the initial search.
              </p>

              {providerResult?.center.googleMapsUrl && (
                <p className="info">
                  <a href={providerResult.center.googleMapsUrl} target="_blank" rel="noreferrer">
                    Open search area in Google Maps
                  </a>
                </p>
              )}

              {providerError && <p className="error">{providerError}</p>}

              {!providerSearchStarted ? (
                <p>After selecting services, enter a postcode or address to load providers on the map and in the list.</p>
              ) : providerResult && providerResult.providers.length === 0 ? (
                <p>No nearby providers were found for this location and service combination. Try a different address or a larger radius.</p>
              ) : null}

              {providerResult && (
                <>
                  {providerResult.official_pathways && providerResult.official_pathways.length > 0 && (
                    <div className="officialPathwayList">
                      {providerResult.official_pathways.map((pathway) => (
                        <article key={pathway.id} className="officialPathwayCard">
                          <h3>{pathway.title}</h3>
                          <p>{pathway.description}</p>
                          <p className="meta">Relevant to: {pathway.categories.join(", ")}</p>
                          <a href={pathway.url} target="_blank" rel="noreferrer">
                            {pathway.button_label}
                          </a>
                        </article>
                      ))}
                    </div>
                  )}

                  {providerResult.providers.length > 0 && (
                <div className="providerResults">
                  <div className="mapAreaControls">
                    <button
                      type="button"
                      className="primary"
                      onClick={applyMapAreaFilter}
                      disabled={!mapBounds || !providerResult || (!hasPendingMapArea && restrictToMapArea)}
                    >
                      Search in this area
                    </button>
                    {restrictToMapArea && (
                      <button type="button" className="secondary" onClick={clearMapAreaFilter}>
                        Show all results
                      </button>
                    )}
                  </div>
                  <div className="providerSummary info">
                    Showing {displayedProviders.length} of {providerResult.providers.length} providers within {providerResult.center.radiusKm ?? radiusKm} km of {providerResult.center.displayName}.
                    {restrictToMapArea && <span> Filtered to current map area.</span>}
                    {hasPendingMapArea && <span> Map moved or zoomed — click “Search in this area” to refresh the list.</span>}
                    {providerResult.source_sequence && providerResult.source_sequence.length > 0 && (
                      <span> Search order: {providerResult.source_sequence.join(" → ")}.</span>
                    )}
                  </div>
                  <ProviderMap
                    center={providerResult.center}
                    providers={displayedProviders}
                    fitToResultsVersion={providerSearchVersion}
                    onBoundsChange={handleMapBoundsChange}
                  />
                  <div className="providerList">
                    {displayedProviders.map((provider) => (
                      <article key={provider.id} className="providerCard">
                        <h3>{provider.name}</h3>
                        <p>{provider.address}</p>
                        <p className="meta">Approx. {provider.distance_km.toFixed(1)} km away</p>
                        <p className="meta">Matched to: {provider.matched_services.join(", ")}</p>

                        {/* NHSD-enriched details */}
                        {provider.hours_summary && (
                          <p className="meta">Hours: {provider.hours_summary}</p>
                        )}

                        {provider.rating != null && (
                          <p className="meta">Google rating: {provider.rating.toFixed(1)} / 5</p>
                        )}

                        {provider.business_status && (
                          <p className="meta">Status: {provider.business_status}</p>
                        )}

                        {(provider.bulk_billing || provider.telehealth) && (
                          <div className="providerBadges">
                            {provider.bulk_billing && (
                              <span className="badge badge--bulk">Bulk billing</span>
                            )}
                            {provider.telehealth && (
                              <span className="badge badge--telehealth">Telehealth</span>
                            )}
                          </div>
                        )}

                        <div className="linkRow">
                          {provider.phone && (
                            <a href={`tel:${provider.phone}`}>{provider.phone}</a>
                          )}
                          {provider.website && (
                            <a href={provider.website} target="_blank" rel="noreferrer">
                              Website
                            </a>
                          )}
                          <a href={provider.google_maps_url} target="_blank" rel="noreferrer">
                            Google Maps
                          </a>
                          {provider.nhsd_healthdirect_url && (
                            <a href={provider.nhsd_healthdirect_url} target="_blank" rel="noreferrer">
                              Healthdirect
                            </a>
                          )}
                          {provider.osm_url && (
                            <a href={provider.osm_url} target="_blank" rel="noreferrer">
                              OpenStreetMap
                            </a>
                          )}
                        </div>

                        {provider.data_source === "nhsd" && (
                          <p className="meta providerSource">
                            Data: National Health Services Directory (NHSD)
                          </p>
                        )}
                        {provider.data_source === "verified" && (
                          <p className="meta providerSource">
                            Data: Verified provider dataset (manually curated)
                          </p>
                        )}
                        {provider.data_source === "google" && (
                          <p className="meta providerSource">
                            Data: Google Places fallback
                          </p>
                        )}
                        {provider.data_source === "osm" && (
                          <p className="meta providerSource">
                            Data: OpenStreetMap (unverified)
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>
          Service pathways are curated from Australian and Victorian health sources. Provider search prioritises the verified provider
          dataset, then falls back to NHSD, Google Places, and OpenStreetMap when needed.
        </p>
        <p>Current service pathways loaded: {services.length}</p>
      </footer>
    </div>
  )
}