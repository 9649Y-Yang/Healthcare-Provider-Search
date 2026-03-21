/**
 * Fetch NDIS commission registered providers by searching A-Z
 * then filtering VIC providers from their website info.
 */

const https = require("https")
const fs = require("fs")
const path = require("path")

const BASE_URL = "https://www.ndiscommission.gov.au"
const PROVIDERS_OUT = path.join(__dirname, "ndis_raw_providers.json")

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json, text/html, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer:
          "https://www.ndiscommission.gov.au/provider-registration/find-registered-provider",
        ...headers,
      },
      timeout: 30000,
    }
    const req = https.get(url, opts, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () =>
        resolve({ status: res.statusCode, body: data, headers: res.headers }),
      )
    })
    req.on("error", reject)
    req.on("timeout", () => {
      req.destroy()
      reject(new Error("Timeout"))
    })
  })
}

function parseProvidersFromHtml(htmlContent) {
  const providers = []

  // The AJAX response wraps HTML in JSON — extract the HTML from the insert command
  let html = htmlContent
  try {
    const json = JSON.parse(htmlContent)
    const insertCmd = json.find((c) => c.command === "insert")
    if (insertCmd) {
      html = insertCmd.data
    }
  } catch {
    // not JSON, treat as raw HTML
  }

  // Decode unicode escapes (e.g. \u003C -> <)
  html = html.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  )

  // Find view-row divs
  const rowMatches = [...html.matchAll(/class="views-row"[^>]*>([\s\S]*?)(?=class="views-row"|<\/div>\s*<\/div>\s*<\/div>)/g)]

  // Alternative: find each provider block — look for provider name in title field
  const namePattern = /class="views-field(?:-title|-field-title)[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi
  let m
  while ((m = namePattern.exec(html)) !== null) {
    const url = m[1].startsWith("http") ? m[1] : BASE_URL + m[1]
    const name = m[2].trim()
    if (name.length > 1) {
      providers.push({ name, profileUrl: url })
    }
  }

  // Alternative pattern for spans
  if (providers.length === 0) {
    const spanPattern = /<span[^>]*class="[^"]*field-content[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]{3,})<\/a>/gi
    while ((m = spanPattern.exec(html)) !== null) {
      const url = m[1].startsWith("http") ? m[1] : BASE_URL + m[1]
      const name = m[2].trim()
      if (name.length > 1) {
        providers.push({ name, profileUrl: url })
      }
    }
  }

  return providers
}

async function searchByLetter(letter, page = 0) {
  const params = new URLSearchParams({
    view_name: "search_for_a_registered_ndis_provider",
    view_display_id: "block_1",
    view_args: "",
    view_path: "/node/605",
    pager_element: "0",
    page: String(page),
    field_registration_status_value: "Approved",
    field_legal_name: "",
    field_abn_value: "",
    title: letter,
    _drupal_ajax: "1",
  })
  const url = `${BASE_URL}/views/ajax?${params.toString()}`
  const res = await get(url)
  return res.body
}

async function getProviderPage(profileUrl) {
  try {
    const res = await get(profileUrl)
    return res.body
  } catch {
    return ""
  }
}

function parseRegistrationGroups(html) {
  // Extract registration groups (NDIS support categories) from provider profile page
  const groups = []
  // Pattern: "Registration groups" section with list items
  const sectionMatch = html.match(/Registration\s+[Gg]roup[s]?([\s\S]{0,2000})/)
  if (sectionMatch) {
    const section = sectionMatch[1]
    const items = [...section.matchAll(/<li[^>]*>([^<]{5,})<\/li>/gi)]
    items.forEach((m) => groups.push(m[1].trim()))
    if (groups.length === 0) {
      // Try divs
      const divItems = [...section.matchAll(/<[dt][^>]*>([^<]{5,})<\/[dt]>/gi)]
      divItems.forEach((m) => groups.push(m[1].trim()))
    }
  }
  return groups
}

function parseWebsite(html) {
  // Try to find a website URL on the provider page
  const m = html.match(/(?:Website|Web[:\s]+)<[^>]+><a[^>]+href="(https?:\/\/[^"]+)"/)
    || html.match(/class="[^"]*field-website[^"]*"[^>]*>[\s\S]*?href="(https?:\/\/[^"]+)"/)
    || html.match(/href="(https?:\/\/(?!www\.ndiscommission)[^"]{5,})"/)
  return m ? m[1] : null
}

function mapGroupToCategory(group) {
  const g = group.toLowerCase()
  const map = [
    { pattern: /daily\s+activ|community\s+participation|social|recreation/, category: "Disability Support & NDIS" },
    { pattern: /support\s+coord|plan\s+manag/, category: "Disability Support & NDIS" },
    { pattern: /daily\s+life|household|assist|personal\s+care/, category: "Disability Support & NDIS" },
    { pattern: /therapy|physio|occup|speech|dietit|podiat/, category: "Community & Allied Health Services" },
    { pattern: /mental\s+health|psych|wellbeing|behaviour/, category: "Mental Health & Wellbeing" },
    { pattern: /employ|work/, category: "Disability Support & NDIS" },
    { pattern: /early\s+childhood|early\s+intervention/, category: "Disability Support & NDIS" },
    { pattern: /home|accommodation|sil|supported\s+living/, category: "Disability Support & NDIS" },
    { pattern: /assistiv|equipment|technolog/, category: "Disability Support & NDIS" },
    { pattern: /transport/, category: "Disability Support & NDIS" },
    { pattern: /aged/, category: "Aged Care & Support" },
  ]
  for (const { pattern, category } of map) {
    if (pattern.test(g)) return category
  }
  return "Disability Support & NDIS"
}

async function main() {
  const allProviders = {}
  const letters = "abcdefghijklmnopqrstuvwxyz".split("")

  console.log("=== Searching NDIS provider register by letter ===")
  for (const letter of letters) {
    console.log(`Searching: "${letter}"...`)
    let page = 0
    while (true) {
      try {
        const body = await searchByLetter(letter, page)
        const providers = parseProvidersFromHtml(body)
        if (providers.length === 0) {
          if (page === 0) console.log(`  letter ${letter}: no results`)
          break
        }
        console.log(`  letter ${letter} page ${page}: ${providers.length} providers`)
        providers.forEach((p) => {
          if (!allProviders[p.name]) allProviders[p.name] = p
        })

        // Check if there's a next page (look for "next" pager in HTML)
        let html = body
        try {
          const json = JSON.parse(body)
          const ins = json.find((c) => c.command === "insert")
          if (ins) html = ins.data
        } catch {}
        if (html.includes("pager-next") || html.includes("js-pager__item--next")) {
          page++
        } else {
          break
        }
        await new Promise((r) => setTimeout(r, 500))
      } catch (e) {
        console.log(`  Error ${letter} p${page}: ${e.message}`)
        break
      }
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  const provList = Object.values(allProviders)
  console.log(`\nTotal unique providers found: ${provList.length}`)
  fs.writeFileSync(PROVIDERS_OUT, JSON.stringify(provList, null, 2))
  console.log(`Saved to ${PROVIDERS_OUT}`)
}

main().catch(console.error)
