# Verified Providers Integration Guide

## Overview

The **Verified Providers** layer is a curated, manually-researched dataset of Victorian healthcare providers. Unlike dynamic API searches (NHSD, Google Places, OpenStreetMap), verified providers are:

- ✅ Manually researched and validated
- ✅ Linked to official provider websites
- ✅ Structured with consistent healthcare service categorization
- ✅ Marked with collection dates and ABN verification
- ✅ Prioritized in the Step 3 map display

This document explains the architecture and how to implement the integration.

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ User selects postcode + services (Step 1-2)             │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  providerSearch.findNearbyProviders()
        │  - Geocodes postcode → lat/lon   │
        │  - Builds source priority list   │
        └──────────────────┬───────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────┐
│   VERIFIED        │ │    NHSD       │ │   GOOGLE    │
│  (PRIORITY 1)     │ │  (PRIORITY 2) │ │ (PRIORITY 3)│
│                   │ │              │ │             │
│ Locally curated   │ │ Government   │ │ Commercial  │
│ & researched      │ │ verified API │ │ coverage    │
└─────────┬─────────┘ └──────┬───────┘ └──────┬──────┘
          │                  │                │
          └──────────────────┼────────────────┘
                             │
                             ▼
                  ┌───────────────────────┐
                  │  OpenStreetMap Fallback│
                  │    (PRIORITY 4)        │
                  │   (Community data)     │
                  └───────────┬─────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │ + Official Pathways    │
                  │   (My Aged Care, NDIS) │
                  └───────────┬─────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │ ProviderSearchResult   │
                  │ (Step 3 map display)   │
                  └───────────────────────┘
```

### Source Priority Logic

The provider search now follows this priority order:

1. **Verified** (manual research) — Highest quality, limited coverage
2. **NHSD** (National Health Services Directory) — Government, comprehensive for primary/allied health
3. **Google Places** — Commercial coverage, good for metro areas
4. **OpenStreetMap** — Community-maintained fallback

**Key behaviors:**
- Returns providers from the FIRST source that has matching results within the radius
- If Verified has 0 results → try NHSD
- If NHSD has 0 results → try Google Places
- If Google has 0 results → try OpenStreetMap
- Official pathways (My Aged Care, NDIS) are **always** included when relevant, regardless of provider search results

## File Structure

### Backend

```
backend/
├── data/
│   ├── verified_providers.json          # Curated provider dataset (manually populated)
│   └── verified_providers_schema.json   # JSON schema for validation
├── src/
│   ├── verifiedProvidersSearch.ts       # NEW: Module to search verified providers
│   ├── providerRouting.ts               # UPDATED: Source priority logic
│   ├── providerSearch.ts                # UPDATED: Multi-source orchestration
│   └── types.ts                         # UPDATED: Provider type with verified_provider flag
└── .env.example                         # Config (only VERIFIED layer needs no key)
```

### Scripts

```
scripts/
└── validate-verified-providers.js       # NEW: Validates verified_providers.json
```

### Documentation

```
DATA_COLLECTION_TEMPLATE.md              # Guide for collecting provider data
VERIFIED_PROVIDERS_INTEGRATION.md        # This file
```

## Implementation Steps

### Step 1: Populate Verified Providers Data

Use [DATA_COLLECTION_TEMPLATE.md](../DATA_COLLECTION_TEMPLATE.md) to research 20-30 representative Victorian healthcare providers.

**Example entry:**
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
  "telehealth_available": true,
  "hours": { "monday": "07:30-18:00", ... },
  "services": [
    { "name": "General Practice", "category": "general_practice", "notes": "..." },
    { "name": "Mental Health Services", "category": "mental_health", "notes": "..." }
  ],
  "data_source": "provider_website",
  "collection_date": "2026-03-19",
  "collection_notes": "Verified from official website"
}
```

Store in: `backend/data/verified_providers.json`

### Step 2: Validate Data

Run the validation script to ensure data quality:

```bash
node scripts/validate-verified-providers.js
```

**Expected output:**
```
✅ JSON Schema Validation
✅ Duplicate Detection
✅ Provider Type Validation
✅ Service Category Validation
✅ Provider type distribution: ...
✅ Service category distribution: ...
✅ Geographic coverage: ...
✅ Data completeness: ...
```

### Step 3: Update Backend Types

The `Provider` type is already updated with:
- `verified_provider?: boolean` — Flag indicating this came from verified data
- `collection_date?: string` — When this data was collected
- `abn?: string` — Australian Business Number if available
- `data_source?: "verified" | "nhsd" | "google" | "osm"` — Updated union

### Step 4: Update Provider Routing

Update `backend/src/providerRouting.ts` to prioritize verified providers:

```typescript
export function buildSourceSequence(services: Service[]): Array<"verified" | "nhsd" | "google" | "osm"> {
  // Verified providers are ALWAYS checked first
  return ["verified", "nhsd", "google", "osm"];
}
```

### Step 5: Update Provider Search Orchestration

Update `backend/src/providerSearch.ts` to call verified search:

```typescript
import { searchVerifiedProviders } from './verifiedProvidersSearch.js';

export async function findNearbyProviders(
  postcode: string,
  selectedServices: Service[],
  radiusKm = 15,
): Promise<ProviderSearchResult> {
  const center = await geocodePostcode(postcode);
  const official_pathways = buildOfficialPathways(postcode, selectedServices);
  const source_sequence = buildSourceSequence(selectedServices);

  for (const source of source_sequence) {
    try {
      if (source === "verified") {
        const providers = await searchVerifiedProviders(center.lat, center.lon, selectedServices, radiusKm);
        if (providers.length > 0) {
          return { center, providers, official_pathways, source_sequence };
        }
      }
      // ... rest of fallback logic (NHSD, Google, OSM)
    } catch (error) {
      console.warn(`Source ${source} failed:`, error);
    }
  }

  return { center, providers: [], official_pathways, source_sequence };
}
```

### Step 6: Frontend Display Logic

Update `frontend/src/App.tsx` to show verified provider attribution:

```typescript
const getSourceLabel = (provider: Provider): string => {
  switch (provider.data_source) {
    case "verified":
      return "✓ Verified Provider (Manually Researched)";
    case "nhsd":
      return "Data: National Health Services Directory";
    case "google":
      return "Data: Google Places (Fallback)";
    case "osm":
      return "Data: OpenStreetMap (Unverified)";
    default:
      return "Provider Data";
  }
};

const renderVerifiedBadge = (provider: Provider) => {
  if (provider.verified_provider) {
    return (
      <span className="badge badge--verified" title={`Verified on ${provider.collection_date}`}>
        ✓ Verified
      </span>
    );
  }
  return null;
};
```

### Step 7: Frontend Styling

Add CSS for verified provider badge in `frontend/src/App.css`:

```css
.badge--verified {
  background-color: #e6f7e6;
  color: #1b5e20;
  border: 1px solid #a5d6a7;
  font-weight: 600;
}

.provider-source--verified {
  color: #1b5e20;
  font-weight: 600;
}
```

### Step 8: Build & Test

```bash
# Backend
npm run build

# Frontend
npm run build
```

## API: Verified Providers Module

### `searchVerifiedProviders(lat, lon, selectedServices, radiusKm)`

Search verified providers by location and service category.

**Parameters:**
- `lat` (number): Latitude coordinate
- `lon` (number): Longitude coordinate
- `selectedServices` (Service[]): Array of service categories selected in Step 2
- `radiusKm` (number, default 15): Search radius in kilometers

**Returns:**
```typescript
Promise<Provider[]>
```

**Example:**
```typescript
const results = await searchVerifiedProviders(-37.8136, 144.9631, selectedServices, 15);
```

### `getVerifiedProviderById(id)`

Retrieve a verified provider by ID.

**Parameters:**
- `id` (string): Provider ID (e.g., "VIC_001")

**Returns:**
```typescript
Provider | null
```

### `getVerifiedProviderStats()`

Get aggregate statistics about verified providers.

**Returns:**
```typescript
{
  total: number,
  byType: Record<string, number>,      // e.g., { "gp_clinic": 8, "community_health": 5 }
  bySuburb: Record<string, number>,    // e.g., { "Melbourne": 3, "Fitzroy": 2 }
  byCategory: Record<string, number>   // e.g., { "general_practice": 15, "mental_health": 8 }
}
```

### `reloadVerifiedProviders()`

Force reload verified providers from disk (for development/testing).

## Configuration

No additional environment variables required for the Verified layer. The JSON data is loaded locally from:

```
backend/data/verified_providers.json
```

## Data Governance

### Quality Standards

- ✅ All provider information verified from official website or written confirmation
- ✅ Postcode validated against Victorian postcode registry
- ✅ Services mapped to Step 2 categories (no unmapped services)
- ✅ Collection date recorded for audit trail
- ✅ ABN cross-checked (when available) via Australian Business Register

### Maintenance

- **Monthly**: Spot-check provider websites for changes (hours, services, contact details)
- **Quarterly**: Expand verified dataset to additional providers
- **Annually**: Full audit of all verified providers for accuracy

### Deprecation Policy

- Mark provider as inactive if website is unreachable for >30 days
- Remove provider if address verification fails
- Replace provider information if newer data found

## Troubleshooting

### "0 providers found" even in metro areas?

Check:
1. Verified dataset has minimum 20-30 entries: `verified_providers.json` size OK?
2. Service categories match: Are requested services mapped in Step 2?
3. Postcode coordinates: Run `validateVerifiedProviders.js` — check "Geographic coverage"
4. Radius sufficient: Default 15 km — increase if rural

### Validation script fails?

Common issues:
- **Postcode format**: Must be 4 digits (e.g., "3000"), not "Victoria 3000"
- **Service category**: Must match Step 2 enums (check `VALID_CATEGORIES` in script)
- **Provider type**: Must be one of: `gp_clinic`, `community_health`, `hospital`, `allied_health`, `specialty_clinic`

### Frontend not showing verified badge?

Check:
1. Backend build includes `verifiedProvidersSearch.ts`: `npm run build`
2. Provider response has `data_source: "verified"`
3. Frontend CSS loaded: `.badge--verified` style exists

## Next Steps

### Phase 1: Bootstrap (Now)
- Populate 20-30 verified providers
- Run validation
- Implement backend integration
- Test routes return verified providers first

### Phase 2: Expand (Week 2-3)
- Research 10-15 more providers by service category
- Validate data
- Monitor user feedback, refine

### Phase 3: Automate (Month 2)
- Consider batch web scraping from known reliable registries (e.g., Skip, PHV directories)
- Implement automated data freshness checks (quarterly)
- Build admin UI for adding/editing verified providers

### Phase 4: Integrate with Official Registries (Month 3+)
- Explore bulk data access from health department registries
- Match Verified dataset against NHSD data to identify gaps
- Use Verified as seeding data for continuous improvement

## Example User Journey

1. **User selects services**: Mental Health, Physiotherapy (Step 2)
2. **User searches**: Fitzroy postcode, 15 km radius (Step 3)
3. **Backend executes**:
   ```
   searchVerifiedProviders(lat, lon, services, 15)
   → Returns: Fitzroy Community Health Centre (mental_health, women's_health)
             Melbourne Physio & Allied Health (allied_health)
   → Result count: 2 providers [STOP - don't check NHSD/Google/OSM]
   ```
4. **Frontend displays**:
   ```
   🗺️ Search Results
   ✓ Verified Providers (2 results) — Highest priority
   
   ✓ Fitzroy Community Health Centre
      • Mental Health | Women's Health
      • Fitzroy, 3.4 km away
      • ✓ Verified | 📞 03 9415 1234 | 🌐 Website
      
   ✓ Melbourne Physio & Allied Health
      • Physiotherapy | Exercise Physiology
      • Melbourne, 5.1 km away
      • ✓ Verified | 📞 03 9670 5678 | 🌐 Website
   ```

5. **User can also see**:
   - My Aged Care pathway (if aged care services requested)
   - NDIS pathway (if disability services requested)
   - "More results from NHSD" link if user wants additional providers

---

## References

- [DATA_COLLECTION_TEMPLATE.md](../DATA_COLLECTION_TEMPLATE.md) — Provider research guide
- [Step 2 Service Categories](backend/db/seed_services.json) — Canonical service taxonomy
- [NHSD Consumer API](https://developer.healthdirect.org.au/) — Primary provider source
- [My Aged Care](https://www.myagedcare.gov.au/) — Aged care reference
- [NDIS Provider Search](https://www.ndiscommission.gov.au/provider-registration/) — Disability reference
