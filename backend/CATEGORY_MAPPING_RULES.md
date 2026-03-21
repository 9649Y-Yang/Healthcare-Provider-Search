# Service Category Mapping Rules

**Last Updated**: March 17, 2026  
**Source Authority**: Australian Department of Health (https://www.health.gov.au/topics)

## Official Service Categories

This project aligns with **official Australian government health service classification** to ensure consistency with authoritative sources.

### Primary Care & General Practice
- **Authority**: Australian Department of Health
- **Services**: General practice, after-hours medical care
- **Support Type Mapping**: `general_practice`

### Urgent & Emergency Care
- **Authority**: Better Health Victoria, Australian Department of Health
- **Services**: Urgent care clinics, chemist services
- **Support Type Mapping**: `urgent_care`

### Community & Allied Health Services
- **Authority**: Australian Department of Health
- **Services**: Physiotherapy, occupational therapy, speech pathology, dietitian services, community health centres
- **Support Type Mapping**: `allied_health`

### Disability Support & NDIS
- **Authority**: NDIS (National Disability Insurance Scheme)
- **Services**: NDIS assessment, therapy services, equipment provision
- **Support Type Mapping**: `disability_support`

### Aged Care & Support
- **Authority**: My Aged Care, Australian Department of Health
- **Services**: Aged care assessment, home care services, residential aged care
- **Support Type Mapping**: `aged_care`

### Mental Health & Wellbeing
- **Authority**: Australian Department of Health
- **Services**: Mental health clinics, counselling, crisis assessment
- **Support Type Mapping**: `mental_health`

### Alcohol & Drug Services
- **Authority**: Australian Department of Health
- **Services**: Alcohol and drug treatment, AOD counselling hotlines
- **Support Type Mapping**: `alcohol_drug`

### **Women's & Reproductive Health Services** ⚠️ OFFICIAL CATEGORY
- **Authority**: Australian Department of Health (https://www.health.gov.au/topics/reproductive-health)
- **Official Name**: "Reproductive Health" topic (women's health coverage distributed across Reproductive Health, Sexual Health, Pregnancy topics)
- **Services**: Mobile women's health clinics, women's reproductive health services
- **Support Type Mapping**: `womens_health`
- **Note**: "Women's health" is NOT a standalone topic on Australian Department of Health; coverage is distributed across Reproductive Health, Sexual Health, and Pregnancy topics

### **Men's Health Services** ⚠️ OFFICIAL CATEGORY
- **Authority**: Australian Department of Health (https://www.health.gov.au/topics/mens-health)
- **Official Name**: "Men's health" topic
- **Services**: Men's health clinics, men-specific preventive health services
- **Support Type Mapping**: `mens_health`

### **Sexual Health Services** ⚠️ OFFICIAL CATEGORY
- **Authority**: Australian Department of Health (https://www.health.gov.au/topics/sexual-health)
- **Official Name**: "Sexual health" topic
- **Services**: Sexual health clinics, STI prevention/screening, contraception services, sexual wellbeing
- **Support Type Mapping**: `sexual_health`
- **Cross-Category Note**: Services may serve multiple needs (e.g., "Family planning clinic" serves both sexual_health and reproductive_health needs). Primary category should reflect PRIMARY function per classification above.

### Aboriginal & Culturally Safe Services
- **Authority**: Australian Department of Health, NDIS, Victorian health services
- **Services**: Aboriginal health services, culturally safe community care
- **Support Type Mapping**: `aboriginal_health`
- **Note**: KEPT SEPARATE from gender-specific categories per official health service organization (Aboriginal health is classified independently)

---

## Validation Rules for New Services

**BEFORE adding or modifying a service category:**

1. ✅ **Verify the official source** — Check Australian Department of Health (health.gov.au/topics) or relevant authority
2. ✅ **Check for category conflicts** — If a service maps to multiple support types, ensure each support type maps to ONLY ONE primary category (1:1 mapping enforced)
3. ✅ **Document the source** — Always include `source_url` and `source_summary` in service records
4. ✅ **Review the support type mapping** — Ensure SUPPORT_TYPE_CATEGORY_MAP in frontend/src/App.tsx reflects the new category

**PROHIBITED:**
- ❌ Multiple support types mapping to the same category (causes UI redundancy)
- ❌ Categories not listed in SUPPORT_TYPE_CATEGORY_MAP
- ❌ Category names differing from official government sources

---

## How to Prevent Future Misalignments

### Check Before You Commit

```typescript
// frontend/src/App.tsx - SUPPORT_TYPE_CATEGORY_MAP must have 1:1 relationships
const SUPPORT_TYPE_CATEGORY_MAP: Record<string, string[]> = {
  womens_health: ["Women's & Reproductive Health Services"],      // ✓ 1:1
  mens_health: ["Men's Health Services"],                          // ✓ 1:1
  sexual_health: ["Sexual Health Services"],                       // ✓ 1:1
  // ❌ BAD: womens_health: ["Women's Health", "Sexual Health"]  (1 type → 2 categories)
  // ❌ BAD: womens_health & sexual_health both mapping to same category (redundancy)
}
```

### Automated Validation

Run this check before deploying (add to CI/CD pipeline):

```bash
node scripts/validate-category-mapping.js
```

This script validates:
- No category appears twice in SUPPORT_TYPE_CATEGORY_MAP values
- All categories in seed_services.json exist in SUPPORT_TYPE_CATEGORY_MAP
- Support type labels match official Australian government language where applicable

---

## References

- **Australian Department of Health Topics**: https://www.health.gov.au/topics
- **Better Health Victoria**: https://www.betterhealth.vic.gov.au
- **NDIS Official**: https://www.ndis.gov.au
- **My Aged Care**: https://www.myagedcare.gov.au
- **Healthdirect**: https://www.healthdirect.gov.au
