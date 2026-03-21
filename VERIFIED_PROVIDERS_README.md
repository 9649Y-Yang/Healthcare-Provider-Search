# Verified Providers Infrastructure — Setup Complete ✅

## What Was Created

I've set up a complete **Verified Providers** data layer that lets you curate and integrate manually-researched Victorian healthcare providers into your Step 3 map. This layer will automatically be prioritized over API searches (NHSD, Google Places, OpenStreetMap).

### Files Added

#### Documentation
- **[DATA_COLLECTION_TEMPLATE.md](DATA_COLLECTION_TEMPLATE.md)** — Step-by-step guide for researching and collecting provider data
- **[VERIFIED_PROVIDERS_INTEGRATION.md](VERIFIED_PROVIDERS_INTEGRATION.md)** — Complete technical integration guide

#### Backend Modules
- **[backend/src/verifiedProvidersSearch.ts](backend/src/verifiedProvidersSearch.ts)** — Module to search verified providers locally
  - `searchVerifiedProviders()` — Find verified providers by location + services
  - `getVerifiedProviderById()` — Retrieve single provider
  - `getVerifiedProviderStats()` — Aggregate statistics
  - In-memory caching with 1-hour TTL

#### Data Files
- **[backend/data/verified_providers.json](backend/data/verified_providers.json)** — Your verified provider dataset (currently has 3 example entries)
- **[backend/data/verified_providers_schema.json](backend/data/verified_providers_schema.json)** — JSON schema for validation (enforcesformat, categories, postcodes)

#### Validation & Testing
- **[scripts/validate-verified-providers.js](scripts/validate-verified-providers.js)** — Comprehensive validation script that checks:
  - JSON schema compliance
  - Duplicate detection
  - Service category mapping (validates all categories exist in Step 2)
  - Provider type validation
  - Geographic distribution analysis
  - Data completeness reporting (phone, ABN, coordinates, hours, etc.)

#### Type Updates
- **[backend/src/types.ts](backend/src/types.ts)** — Updated `Provider` type with:
  - `verified_provider?: boolean` — Flag for verified data
  - `collection_date?: string` — When data was researched
  - `abn?: string` — Australian Business Number
  - `data_source?: "verified" | "nhsd" | "google" | "osm"` — Updated union
- **[frontend/src/types.ts](frontend/src/types.ts)** — Mirrored backend types

---

## How It Works

### Priority Sequence

When a user searches for providers, the system now tries sources in this order:

1. **Verified** (your manually-researched data) ← **HIGHEST PRIORITY**
2. **NHSD** (National Health Services Directory)
3. **Google Places** (Fallback)
4. **OpenStreetMap** (Community data)

If any source returns results, the search stops there. Official pathways (My Aged Care, NDIS) are always included.

### Example Data Structure

```json
{
  "id": "VIC_001",
  "name": "Melbourne City Medical Centre",
  "type": "gp_clinic",
  "address": "Level 5, 500 Collins Street",
  "suburb": "Melbourne",
  "postcode": "3000",
  "lat": -37.8136,
  "lon": 144.9631,
  "website": "https://www.melbournecitymedical.com.au",
  "phone": "03 9654 1234",
  "bulk_billing": true,
  "hours": {
    "monday": "07:30-18:00",
    "tuesday": "07:30-18:00"
    // ...
  },
  "services": [
    {
      "name": "General Practice",
      "category": "general_practice",
      "notes": "Full-time GPs, bulk billing available"
    },
    {
      "name": "Mental Health Services",
      "category": "mental_health",
      "notes": "In-house counsellor"
    }
  ],
  "data_source": "provider_website",
  "collection_date": "2026-03-19",
  "collection_notes": "Verified from official website and phone confirmation"
}
```

---

## Getting Started: 3 Steps

### Step 1: Collect Real Provider Data

Follow [DATA_COLLECTION_TEMPLATE.md](DATA_COLLECTION_TEMPLATE.md):

1. Research 20-30 representative Victorian healthcare providers
   - Mix of types: GP clinics, community health centers, hospitals, allied health, specialty clinics
   - Geographic spread: Melbourne metro + regional areas (Ballarat, Bendigo, Geelong, etc.)
   - Use sources: Skip (skip.com.au), Healthdirect, hospital networks, AHPRA directory

2. For each provider, document:
   - Name, address, suburb, postcode, website, phone
   - Opening hours
   - Services offered (extracted from website)
   - Bulk billing status, telehealth availability

3. Map services to Step 2 categories:
   ```
   general_practice, urgent_care, allied_health, mental_health,
   alcohol_drug, womens_health, mens_health, sexual_health,
   aboriginal_health, aged_care, disability_support
   ```

### Step 2: Populate & Validate

1. **Replace the example data** in `backend/data/verified_providers.json` with your research:
   ```bash
   # Current file has 3 example entries — replace with your data
   backend/data/verified_providers.json
   ```

2. **Run validation** to ensure data quality:
   ```bash
   node scripts/validate-verified-providers.js
   ```

   Expected output:
   ```
   ✅ JSON Schema Validation
   ✅ Duplicate Detection
   ✅ Provider Type Validation
   ✅ Service Category Validation
   ✅ Geographic coverage: 12 unique suburbs, 18 unique postcodes
   ✅ Data completeness: 23/30 with phone (77%), 5/30 with ABN (17%)
   ```

### Step 3: Build & Test

1. **Build backend**:
   ```bash
   npm run build
   ```

2. **Build frontend**:
   ```bash
   npm run build
   ```

3. **Test search** with your verified providers:
   - Search for a postcode where you've added providers
   - Verified results should appear FIRST (before NHSD/Google results)
   - Provider cards show "✓ Verified" badge and collection date

---

## What You Can Do Now

### Immediately (No API Keys Needed)
- ✅ Add verified providers to `backend/data/verified_providers.json`
- ✅ Run validation script to ensure quality
- ✅ Build and test locally
- ✅ See verified providers prioritized in search results

### When Ready (With NHSD/Google Keys)
- ⚡ Verified providers shown first, fallback to NHSD if no matches
- ⚡ Full multi-source comparison (Verified vs NHSD vs Google results)
- ⚡ Track which source was used for each provider

---

## API Reference

### Backend Module: `verifiedProvidersSearch.ts`

```typescript
// Search by location + services
const results = await searchVerifiedProviders(lat, lon, services, radiusKm);
// Returns: Provider[] (sorted by distance)

// Get single provider
const provider = getVerifiedProviderById("VIC_001");

// Get statistics
const stats = getVerifiedProviderStats();
// { total: 30, byType: {...}, bySuburb: {...}, byCategory: {...} }

// Reload from disk (dev/testing)
reloadVerifiedProviders();
```

### Data Validation

```bash
node scripts/validate-verified-providers.js
```

Output includes:
- ✅/❌ Schema compliance
- Duplicate detection
- Category validation
- Geographic distribution
- Completeness metrics

---

## Key Features

### ✅ What's Included

- **Automatic priority sequencing** — Verified providers checked first
- **Lazy loading** — Data loaded on first search, cached for 1 hour
- **Distance-based ranking** — Results sorted by distance from user's postcode
- **Category matching** — Only shows providers with requested services
- **Data validation** — Automated schema + category checks
- **Frontend display** — "✓ Verified" badge and collection date shown
- **No API keys required** — Works offline with local JSON data

### 🔄 How It Integrates

```
User Search (Step 3)
    ↓
findNearbyProviders()
    ↓
  [Try in order]:
  1. searchVerifiedProviders() → Found? Return immediately ✓
  2. searchNHSD()             → Found? Return ✓
  3. searchGooglePlaces()     → Found? Return ✓
  4. searchOpenStreetMap()    → Return ✓
    ↓
ProviderSearchResult (with source_sequence metadata)
    ↓
Frontend displays with attribution
```

---

## Example Workflow

### Day 1: Bootstrap
```bash
# 1. Collect 20-30 providers using DATA_COLLECTION_TEMPLATE.md
# 2. Populate backend/data/verified_providers.json
# 3. Validate
$ node scripts/validate-verified-providers.js
✅ All validations passed!

# 4. Build
$ npm run build

# 5. Test locally
# Search "3000" (Melbourne CBD) → See verified providers first
```

### Week 2: Expand
```bash
# Add 10-15 more providers by service category
# (Allied health, hospitals, aged care, etc.)
# Validate again
$ node scripts/validate-verified-providers.js
✅ Coverage now: 40-45 providers across Victoria

# Commit to version control
$ git add backend/data/verified_providers.json
$ git commit -m "Expand verified providers to 42 entries"
```

### Month 2+: Maintain
```bash
# Monthly: Spot-check provider websites
# Quarterly: Add more providers
# Annually: Full audit

# Run validation before each deployment
$ node scripts/validate-verified-providers.js
```

---

## Troubleshooting

### "0 verified providers found"?
1. Check your data: `cat backend/data/verified_providers.json`
2. Validate: `node scripts/validate-verified-providers.js` — fix any errors
3. Check radius: Default 15 km — increase if searching rural areas
4. Rebuild: `npm run build`

### Validation script errors?
- **Postcode**: Must be 4 digits (e.g., "3000"), not regional names
- **Category**: Must match Step 2 categories — check `VALID_CATEGORIES` in script
- **Type**: Must be `gp_clinic`, `community_health`, `hospital`, `allied_health`, or `specialty_clinic`

### Frontend not showing "✓ Verified" badge?
1. Check provider has `verified_provider: true` in JSON
2. Run `npm run build` (frontend needs rebuild)
3. Clear browser cache

---

## Next Steps (Optional Enhancements)

### Phase 1: We're Here ✅
- Set up structure and validation
- Bootstrap with 3 example providers

### Phase 2: Expansion (Week 2-3)
- Research and add 20-30 real Victorian providers
- Automate collection checklist
- Set up version control tracking

### Phase 3: Integration (Month 2)
- Compare verified dataset against NHSD to identify gaps
- Create admin interface for editing providers
- Implement batch geocoding accuracy checks

### Phase 4: Automation (Month 3+)
- Quarterly data refresh from authoritative registries (Skip, health dept)
- Automated freshness checks (test provider websites monthly)
- ML-based category suggestions for new providers

---

## Summary

You now have **zero-friction infrastructure** to:
- Curate your own verified provider dataset
- Validate data quality automatically
- Integrate it as the highest-priority source
- Display it with clear attribution in the UI
- Maintain and expand it over time

**No API keys required.** Start collecting providers today and see them appear in your map first thing tomorrow!

Questions? See [VERIFIED_PROVIDERS_INTEGRATION.md](VERIFIED_PROVIDERS_INTEGRATION.md) for full technical details.
