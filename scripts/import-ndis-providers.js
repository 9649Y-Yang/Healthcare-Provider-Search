/**
 * import-ndis-providers.js
 *
 * Reads the raw NDIS Commission CSV (ndis_providers_raw.csv), filters for
 * Victorian providers (postcode 3000–3999), geocodes each unique postcode via
 * Nominatim, maps NDIS Registration Groups to internal service categories,
 * and appends new records to backend/data/verified_providers.json.
 *
 * Run from the scripts/ directory:
 *   node import-ndis-providers.js
 *
 * Optional: --dry-run   Print records without writing to verified_providers.json
 *           --limit N   Only process first N VIC providers (for testing)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────
const CSV_FILE = path.join(__dirname, 'ndis_providers_raw.csv');
const PROVIDERS_FILE = path.join(__dirname, '..', 'backend', 'data', 'verified_providers.json');
const GEOCODE_CACHE_FILE = path.join(__dirname, 'geocode_cache.json');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.indexOf('--limit');
const LIMIT = LIMIT_ARG !== -1 ? parseInt(process.argv[LIMIT_ARG + 1], 10) : Infinity;
const REPLACE_NDIS = process.argv.includes('--replace-ndis');

// Rate-limit Nominatim: max 1 req/second (OSM policy)
const GEOCODE_DELAY_MS = 1100;

// ── NDIS Registration Group → service category mapping ────────────────────
// Maps NDIS Commission registration group names to our internal category codes.
// A provider can appear in multiple groups → multiple services[] entries.
const GROUP_TO_CATEGORY = {
  // Core Supports — Daily Life / Daily Activities
  'Daily Activities': 'disability_support',
  'Assistance with Daily Life': 'disability_support',
  'Household Tasks': 'disability_support',
  'Assist Prod-Pers Care/Safety': 'disability_support',
  'Assistive Prod-Household Task': 'disability_support',
  'Assistance with Social, Economic and Community Participation': 'disability_support',
  'Innov Community Participation': 'disability_support',
  'Assistance in Supported Independent Living': 'disability_support',
  'Specialist Disability Accommodation': 'disability_support',
  'SDA': 'disability_support',
  'Accommodation/Tenancy': 'disability_support',
  'Assistance Animals': 'disability_support',
  'Support Coordination': 'disability_support',
  'Specialist Support Coordination': 'disability_support',
  'Early Childhood Supports': 'disability_support',
  'Early Intervention Supports for Early Childhood': 'disability_support',
  'Improved Daily Living Skills': 'disability_support',
  'Improved Living Arrangements': 'disability_support',
  'Improved Learning': 'disability_support',
  'Improved Life Choices': 'disability_support',
  'Plan Management': 'disability_support',
  'Interpret/Translate': 'disability_support',

  // Assistive Technology  
  'Personal Mobility Equipment': 'disability_support',
  'Assistive Equip-Recreation': 'disability_support',
  'Vehicle modifications': 'disability_support',
  'Vehicle Modifications': 'disability_support',
  'Home Modification': 'disability_support',
  'Comms & Info Equipment': 'disability_support',
  'Custom Prosthetics': 'disability_support',

  // Allied Health / Therapeutic
  'Therapeutic Supports': 'allied_health',
  'Community Nursing Care': 'allied_health',
  'Specialised Hearing Services': 'allied_health',
  'Hearing Services': 'allied_health',
  'Vision Equipment': 'allied_health',
  'Specialised Driver Training': 'allied_health',

  // Mental Health / Behaviour
  'Behaviour Support': 'mental_health',
  'Positive Behaviour Support': 'mental_health',
  'Mental Health': 'mental_health',
  'Psychosocial Recovery Coaching': 'mental_health',
};

const BLOCKLIST_NAMES = new Set([
  'JONES, PATRICK DAVID',
  'MISS GANJARGAL GALBADRAKH',
  'MISS SIYU JIANG',
]);

const BLOCKLIST_WEBSITES = new Set([
  'infostabilise.com',
  'www.infostabilise.com',
  'chartermaxitaxi.com',
  'www.chartermaxitaxi.com',
]);

const NON_HEALTH_NAME_KEYWORDS = [
  'BOOKKEEPING',
  'ACCOUNTING',
  'TAXI',
  'MAXI TAXI',
  'DRIVING SCHOOL',
  'TRAMPOLINE',
  'FURNITURE',
  'MOWING',
  'LANDSCAPING',
  'BUILDING',
  'CONSTRUCTION',
  'ASSET MANAGEMENT',
  'FITNESS',
  'GYM',
  'NAPPIES',
];

const NON_HEALTH_WEBSITE_KEYWORDS = [
  'bookkeeping',
  'accounting',
  'taxi',
  'trampoline',
  'furniture',
  'mowing',
  'building',
  'landscaping',
  'gym',
  'fitness',
  'nappies',
];

const HEALTH_INTENT_KEYWORDS = [
  'ndis',
  'disability',
  'health',
  'medical',
  'care',
  'therapy',
  'therap',
  'physio',
  'psychology',
  'occupational',
  'speech',
  'allied',
  'clinic',
];

const ENTITY_KEYWORDS = [
  'PTY',
  'LTD',
  'LIMITED',
  'INC',
  'TRUST',
  'CORP',
  'CORPORATION',
  'CLINIC',
  'CENTRE',
  'CENTER',
  'HEALTH',
  'MEDICAL',
  'HOSPITAL',
  'SERVICES',
  'SUPPORT',
  'CARE',
  'ASSOCIATION',
  'FOUNDATION',
  'INSTITUTE',
  'COUNCIL',
  'COMPANY',
  'GROUP',
  'ORGANISATION',
  'ORGANIZATION',
  'ABORIGINAL',
  'COMMUNITY',
  'THERAPY',
];

function normalizeNeed(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hasEntityKeyword(name) {
  const upper = String(name || '').toUpperCase();
  return ENTITY_KEYWORDS.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(upper));
}

function isLikelyPersonalName(name) {
  const text = String(name || '').trim();
  if (!text) return false;
  if (hasEntityKeyword(text)) return false;

  if (/^(Mr|Ms|Mrs|Miss|Dr|Prof)\s+/i.test(text)) return true;
  if (/^[A-Z][A-Za-z'\-]+,\s+[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)?$/i.test(text)) return true;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 3) {
    const likelyNameWords = words.every((word) => /^[A-Z][a-z'\-]+$/.test(word));
    if (likelyNameWords) return true;
  }

  return false;
}

function parseWebsiteHost(value) {
  const input = String(value || '').trim();
  if (!input) return '';

  try {
    const normalized = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function hasHealthIntent(text) {
  const lc = String(text || '').toLowerCase();
  return HEALTH_INTENT_KEYWORDS.some((keyword) => lc.includes(keyword));
}

function hasNonHealthSignal(text) {
  const lc = String(text || '').toLowerCase();
  return NON_HEALTH_WEBSITE_KEYWORDS.some((keyword) => lc.includes(keyword));
}

function shouldExcludeProvider(name, website, groups) {
  const normalized = String(name || '').trim().toUpperCase();
  if (!normalized) return true;
  if (BLOCKLIST_NAMES.has(normalized)) return true;
  if (isLikelyPersonalName(name)) return true;

  const host = parseWebsiteHost(website);
  if (host && BLOCKLIST_WEBSITES.has(host)) return true;

  const nameHasNonHealthKeyword = NON_HEALTH_NAME_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
  if (nameHasNonHealthKeyword && !hasHealthIntent(normalized)) {
    return true;
  }

  if (host && hasNonHealthSignal(host) && !hasHealthIntent(host)) {
    return true;
  }

  const groupText = Array.isArray(groups) ? groups.join(' ') : '';
  if (nameHasNonHealthKeyword && !hasHealthIntent(groupText)) {
    return true;
  }

  return false;
}

// Fallback: any group not in the map defaults to disability_support
function groupToCategory(groupName) {
  const normalized = groupName.trim();
  // Check exact match
  if (GROUP_TO_CATEGORY[normalized]) return GROUP_TO_CATEGORY[normalized];
  // Partial match (case-insensitive)
  const lc = normalized.toLowerCase();
  for (const [key, val] of Object.entries(GROUP_TO_CATEGORY)) {
    if (lc.includes(key.toLowerCase())) return val;
  }
  return 'disability_support';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simple CSV line parser that respects quoted fields */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Fetch a URL as text using Node https */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'HealthcareProviderSearchBot/1.0 (research)' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
        });
      })
      .on('error', reject);
  });
}

/** Geocode a suburb + postcode via Nominatim. Returns { lat, lon } or null */
async function geocode(suburb, postcode) {
  const query = encodeURIComponent(`${postcode} Victoria Australia`);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=${query}`;
  try {
    const body = await fetchText(url);
    const results = JSON.parse(body);
    if (results && results.length > 0) {
      const lat = parseFloat(results[0].lat);
      const lon = parseFloat(results[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon };
      }
    }
  } catch (e) {
    console.warn(`  Geocode failed for ${postcode}:`, e.message);
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Determine provider type from NDIS registration groups */
function inferType(groups) {
  const lower = groups.join(' ').toLowerCase();
  if (lower.includes('hospital') || lower.includes('acute')) return 'hospital';
  if (
    lower.includes('community') ||
    lower.includes('centre') ||
    lower.includes('center')
  )
    return 'community_health';
  if (lower.includes('allied') || lower.includes('therapy') || lower.includes('physio') ||
      lower.includes('occupational') || lower.includes('speech'))
    return 'allied_health';
  return 'community_health'; // default for NDIS providers
}

function deriveNeedsFromGroups(groups) {
  const needs = new Set(['disability_support', 'ndis']);

  for (const group of groups) {
    const lc = String(group || '').toLowerCase();
    const mappedCategory = groupToCategory(group);
    needs.add(mappedCategory);

    if (lc.includes('therapeutic')) needs.add('therapy_supports');
    if (lc.includes('occupational')) needs.add('occupational_therapy');
    if (lc.includes('speech')) needs.add('speech_pathology');
    if (lc.includes('physio')) needs.add('physiotherapy');
    if (lc.includes('behaviour')) needs.add('behaviour_support');
    if (lc.includes('community nursing')) needs.add('nursing_support');
    if (lc.includes('assistive')) needs.add('assistive_technology');
    if (lc.includes('social') || lc.includes('community participation')) {
      needs.add('community_participation');
    }
    if (lc.includes('daily activit') || lc.includes('daily life')) {
      needs.add('daily_living_support');
    }
    if (lc.includes('supported independent living') || /\bsil\b/i.test(group)) {
      needs.add('supported_independent_living');
      needs.add('home_support');
      needs.add('daily_living_support');
    }
    const explicitEmploymentGroups = [
      'employment assistance',
      'customised supported employment',
      'vocational support',
      'specialised supported employment',
      'job coaching',
    ];
    if (explicitEmploymentGroups.some((keyword) => lc.includes(keyword))) {
      needs.add('employment_supports');
    }
    if (lc.includes('mental health') || lc.includes('psychosocial')) {
      needs.add('mental_health');
    }
  }

  return Array.from(needs).map(normalizeNeed).filter(Boolean);
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  // 1. Read CSV
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`CSV not found: ${CSV_FILE}`);
    console.error('Run: node download-ndis-providers-playwright.js first.');
    process.exit(1);
  }
  const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
  const allLines = csvContent.trim().split('\n');

  if (allLines.length < 2) {
    console.error('CSV appears empty or has only a header row.');
    process.exit(1);
  }

  const headers = parseCsvLine(allLines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  console.log(`CSV headers (${headers.length}): ${headers.join(' | ')}`);

  // Detect column indices flexibly
  const col = (names) => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h.toLowerCase().includes(n.toLowerCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // CSV columns: "Legal name", ABN, "Head office", Website, "Registration status",
  //              "Period of registration is in force until", "Approved registration groups"
  const COL_NAME    = col(['legal name', 'provider name', 'name', 'organisation name', 'trading name']);
  const COL_ABN     = col(['abn', 'australian business number']);
  const COL_ADDRESS = col(['head office', 'address', 'suburb', 'locality', 'city']);
  const COL_WEBSITE = col(['website', 'url', 'web address']);
  const COL_STATUS  = col(['registration status', 'status']);
  const COL_GROUPS  = col(['approved registration groups', 'registration group', 'support', 'services']);

  // The "Head office" field has format: "Locality:   <suburb>   <postcode> <state>   <country>"
  // We parse suburb, postcode, and state from it.
  function parseAddress(raw) {
    if (!raw) return { suburb: '', postcode: '', state: '' };
    // Remove "Locality:" prefix
    const clean = raw.replace(/^Locality:\s*/i, '').trim();
    // State codes: VIC, NSW, QLD, SA, WA, TAS, NT, ACT
    const stateMatch = clean.match(/\b(\d{4})\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/);
    if (stateMatch) {
      const postcode = stateMatch[1];
      const state = stateMatch[2];
      const suburb = clean.substring(0, clean.indexOf(postcode)).trim();
      return { suburb, postcode, state };
    }
    // fallback: just try to pull any 4-digit number
    const pcMatch = clean.match(/\b(\d{4})\b/);
    return { suburb: '', postcode: pcMatch ? pcMatch[1] : '', state: '' };
  }

  // Column indices for logging
  const COL_SUBURB   = COL_ADDRESS; // we parse suburb from address
  const COL_POSTCODE = COL_ADDRESS; // we parse postcode from address
  const COL_STATE    = COL_ADDRESS; // we parse state from address

  console.log(`Column mapping: name=${COL_NAME}, abn=${COL_ABN}, address=${COL_ADDRESS}, groups=${COL_GROUPS}, website=${COL_WEBSITE}, status=${COL_STATUS}`);

  if (COL_NAME === -1 || COL_ADDRESS === -1) {
    console.error('Cannot find required columns (name, address) in CSV. Check column mapping above.');
    console.log('All headers:', headers);
    process.exit(1);
  }

  // 2. Parse rows → filter for VIC (postcode 3000–3999) + Approved status
  const rows = [];
  for (let i = 1; i < allLines.length; i++) {
    const fields = parseCsvLine(allLines[i]);
    const { postcode, state } = parseAddress(fields[COL_ADDRESS]);
    const status = COL_STATUS !== -1 ? (fields[COL_STATUS] || '').trim().toLowerCase() : 'approved';
    const pcNum = parseInt(postcode, 10);

    const hasVicPostcode = pcNum >= 3000 && pcNum <= 3999;
    const stateIsCompatible = state === '' || state === 'VIC';
    const isVIC = hasVicPostcode && stateIsCompatible;
    if (isVIC) {
      if (status === '' || status.includes('approved') || status.includes('active')) {
        rows.push(fields);
      }
    }
  }

  console.log(`\nFound ${rows.length} approved VIC providers (postcode 3000–3999) out of ${allLines.length - 1} total rows.`);

  if (rows.length === 0) {
    console.log('No VIC providers found. Check postcode column or try a different state filter.');
    // Dump first few rows for debugging
    for (let i = 1; i <= Math.min(5, allLines.length - 1); i++) {
      console.log(`Row ${i}: ${allLines[i]}`);
    }
    process.exit(1);
  }

  // 3. Load existing providers
  const existingRaw = JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));
  const existing = REPLACE_NDIS
    ? existingRaw.filter((provider) => provider.source !== 'ndis_commission')
    : existingRaw;
  if (REPLACE_NDIS) {
    const removedCount = existingRaw.length - existing.length;
    console.log(`Replacing NDIS import: removed ${removedCount} previous ndis_commission records before re-import.`);
  }
  const existingIds = new Set(existing.map((p) => p.id));
  const existingNames = new Set(existing.map((p) => p.name.toLowerCase().trim()));
  const existingAbns = new Set(
    existing.filter((p) => p.abn).map((p) => p.abn)
  );

  // Find highest existing VIC_### ID
  let maxId = 0;
  for (const p of existing) {
    const m = p.id && p.id.match(/^VIC_(\d+)$/);
    if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
  }
  console.log(`Highest existing ID: VIC_${String(maxId).padStart(3, '0')}`);

  // Pre-filter rows to only what we'll actually process (respects --limit)
  const candidateRows = rows.slice(0, Math.min(rows.length, isFinite(LIMIT) ? LIMIT * 3 : rows.length));

  // 4. Geocode unique postcodes (only those needed for candidate rows)
  // Load cache to skip already-geocoded postcodes
  const geocodeCache = fs.existsSync(GEOCODE_CACHE_FILE)
    ? JSON.parse(fs.readFileSync(GEOCODE_CACHE_FILE, 'utf8'))
    : {};
  const postcodeCoords = new Map(Object.entries(geocodeCache).map(([k, v]) => [k, v]));
  const uniquePostcodes = [...new Set(candidateRows.map((r) => parseAddress(r[COL_ADDRESS]).postcode).filter(Boolean))];
  const missing = uniquePostcodes.filter((pc) => !postcodeCoords.has(pc));
  console.log(`\nGeocoding ${missing.length} new postcodes (${uniquePostcodes.length - missing.length} already cached)…`);

  for (let i = 0; i < missing.length; i++) {
    const pc = missing[i];
    process.stdout.write(`  [${i + 1}/${missing.length}] Geocoding ${pc}… `);
    const coords = await geocode('', pc);
    if (coords) {
      postcodeCoords.set(pc, coords);
      geocodeCache[pc] = coords;
      // Save cache after each successful geocode so progress is never lost
      fs.writeFileSync(GEOCODE_CACHE_FILE, JSON.stringify(geocodeCache, null, 2), 'utf8');
      process.stdout.write(`${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}\n`);
    } else {
      process.stdout.write('FAILED (provider will be skipped)\n');
    }
    if (i < missing.length - 1) await sleep(GEOCODE_DELAY_MS);
  }

  // 5. Build new provider records
  const newProviders = [];
  let processedCount = 0;
  let skippedDuplicate = 0;
  let skippedNoCoords = 0;
  let skippedFiltered = 0;

  for (const fields of rows) {
    if (processedCount >= LIMIT) break;

    const name = (fields[COL_NAME] || '').trim();
    const abn = COL_ABN !== -1 ? (fields[COL_ABN] || '').replace(/\s/g, '').trim() : '';
    const { suburb, postcode } = parseAddress(fields[COL_ADDRESS]);
    const rawGroups = COL_GROUPS !== -1 ? (fields[COL_GROUPS] || '').trim() : '';
    const website = COL_WEBSITE !== -1 ? (fields[COL_WEBSITE] || '').trim() : '';

    if (!name) continue;

    // Parse registration groups (comma-separated in this CSV)
    const groups = rawGroups
      ? rawGroups.split(/\s*,\s*/).map((g) => g.trim()).filter(Boolean)
      : [];

    if (shouldExcludeProvider(name, website, groups)) {
      skippedFiltered++;
      continue;
    }

    // Dedup by name
    if (existingNames.has(name.toLowerCase())) {
      console.log(`  Skipping duplicate (name): ${name}`);
      skippedDuplicate++;
      continue;
    }
    // Dedup by ABN
    if (abn && existingAbns.has(abn)) {
      console.log(`  Skipping duplicate (ABN ${abn}): ${name}`);
      skippedDuplicate++;
      continue;
    }

    const coords = postcodeCoords.get(postcode);
    if (!coords) {
      console.log(`  Skipping (no coords): ${name} [${postcode}]`);
      skippedNoCoords++;
      continue;
    }

    // Build services array (deduplicated categories)
    const seenCategories = new Set();
    const services = [];

    // Always add a base disability_support entry
    services.push({
      name: 'NDIS Registered Provider',
      category: 'disability_support',
    });
    seenCategories.add('disability_support');

    for (const group of groups) {
      const cat = groupToCategory(group);
      if (!seenCategories.has(cat)) {
        seenCategories.add(cat);
        services.push({ name: group, category: cat });
      }
    }

    maxId++;
    const id = `VIC_${String(maxId).padStart(3, '0')}`;

    const record = {
      id,
      name,
      type: inferType(groups),
      suburb,
      postcode,
      ...(website ? { website } : {}),
      ...(abn ? { abn } : {}),
      services,
      needs: deriveNeedsFromGroups(groups),
      lat: coords.lat,
      lon: coords.lon,
      ndis_registered: true,
      source: 'ndis_commission',
    };

    newProviders.push(record);
    existingNames.add(name.toLowerCase());
    if (abn) existingAbns.add(abn);
    processedCount++;
  }

  console.log(`\nSummary:`);
  console.log(`  New providers to add:  ${newProviders.length}`);
  console.log(`  Skipped (duplicate):   ${skippedDuplicate}`);
  console.log(`  Skipped (no coords):   ${skippedNoCoords}`);
  console.log(`  Skipped (filtered):    ${skippedFiltered}`);

  if (newProviders.length === 0) {
    console.log('Nothing to add. Exiting.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n-- DRY RUN: first 3 records --');
    console.log(JSON.stringify(newProviders.slice(0, 3), null, 2));
    console.log('\n(Not writing to verified_providers.json — remove --dry-run to commit)');
    process.exit(0);
  }

  // 6. Append to verified_providers.json
  const updated = [...existing, ...newProviders];
  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  console.log(`\nWrote ${updated.length} providers to ${PROVIDERS_FILE}`);
  console.log(`Added ${newProviders.length} new NDIS providers (VIC_${String(maxId - newProviders.length + 1).padStart(3, '0')} – VIC_${String(maxId).padStart(3, '0')})`);
  console.log('\nNext: node validate-verified-providers.js');
})();
