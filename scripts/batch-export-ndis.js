/**
 * Complete the Drupal batch export from NDIS Commission provider register.
 * Starts the export, polls the batch queue until complete, downloads the CSV.
 */

const https = require("https")
const http = require("http")
const fs = require("fs")
const path = require("path")

const BASE = "https://www.ndiscommission.gov.au"
const OUT_CSV = path.join(__dirname, "ndis_providers.csv")

// Track cookies across requests
let cookieJar = {}

function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
  cookies.forEach((c) => {
    const [nameVal] = c.split(";")
    const [name, ...valParts] = nameVal.split("=")
    cookieJar[name.trim()] = valParts.join("=").trim()
  })
}

function getCookieHeader() {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")
}

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const lib = url.protocol === "https:" ? https : http
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
        Connection: "keep-alive",
        Cookie: getCookieHeader(),
        ...options.headers,
      },
      rejectUnauthorized: false,
    }

    const req = lib.request(reqOpts, (res) => {
      parseCookies(res.headers["set-cookie"])
      let data = Buffer.alloc(0)
      res.on("data", (chunk) => {
        data = Buffer.concat([data, Buffer.from(chunk)])
      })
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data.toString("utf8"),
          rawBody: data,
          location: res.headers["location"] || null,
        })
      })
    })
    req.setTimeout(60000, () => {
      req.destroy()
      reject(new Error("Timeout"))
    })
    req.on("error", reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function followRedirects(url, maxRedirects = 10) {
  let currentUrl = url
  for (let i = 0; i < maxRedirects; i++) {
    console.log(`  GET ${currentUrl.substring(0, 100)}`)
    const res = await request(currentUrl)
    if (res.status >= 300 && res.status < 400 && res.location) {
      const next = res.location.startsWith("http")
        ? res.location
        : BASE + res.location
      console.log(`  Redirect → ${next.substring(0, 100)}`)
      currentUrl = next
    } else {
      return { ...res, finalUrl: currentUrl }
    }
  }
  throw new Error("Too many redirects")
}

async function waitForBatch(batchId) {
  const maxAttempts = 30
  for (let i = 0; i < maxAttempts; i++) {
    const url = `${BASE}/batch?id=${batchId}&op=do_nojs`
    console.log(`  Batch poll ${i + 1}/${maxAttempts}: ${url}`)
    try {
      const res = await request(url)
      console.log(`    Status: ${res.status}, Location: ${res.location || "(none)"}`)

      // If redirected to a download or completion page
      if (res.location) {
        return res.location.startsWith("http") ? res.location : BASE + res.location
      }

      // Check if batch finished in the body
      const body = res.body
      if (body.includes("finished") || body.includes("complete") || body.includes(".csv") || body.length < 500) {
        console.log("    Batch seems complete (small body or finished keyword)")
        // Look for a file link
        const fileMatch = body.match(/href="([^"]*\.csv[^"]*)"/) || body.match(/href="([^"]*\/files\/[^"]+)"/)
        if (fileMatch) {
          const fileUrl = fileMatch[1].startsWith("http") ? fileMatch[1] : BASE + fileMatch[1]
          return fileUrl
        }
      }

      // Check for batch progress percentage
      const progressMatch = body.match(/(\d+)%/) || body.match(/processed.*?(\d+)/)
      if (progressMatch) {
        console.log(`    Progress: ${progressMatch[0]}`)
      }

      await new Promise((r) => setTimeout(r, 2000))
    } catch (e) {
      console.log(`    Error: ${e.message}`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  return null
}

async function main() {
  console.log("=== NDIS Commission Provider Export ===\n")

  // Step 1: Get the main page to establish a session cookie
  console.log("1. Establishing session...")
  await request(`${BASE}/provider-registration/find-registered-provider`)
  console.log(`   Cookies: ${Object.keys(cookieJar).join(", ") || "(none)"}`)

  // Step 2: Submit the export form
  console.log("\n2. Triggering export (Approved status)...")
  const exportUrl = `${BASE}/provider-registration/find-registered-provider/export?field_registration_status_value=Approved&field_legal_name=&field_abn_value=&title=`
  const res = await request(exportUrl)
  console.log(`   Status: ${res.status}, Location: ${res.location || "(none)"}`)
  console.log(`   Body includes 'batch': ${res.body.includes("batch")}`)

  let batchId = null
  let downloadUrl = null

  // Step 3: Find the batch ID
  if (res.location && res.location.includes("batch")) {
    const m = res.location.match(/batch\?id=(\d+)/)
    if (m) batchId = m[1]
  }
  if (!batchId) {
    const m = res.body.match(/batch\?id=(\d+)/)
    if (m) batchId = m[1]
  }
  if (!batchId) {
    // Check for noscript redirect
    const m = res.body.match(/URL=\/batch\?id=(\d+)/)
    if (m) batchId = m[1]
  }

  if (batchId) {
    console.log(`\n3. Batch ID: ${batchId} — polling for completion...`)
    downloadUrl = await waitForBatch(batchId)
  } else {
    console.log("\n3. No batch ID found, checking if direct CSV...")
    // Maybe it redirected directly to a file
    if (res.location && (res.location.includes(".csv") || res.location.includes("/files/"))) {
      downloadUrl = res.location.startsWith("http") ? res.location : BASE + res.location
    }
  }

  if (downloadUrl) {
    console.log(`\n4. Downloading CSV from: ${downloadUrl}`)
    const dlRes = await request(downloadUrl)
    fs.writeFileSync(OUT_CSV, dlRes.rawBody)
    console.log(`   Saved ${dlRes.rawBody.length} bytes to ${OUT_CSV}`)
    console.log("\n   First 500 chars:")
    console.log(dlRes.rawBody.toString("utf8").substring(0, 500))
  } else {
    console.log("\n Could not find download URL. Saving last response body for inspection...")
    fs.writeFileSync(path.join(__dirname, "ndis_batch_response.html"), res.body)
    console.log("   Saved to scripts/ndis_batch_response.html")
  }
}

main().catch(console.error)
