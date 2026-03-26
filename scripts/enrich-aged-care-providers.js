const fs = require("node:fs")
const path = require("node:path")

const FILE = path.join(__dirname, "..", "backend", "data", "verified_providers.json")
const TODAY = "2026-03-26"

const AGED_NEEDS = [
  "aged_care",
  "assessment",
  "home_support",
  "personal_care",
  "residential_care",
  "nursing_support",
  "respite",
  "carer_support",
]

const curatedProviders = [
  {
    name: "Benetas",
    type: "community_health",
    suburb: "Hawthorn East",
    postcode: "3123",
    website: "https://www.benetas.com.au",
    services: [
      { name: "My Aged Care assessment support", category: "aged_care" },
      { name: "Home care package providers", category: "aged_care" },
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.benetas.com.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "mecwacare",
    type: "community_health",
    suburb: "Malvern",
    postcode: "3144",
    website: "https://www.mecwacare.org.au",
    services: [
      { name: "Home care package providers", category: "aged_care" },
      { name: "In-home personal care", category: "aged_care" },
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.mecwacare.org.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "VMCH (Villa Maria Catholic Homes)",
    type: "community_health",
    suburb: "Wantirna",
    postcode: "3152",
    website: "https://www.vmch.com.au",
    services: [
      { name: "My Aged Care assessment support", category: "aged_care" },
      { name: "Home care package providers", category: "aged_care" },
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Residential nursing care", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.vmch.com.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "Uniting AgeWell",
    type: "community_health",
    suburb: "Burwood East",
    postcode: "3151",
    website: "https://www.unitingagewell.org",
    services: [
      { name: "My Aged Care assessment support", category: "aged_care" },
      { name: "Home care package providers", category: "aged_care" },
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.unitingagewell.org", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "Baptcare",
    type: "community_health",
    suburb: "Camberwell",
    postcode: "3124",
    website: "https://www.baptcare.org.au",
    services: [
      { name: "Home care package providers", category: "aged_care" },
      { name: "In-home personal care", category: "aged_care" },
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.baptcare.org.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "Regis Aged Care",
    type: "community_health",
    suburb: "Camberwell",
    postcode: "3124",
    website: "https://www.regis.com.au",
    services: [
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Residential nursing care", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "My Aged Care assessment support", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.regis.com.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "Estia Health",
    type: "community_health",
    suburb: "Camberwell",
    postcode: "3124",
    website: "https://www.estiahealth.com.au",
    services: [
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Residential nursing care", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "My Aged Care assessment support", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.estiahealth.com.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "Bolton Clarke",
    type: "community_health",
    suburb: "Melbourne",
    postcode: "3000",
    website: "https://www.boltonclarke.com.au",
    services: [
      { name: "Home care package providers", category: "aged_care" },
      { name: "In-home personal care", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "My Aged Care assessment support", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.boltonclarke.com.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "Calvary Aged Care Services (Victoria)",
    type: "community_health",
    suburb: "Springvale",
    postcode: "3171",
    website: "https://www.calvarycare.org.au",
    services: [
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Residential nursing care", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "Home care package providers", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.calvarycare.org.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
  {
    name: "Bupa Aged Care (Victoria)",
    type: "community_health",
    suburb: "Caulfield South",
    postcode: "3162",
    website: "https://www.bupaagedcare.com.au",
    services: [
      { name: "Residential aged care homes", category: "aged_care" },
      { name: "Residential nursing care", category: "aged_care" },
      { name: "Respite aged care", category: "aged_care" },
      { name: "Home care package providers", category: "aged_care" },
      { name: "Carer support programs", category: "aged_care" },
    ],
    needs: AGED_NEEDS,
    source_pages: ["https://www.bupaagedcare.com.au", "https://www.myagedcare.gov.au/find-a-provider"],
  },
]

function normalize(value) {
  return String(value || "").toLowerCase().trim()
}

function geocodeQuery(provider) {
  const addressPart = provider.address ? `${provider.address}, ` : ""
  return `${addressPart}${provider.suburb} VIC ${provider.postcode} Australia`
}

async function geocode(provider) {
  const query = geocodeQuery(provider)
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=" +
    encodeURIComponent(query)

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HealthcareProviderSearchBot/1.0 (local dev)",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed geocoding ${provider.name}: HTTP ${response.status}`)
  }

  const results = await response.json()
  const first = Array.isArray(results) ? results[0] : null
  if (!first) {
    throw new Error(`No geocode result for ${provider.name}`)
  }

  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
  }
}

function addAgedNeedHintsFromServices(record) {
  const names = (record.services || []).map((service) => String(service.name || "").toLowerCase())
  const needs = new Set((record.needs || []).map((need) => String(need).toLowerCase()))

  if (needs.has("aged_care")) {
    for (const name of names) {
      if (name.includes("assessment")) needs.add("assessment")
      if (name.includes("home care") || name.includes("home support") || name.includes("support at home")) {
        needs.add("home_support")
      }
      if (name.includes("personal care")) needs.add("personal_care")
      if (name.includes("residential")) needs.add("residential_care")
      if (name.includes("nursing")) needs.add("nursing_support")
      if (name.includes("respite")) {
        needs.add("respite")
        needs.add("carer_support")
      }
      if (name.includes("carer")) needs.add("carer_support")
    }
  }

  record.needs = Array.from(needs)
}

async function run() {
  const data = JSON.parse(fs.readFileSync(FILE, "utf8"))

  data.forEach(addAgedNeedHintsFromServices)

  const names = new Set(data.map((provider) => normalize(provider.name)))
  let maxId = data.reduce((max, provider) => {
    const match = String(provider.id || "").match(/^VIC_(\d+)/)
    if (!match) return max
    return Math.max(max, Number(match[1]))
  }, 0)

  let added = 0
  for (const provider of curatedProviders) {
    if (names.has(normalize(provider.name))) continue

    const coords = await geocode(provider)
    maxId += 1

    data.push({
      id: `VIC_${String(maxId).padStart(3, "0")}`,
      name: provider.name,
      type: provider.type,
      address: provider.address || "",
      suburb: provider.suburb,
      postcode: provider.postcode,
      lat: coords.lat,
      lon: coords.lon,
      website: provider.website,
      services: provider.services,
      needs: provider.needs,
      source_pages: provider.source_pages,
      data_source: "verified_manual",
      collection_date: TODAY,
      collection_notes:
        "Added to improve Step 3 Aged Care provider coverage (assessment, home support, residential care, respite, personal care, carer support).",
    })

    names.add(normalize(provider.name))
    added += 1
  }

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n")

  const checkNeeds = [
    "aged_care",
    "assessment",
    "home_support",
    "personal_care",
    "residential_care",
    "nursing_support",
    "respite",
    "carer_support",
  ]

  const coverage = Object.fromEntries(checkNeeds.map((need) => [need, 0]))
  for (const provider of data) {
    const providerNeeds = new Set((provider.needs || []).map((need) => String(need).toLowerCase()))
    for (const need of checkNeeds) {
      if (providerNeeds.has(need)) coverage[need] += 1
    }
  }

  console.log(`Aged-care enrichment complete. Added ${added} providers.`)
  console.log("Coverage:", coverage)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
