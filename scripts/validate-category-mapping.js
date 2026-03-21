/**
 * Category Mapping Validator
 * 
 * Validates that support types and service categories are aligned per official sources.
 * Run this script before deploying to catch mapping inconsistencies.
 * 
 * Usage: node validate-category-mapping.js
 */

const fs = require("fs");
const path = require("path");

// Load SUPPORT_TYPE_CATEGORY_MAP from frontend App.tsx (simple regex extraction)
function extractCategoryMap() {
  const appPath = path.join(__dirname, "../frontend/src/App.tsx");
  const content = fs.readFileSync(appPath, "utf-8");
  
  const mapMatch = content.match(/const SUPPORT_TYPE_CATEGORY_MAP[^}]+}/s);
  if (!mapMatch) {
    throw new Error("Could not find SUPPORT_TYPE_CATEGORY_MAP in App.tsx");
  }
  
  // Parse manually (simple extraction)
  const mapText = mapMatch[0];
  const map = {};
  const lines = mapText.split("\n");
  
  for (const line of lines) {
    const match = line.match(/(\w+):\s*\[\s*"([^"]+)"(?:,\s*"([^"]+)")?\s*\]/);
    if (match) {
      const [, type, cat1, cat2] = match;
      map[type] = cat2 ? [cat1, cat2] : [cat1];
    }
  }
  
  return map;
}

// Load services from seed data
function loadServices() {
  const seedPath = path.join(__dirname, "../backend/data/seed_services.json");
  return JSON.parse(fs.readFileSync(seedPath, "utf-8"));
}

function validate() {
  console.log("🔍 Validating category mappings against official sources...\n");
  
  const categoryMap = extractCategoryMap();
  const services = loadServices();
  
  let errors = [];
  let warnings = [];
  
  // Rule 1: Check for duplicate category assignments (many-to-one)
  const categoryToTypes = {};
  for (const [type, categories] of Object.entries(categoryMap)) {
    for (const cat of categories) {
      if (!categoryToTypes[cat]) categoryToTypes[cat] = [];
      categoryToTypes[cat].push(type);
    }
  }
  
  for (const [category, types] of Object.entries(categoryToTypes)) {
    if (types.length > 1) {
      warnings.push(
        `⚠️  REDUNDANCY: Multiple support types map to "${category}": ${types.join(", ")}`
      );
    }
  }
  
  // Rule 2: Check all service categories are in the map
  const validCategories = new Set(Object.values(categoryMap).flat());
  for (let i = 0; i < services.length; i++) {
    const service = services[i];
    if (service.active !== false && !validCategories.has(service.category)) {
      errors.push(
        `❌ Service "${service.name}" (line ~${i + 2}) has unmapped category: "${service.category}"`
      );
    }
  }
  
  // Rule 3: Check for cross-category needs (service has need type that doesn't match its category)
  for (let i = 0; i < services.length; i++) {
    const service = services[i];
    if (service.active === false) continue;
    
    const serviceCategories = new Set([service.category]);
    for (const need of service.needs || []) {
      const mappedCategories = categoryMap[need] || [];
      const hasMatch = mappedCategories.some(cat => serviceCategories.has(cat));
      
      if (!hasMatch && need !== "referrals" && need !== "prescriptions") {
        // Allow some special needs that might appear across multiple service types
        const allowedCrossCategories = [
          "sexual_health", // sexual health appears in multiple service types
          "screening", // screening is general
          "preventive_care", // prevention is general
        ];
        
        if (!allowedCrossCategories.includes(need)) {
          warnings.push(
            `⚠️  Service "${service.name}" lists need "${need}" but is in "${service.category}" category ` +
            `(expected one of: ${mappedCategories.join(", ") || "UNMAPPED"})`
          );
        }
      }
    }
  }
  
  // Report results
  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ All category mappings are valid!\n");
    console.log("Category Distribution:");
    for (const [cat, types] of Object.entries(categoryToTypes).sort()) {
      console.log(`  • ${cat}: ${types.join(", ")}`);
    }
    return true;
  }
  
  if (errors.length > 0) {
    console.log("❌ CRITICAL ERRORS:\n");
    errors.forEach(err => console.log(`  ${err}`));
  }
  
  if (warnings.length > 0) {
    console.log("\n⚠️  WARNINGS (may indicate redundancy):\n");
    warnings.forEach(warn => console.log(`  ${warn}`));
  }
  
  console.log(
    "\n📖 See CATEGORY_MAPPING_RULES.md for official categorization guidelines.\n"
  );
  
  return errors.length === 0;
}

// Run validation
try {
  const isValid = validate();
  process.exit(isValid ? 0 : 1);
} catch (error) {
  console.error("❌ Validation script error:", error.message);
  process.exit(1);
}
