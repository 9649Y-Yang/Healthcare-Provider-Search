# Verified Providers Data Collection Guide

## Overview
This guide helps you systematically research and document Victorian healthcare providers for the Step 3 map layer.

## Recommended Sources

### Primary Directories
- **Skip (skip.com.au)** - Official health & aged care directory with verified details, addresses, phone numbers
- **Healthdirect.gov.au** - Government health guidance and accredited service listings
- **Department of Health Victoria** - Official health provider registries by region
- **AHPRA Registry** - Registered allied health professionals (https://www.ahpra.gov.au)

### Network Pages
- **Metro Health** (Melbourne metro hospitals)
- **Barwon Health** (Geelong, Bellarine, Colac regions)
- **Gippsland Health** (Gippsland region)
- **Western Health** (Melbourne west)
- **Eastern Health** (Melbourne east)

### Category-Specific Sources
- **Pharmacy Guild Australia** - Pharmacies
- **RACGP** - Royal Australian College of General Practice (GP accreditation)
- **My Aged Care** (https://www.myagedcare.gov.au) - Aged care providers
- **NDIS Provider Search** - Disability support providers

## Research Checklist

### For Each Provider
- [ ] Provider name and official ABN (Australian Business Number)
- [ ] Primary type: GP clinic | Community Health Center | Hospital | Allied Health | Specialty Clinic
- [ ] Full address, suburb, postcode
- [ ] Official website URL (verify it's the primary/official site)
- [ ] Phone number
- [ ] GPS coordinates (if available)
- [ ] Services offered (extracted from website)
- [ ] Bulk billing status (if mentioned)
- [ ] Telehealth availability (if mentioned)
- [ ] Hours of operation (if available)

### Service Documentation
When listing services, capture:
- **Service name** (as written on provider website, e.g., "Mental Health Counselling", "Women's Health Clinic")
- **Category mapping** (which Step 2 category it belongs to)
- **Notes** (e.g., "By appointment only", "Telehealth available", "Sliding scale fees")

## Step 2 Service Categories (Reference)

Map discovered services to these official Australian Department of Health categories:

- `general_practice` → General Practice, GP, Family Medicine
- `urgent_care` → After-hours care, Emergency, Urgent clinic
- `allied_health` → Physiotherapy, Podiatry, Psychology, Speech Therapy, Occupational Therapy, Dietetics
- `mental_health` → Mental Health Counselling, Psychiatry, Psychological Services
- `alcohol_drug` → Substance Abuse Counselling, Addiction Services, Drug & Alcohol Support
- `womens_health` → Women's Health Clinic, Gynecology, Reproductive Health, Maternity
- `mens_health` → Men's Health Services
- `sexual_health` → Sexual Health Clinic, STI Testing, Contraception
- `aboriginal_health` → Aboriginal Health Services, Culturally Safe Healthcare
- `aged_care` → Aged Care, Home Support, Residential Aged Care
- `disability_support` → NDIS Services, Disability Support

## JSON Format

Use this structure for each provider:

```json
{
  "id": "VIC_001",
  "name": "Sample GP Clinic",
  "type": "gp_clinic",
  "address": "123 Main Street",
  "suburb": "Melbourne",
  "postcode": "3000",
  "lat": -37.8136,
  "lon": 144.9631,
  "website": "https://www.samplegp.com.au",
  "phone": "03 1234 5678",
  "bulk_billing": true,
  "telehealth_available": true,
  "hours": {
    "monday": "08:30-17:30",
    "tuesday": "08:30-17:30",
    "wednesday": "08:30-17:30",
    "thursday": "08:30-17:30",
    "friday": "08:30-17:30",
    "saturday": "09:00-13:00",
    "sunday": "closed"
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
      "notes": "In-house mental health counsellor, bulk billing for eligible patients"
    },
    {
      "name": "Chronic Disease Management",
      "category": "general_practice",
      "notes": "NDIS-eligible supports available"
    }
  ],
  "data_source": "verified_manual",
  "collection_date": "2026-03-19",
  "collection_notes": "Verified from official website and phone contact",
  "abn": null
}
```

## Collection Strategy

### Phase 1: Sample Geographic Distribution (10-15 providers)
1. **Melbourne CBD** (2-3 providers)
   - 1 large community health center
   - 1-2 GP clinics

2. **Inner Suburbs** (3-5 providers)
   - Mix of GP practices and allied health
   - e.g., Fitzroy, Collingwood, South Yarra

3. **Outer Suburbs** (3-5 providers)
   - Community health, allied health
   - e.g., Box Hill, Dandenong, Footscray

4. **Regional Victoria** (2-3 providers)
   - Ballarat, Bendigo, Geelong
   - Mix of hospital and community health

### Phase 2: Expand by Service Type (10-15 more)
5. Allied health specialists (physiotherapy, psychology, etc.)
6. Hospitals (1-2 major networks)
7. Aged care providers (community support)
8. Disability support providers (NDIS-listed)

## Validation Steps

After collection:
1. Verify all postcodes are valid Victorian postcodes
2. Cross-check website URLs are accessible and current
3. Ensure services fall into Step 2 categories (no unmapped services)
4. Verify ABN (if collected) matches provider name via ABN registry
5. Confirm bulk_billing and telehealth claims match website info

## Tools Available

Once you've collected the raw data:
- **JSON validation** script to ensure format correctness
- **Category mapping** script to verify all services map to Step 2
- **Deduplication** logic to prevent duplicate providers
- **Frontend layer** to display verified providers separately from API search results

## Timeline

- **Week 1**: Collect 10-15 providers (Phase 1 geographic spread)
- **Week 2**: Validate, fix gaps, expand to 20-30 (Phase 2 by service type)
- **Week 3**: Integrate into Step 3 map, display verified layer alongside search results

---

**Need help?**
- Create a JSON validation script to check your data format
- Build a Google Sheets template for easier data entry
- Set up automated category mapping validation
- Create frontend layer to display verified providers distinctly
