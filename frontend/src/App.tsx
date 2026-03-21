import { useEffect, useMemo, useState } from "react"
import ProviderMap from "./ProviderMap"
import type { MatchResult, Profile, ProviderSearchResult, Service } from "./types"
import "./App.css"

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

export default function App() {
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
  const [radiusKm, setRadiusKm] = useState(15)
  const [providerResult, setProviderResult] = useState<ProviderSearchResult | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [providerSearchStarted, setProviderSearchStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [providerLoading, setProviderLoading] = useState(false)

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
      const res = await fetch("/api/services")
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
      const res = await fetch("/api/eligibility", {
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

    if (!/^\d{4}$/.test(postcode)) {
      setProviderError("Enter a valid 4-digit Victorian postcode.")
      return
    }

    try {
      setProviderLoading(true)
      const res = await fetch("/api/providers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode,
          serviceIds: selectedServiceIds,
          radiusKm,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Provider search failed: ${res.status}`)
      }
      setProviderResult(data)
    } catch (ex) {
      setProviderError(String(ex))
    } finally {
      setProviderLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Healthcare Provider Search (Victoria)</h1>
          <p>
            Start with basic details, then choose realistic healthcare service pathways,
            then search for nearby providers by postcode.
          </p>
        </div>
      </header>

      <main className="grid">
        <section className="panel stepPanel">
          <div className="stepTag">Step 1</div>
          <h2>Tell us the basics first</h2>
          <p className="info">
            We ask key eligibility questions used by official pathways (for example,
            My Aged Care, NDIS and urgent care) before recommending service types.
          </p>
          <form onSubmit={handleSubmit} className="form">
            <div className="field">
              <span className="fieldLabel">
                Do you live in Australia?
                <span
                  className="helpTip"
                  title="Some pathways (for example NDIS) require you to live in Australia."
                  aria-label="Some pathways require you to live in Australia"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Protected SCV means a Protected Special Category Visa holder, mainly for eligible New Zealand citizens."
                  aria-label="Explanation of Protected SCV"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Age can change eligibility for youth, disability, and aged care pathways."
                  aria-label="Explanation of age importance"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Some services are gender-targeted, including specific women’s or men’s health services."
                  aria-label="Explanation of gender relevance"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Some services are focused on regional or rural communities."
                  aria-label="Explanation of location type"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="This can affect culturally safe pathway matching and some age thresholds."
                  aria-label="Explanation of Aboriginal and Torres Strait Islander question"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Used to match disability support and NDIS-related service pathways."
                  aria-label="Explanation of disability support needs"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="NDIS access generally requires disability caused by a permanent impairment."
                  aria-label="Explanation of permanent impairment"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="NDIS access criteria include substantial functional impact in daily activities."
                  aria-label="Explanation of functional capacity impact"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="This is for people applying for NDIS access eligibility, not only existing participants."
                  aria-label="Explanation of NDIS access intent"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Some subsidised services and care plans depend on Medicare eligibility."
                  aria-label="Explanation of Medicare card question"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="This includes support needs in daily life activities (for example at home, in the community, or in routines)."
                  aria-label="Explanation of daily activities support question"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Urgent care examples: fever, minor infection, sprain, small cut needing treatment. Not urgent care: chest pain, severe breathing trouble, major bleeding, collapse."
                  aria-label="Explanation of urgent non-life-threatening"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Emergency signs include severe chest pain, severe trouble breathing, stroke symptoms, heavy bleeding, collapse, or unconsciousness."
                  aria-label="Explanation of emergency question"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Used to prioritise mental health service pathways and care plan options."
                  aria-label="Explanation of mental health concern question"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="Some pathways (for example GP mental health treatment plan referrals) are specific to diagnosed conditions."
                  aria-label="Explanation of diagnosed mental health condition"
                >
                  ⓘ
                </span>
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
                <span
                  className="helpTip"
                  title="This controls whether alcohol and other drug services appear in Step 2."
                  aria-label="Explanation of alcohol or drug support question"
                >
                  ⓘ
                </span>
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
              Submit your details first. Only after that do we show the healthcare
              service types that fit the profile you entered.
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
          <h2>Find nearby providers by postcode</h2>
          {selectedServiceIds.length === 0 ? (
            <p>Select one or more services from Step 2 before searching by postcode.</p>
          ) : (
            <>
              <p className="info">
                Selected services: {selectedServices.map((item) => item.service.name).join(", ")}
              </p>

              <form onSubmit={handleProviderSearch} className="form inlineForm">
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
                The map supports zoom in and zoom out. Use search radius to show fewer or more nearby providers within the postcode area.
              </p>

              {providerResult?.center.googleMapsUrl && (
                <p className="info">
                  <a href={providerResult.center.googleMapsUrl} target="_blank" rel="noreferrer">
                    Open this postcode area in Google Maps
                  </a>
                </p>
              )}

              {providerError && <p className="error">{providerError}</p>}

              {!providerSearchStarted ? (
                <p>After you choose services, enter a postcode to see nearby providers on the map and in the list.</p>
              ) : providerResult && providerResult.providers.length === 0 ? (
                <p>No nearby providers were found for that postcode and service combination.</p>
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
                  <div className="providerSummary info">
                    Showing {providerResult.providers.length} providers within {providerResult.center.radiusKm ?? radiusKm} km of {providerResult.center.displayName}.
                    {providerResult.source_sequence && providerResult.source_sequence.length > 0 && (
                      <span> Search order: {providerResult.source_sequence.join(" → ")}.</span>
                    )}
                  </div>
                  <ProviderMap center={providerResult.center} providers={providerResult.providers} />
                  <div className="providerList">
                    {providerResult.providers.map((provider) => (
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
                            Data: Verified provider dataset (official website reviewed)
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
          Recommendations are curated from official Australian and Victorian health sources. Nearby provider search uses verified provider data first, then NHSD, then Google Places, then OpenStreetMap, plus official NDIS and My Aged Care pathways where relevant.
        </p>
        <p>Current service pathways loaded: {services.length}</p>
      </footer>
    </div>
  )
}