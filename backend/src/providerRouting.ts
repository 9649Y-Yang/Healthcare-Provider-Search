import type { OfficialPathway, Service } from "./types"

export type ProviderSourceName = "verified" | "nhsd" | "google" | "osm"

const NHSD_FIRST_CATEGORIES = new Set([
  "Primary Care & General Practice",
  "Urgent & Emergency Care",
  "Community & Allied Health Services",
  "Mental Health & Wellbeing",
  "Alcohol & Drug Services",
  "Women's & Reproductive Health Services",
  "Men's Health Services",
  "Sexual Health Services",
  "Aboriginal & Culturally Safe Services",
  "Aged Care & Support",
  "Disability Support & NDIS",
])

function uniqueCategories(selectedServices: Service[]) {
  return Array.from(new Set(selectedServices.map((service) => service.category).filter(Boolean)))
}

export function buildSourceSequence(selectedServices: Service[]): ProviderSourceName[] {
  const categories = uniqueCategories(selectedServices)
  const hasKnownCategory = categories.some((category) => NHSD_FIRST_CATEGORIES.has(category ?? ""))

  if (!hasKnownCategory) {
    return ["verified", "google", "osm"]
  }

  return ["verified", "nhsd", "google", "osm"]
}

export function buildOfficialPathways(
  postcode: string,
  selectedServices: Service[],
): OfficialPathway[] {
  const categories = uniqueCategories(selectedServices)
  const pathways: OfficialPathway[] = []

  if (categories.includes("Aged Care & Support")) {
    pathways.push({
      id: `my-aged-care-${postcode}`,
      title: "My Aged Care provider finder",
      description:
        "My Aged Care is the official Australian Government entry point for aged care homes, home support, respite and in-home services. Use it for the most reliable aged-care provider search.",
      url: "https://www.myagedcare.gov.au/find-a-provider",
      button_label: "Search My Aged Care",
      source: "my_aged_care",
      categories: ["Aged Care & Support"],
    })
  }

  if (categories.includes("Disability Support & NDIS")) {
    pathways.push({
      id: `ndis-${postcode}`,
      title: "NDIS registered provider search",
      description:
        "The NDIS Commission provides the official registered provider search. Use it to confirm registered disability providers and search NDIS-specific services.",
      url: "https://www.ndiscommission.gov.au/provider-registration/find-registered-provider",
      button_label: "Search NDIS providers",
      source: "ndis",
      categories: ["Disability Support & NDIS"],
    })
  }

  return pathways
}