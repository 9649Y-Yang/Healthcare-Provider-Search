export type Eligibility = {
  age_min?: number
  age_max?: number
  atsi_age_min?: number
  atsi?: boolean
  has_disability?: boolean
  seeking_ndis_access?: boolean
  diagnosed_mental_health_condition?: boolean
  alcohol_or_drug_concern?: boolean
  medicare_card?: boolean
  needs_support_at_home?: boolean
  urgent_non_life_threatening?: boolean
  emergency_now?: boolean
  mental_health_concern?: boolean
  lives_in_australia?: boolean
  australian_resident?: boolean
  permanent_impairment?: boolean
  reduced_functional_capacity?: boolean
  region_type?: "metro" | "regional_rural" | Array<"metro" | "regional_rural">
  gender?: string | string[]
  needs?: string | string[]
  // additional criteria can be added here
  [key: string]: unknown
}

export type Service = {
  id: number
  category?: string
  name: string
  description?: string
  needs: string[]
  eligibility: Eligibility
  source_url?: string
  source_summary?: string
  provider_queries?: string[]
  /**
   * Optional SNOMED CT-AU service-type codes for precise NHSD filtering.
   * Format: "nhsd:/reference/taxonomies/snomed-servicetype/<SNOMED_CODE>"
   * Leave empty to fall back to keyword search via provider_queries.
   * Verify codes via the NHSD reference API once you have API access.
   */
  nhsd_service_type_codes?: string[]
  active: boolean
}

/**
 * A healthcare provider (physical location) returned by the provider search.
 * Fields marked source-specific are only populated for certain data sources.
 */
export type Provider = {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  category: string
  matched_services: string[]
  distance_km: number
  google_maps_url: string
  /** OpenStreetMap deep link (OSM fallback only) */
  osm_url?: string
  /** Phone number (NHSD, Verified) */
  phone?: string
  /** Website URL (NHSD, Verified) */
  website?: string
  /** True when the service bulk-bills Medicare (NHSD, Verified) */
  bulk_billing?: boolean
  /** True when telehealth/online consultations are available (NHSD, Verified) */
  telehealth?: boolean
  /** Optional Google rating when returned by Google Places */
  rating?: number
  /** Optional current business status (Google Places) */
  business_status?: string
  /** Human-readable opening hours, e.g. "Mon–Fri: 08:30–17:30" (NHSD, Verified) */
  hours_summary?: string
  /** "nhsd" = National Health Services Directory  |  "google" = Google Places  |  "osm" = OpenStreetMap fallback  |  "verified" = Manually verified provider */
  data_source?: "nhsd" | "google" | "osm" | "verified"
  /** Direct link to the Healthdirect service page (NHSD) */
  nhsd_healthdirect_url?: string
  /** True when this provider was manually researched and verified (data_source === "verified") */
  verified_provider?: boolean
  /** Date this provider information was collected/verified (Verified only) */
  collection_date?: string
  /** Australian Business Number if available (Verified) */
  abn?: string
}

export type OfficialPathway = {
  id: string
  title: string
  description: string
  url: string
  button_label: string
  source: "my_aged_care" | "ndis"
  categories: string[]
}

export type ProviderSearchResult = {
  center: {
    lat: number
    lon: number
    displayName: string
    radiusKm?: number
    googleMapsUrl?: string
  }
  providers: Provider[]
  official_pathways?: OfficialPathway[]
  source_sequence?: Array<"verified" | "nhsd" | "google" | "osm">
}

export type Profile = {
  age?: number | null
  gender?: string | null
  atsi?: boolean | null
  has_disability?: boolean | null
  seeking_ndis_access?: boolean | null
  diagnosed_mental_health_condition?: boolean | null
  alcohol_or_drug_concern?: boolean | null
  medicare_card?: boolean | null
  needs_support_at_home?: boolean | null
  urgent_non_life_threatening?: boolean | null
  emergency_now?: boolean | null
  mental_health_concern?: boolean | null
  lives_in_australia?: boolean | null
  australian_resident?: boolean | null
  permanent_impairment?: boolean | null
  reduced_functional_capacity?: boolean | null
  region_type?: "metro" | "regional_rural" | null
  needs?: string[]
}
