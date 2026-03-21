/**
 * Step 2 Consistency Validator
 *
 * Ensures Step 2 service-type filters are consistently backed by real service cards.
 *
 * Checks:
 * 1) Every Step 2 support type in frontend has a category mapping.
 * 2) Every Step 2 support type has a NEED_ALIASES entry in backend rules.
 * 3) Each mapped category has at least MIN_ACTIVE_SERVICES active cards in seed catalog.
 * 4) Every mapped category exists in seed catalog.
 *
 * Usage:
 *   node scripts/validate-step2-consistency.js
 */

const fs = require("fs")
const path = require("path")

const MIN_ACTIVE_SERVICES = 2

const FRONTEND_APP_PATH = path.join(__dirname, "../frontend/src/App.tsx")
const BACKEND_RULES_PATH = path.join(__dirname, "../backend/src/rules.ts")
const SEED_PATH = path.join(__dirname, "../backend/data/seed_services.json")

function readText(filePath) {
  return fs.readFileSync(filePath, "utf-8")
}

function getBlockBetween(text, startMarker, endMarker, errorLabel) {
  const start = text.indexOf(startMarker)
  if (start === -1) {
    throw new Error(`Could not locate ${errorLabel} start marker`)
  }

  const fromStart = text.slice(start)
  const endRelative = fromStart.indexOf(endMarker)
  if (endRelative === -1) {
    throw new Error(`Could not locate ${errorLabel} end marker`)
  }

  return fromStart.slice(0, endRelative)
}

function extractSupportNeedOptions(appText) {
  const options = []
  const block = getBlockBetween(
    appText,
    "const SUPPORT_NEED_OPTIONS = [",
    "const SUPPORT_TYPE_CATEGORY_MAP",
    "SUPPORT_NEED_OPTIONS block in frontend/src/App.tsx",
  )
  const regex = /\{\s*value:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*\}/g
  let match
  while ((match = regex.exec(block)) !== null) {
    options.push({ value: match[1], label: match[2] })
  }

  if (options.length === 0) {
    throw new Error("SUPPORT_NEED_OPTIONS was found but no options could be parsed")
  }

  return options
}

function extractSupportTypeCategoryMap(appText) {
  const map = {}
  const fullBlock = getBlockBetween(
    appText,
    "const SUPPORT_TYPE_CATEGORY_MAP: Record<string, string[]> = {",
    "function matchesSupportType",
    "SUPPORT_TYPE_CATEGORY_MAP block in frontend/src/App.tsx",
  )
  const block = fullBlock
    .replace("const SUPPORT_TYPE_CATEGORY_MAP: Record<string, string[]> = {", "")
    .trim()
  const lineRegex = /\s*(\w+)\s*:\s*\[(.*?)\],?/g
  let match
  while ((match = lineRegex.exec(block)) !== null) {
    const supportType = match[1]
    const categoriesRaw = match[2]
    const categories = Array.from(categoriesRaw.matchAll(/"([^"]+)"/g)).map((m) => m[1])
    map[supportType] = categories
  }

  if (Object.keys(map).length === 0) {
    throw new Error("SUPPORT_TYPE_CATEGORY_MAP was found but no mappings could be parsed")
  }

  return map
}

function extractNeedAliasKeys(rulesText) {
  const keys = []
  const fullBlock = getBlockBetween(
    rulesText,
    "const NEED_ALIASES: Record<string, string[]> = {",
    "function matchesAge",
    "NEED_ALIASES block in backend/src/rules.ts",
  )
  const block = fullBlock
    .replace("const NEED_ALIASES: Record<string, string[]> = {", "")
    .trim()
  const keyRegex = /\s*(\w+)\s*:\s*\[/g
  let match
  while ((match = keyRegex.exec(block)) !== null) {
    keys.push(match[1])
  }
  return keys
}

function loadSeedServices() {
  const raw = readText(SEED_PATH)
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error("backend/data/seed_services.json is not an array")
  }
  return parsed
}

function run() {
  console.log("🔎 Running Step 2 consistency checks...\n")

  const appText = readText(FRONTEND_APP_PATH)
  const rulesText = readText(BACKEND_RULES_PATH)
  const seedServices = loadSeedServices()

  const supportOptions = extractSupportNeedOptions(appText)
  const supportMap = extractSupportTypeCategoryMap(appText)
  const aliasKeys = new Set(extractNeedAliasKeys(rulesText))

  const activeServices = seedServices.filter((service) => service.active !== false)
  const countByCategory = activeServices.reduce((acc, service) => {
    acc[service.category] = (acc[service.category] || 0) + 1
    return acc
  }, {})

  const errors = []
  const warnings = []

  for (const option of supportOptions) {
    const mappedCategories = supportMap[option.value]

    if (!mappedCategories || mappedCategories.length === 0) {
      errors.push(
        `Support type "${option.value}" (${option.label}) has no category mapping in SUPPORT_TYPE_CATEGORY_MAP.`,
      )
      continue
    }

    if (!aliasKeys.has(option.value)) {
      errors.push(
        `Support type "${option.value}" (${option.label}) is missing in NEED_ALIASES in backend/src/rules.ts.`,
      )
    }

    for (const category of mappedCategories) {
      const count = countByCategory[category] || 0
      if (count === 0) {
        errors.push(
          `Mapped category "${category}" for support type "${option.value}" has 0 active services in seed catalog.`,
        )
      } else if (count < MIN_ACTIVE_SERVICES) {
        errors.push(
          `Mapped category "${category}" for support type "${option.value}" has only ${count} active service(s); minimum required is ${MIN_ACTIVE_SERVICES}.`,
        )
      }
    }
  }

  for (const category of Object.keys(countByCategory)) {
    const hasSupportType = Object.values(supportMap).some((categories) => categories.includes(category))
    if (!hasSupportType) {
      warnings.push(
        `Category "${category}" has active services but is not mapped from any Step 2 support type.`,
      )
    }
  }

  console.log("Active service counts by mapped Step 2 category:")
  const allMappedCategories = Array.from(new Set(Object.values(supportMap).flat()))
  for (const category of allMappedCategories.sort()) {
    console.log(`  • ${category}: ${countByCategory[category] || 0}`)
  }

  if (warnings.length) {
    console.log("\n⚠️ Warnings:")
    warnings.forEach((warning) => console.log(`  - ${warning}`))
  }

  if (errors.length) {
    console.log("\n❌ Errors:")
    errors.forEach((error) => console.log(`  - ${error}`))
    console.log("\nStep 2 consistency check failed.")
    process.exit(1)
  }

  console.log("\n✅ Step 2 consistency check passed.")
}

try {
  run()
} catch (error) {
  console.error("❌ Step 2 consistency validator crashed:", error.message)
  process.exit(1)
}
