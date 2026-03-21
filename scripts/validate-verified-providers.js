#!/usr/bin/env node

/**
 * Validation script for verified_providers.json
 * Ensures data quality, schema compliance, and category mapping accuracy
 */

const fs = require('fs');
const path = require('path');
let Ajv = null;
try {
  Ajv = require('ajv');
} catch {
  Ajv = null;
}

const PROVIDERS_FILE = path.join(__dirname, '..', 'backend', 'data', 'verified_providers.json');
const SCHEMA_FILE = path.join(__dirname, '..', 'backend', 'data', 'verified_providers_schema.json');

// Valid service categories from Step 2
const VALID_CATEGORIES = [
  'general_practice',
  'urgent_care',
  'allied_health',
  'mental_health',
  'alcohol_drug',
  'womens_health',
  'mens_health',
  'sexual_health',
  'aboriginal_health',
  'aged_care',
  'disability_support',
];

const VALID_PROVIDER_TYPES = [
  'gp_clinic',
  'community_health',
  'hospital',
  'allied_health',
  'specialty_clinic',
];

/**
 * Load and validate JSON files
 */
function loadJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    console.error(`❌ Error loading ${filepath}:`, err.message);
    process.exit(1);
  }
}

/**
 * Validate against JSON schema
 */
function validateSchema(providers, schema) {
  if (!Ajv) {
    console.warn('⚠️  Ajv is not installed. Skipping JSON Schema validation and using core checks only.');
    return true;
  }

  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const isValid = validate(providers);

  if (!isValid) {
    console.error('❌ Schema validation failed:');
    validate.errors.forEach((err, idx) => {
      console.error(`   Error ${idx + 1}: ${err.instancePath || 'root'} - ${err.message}`);
    });
    return false;
  }
  return true;
}

/**
 * Check for duplicate providers
 */
function checkDuplicates(providers) {
  const seen = new Map();
  const duplicates = [];

  providers.forEach((provider, idx) => {
    const key = `${provider.name}|${provider.postcode}`;
    if (seen.has(key)) {
      duplicates.push({
        id: provider.id,
        name: provider.name,
        previousIndex: seen.get(key),
        currentIndex: idx,
      });
    } else {
      seen.set(key, idx);
    }
  });

  if (duplicates.length > 0) {
    console.warn('⚠️  Possible duplicates detected:');
    duplicates.forEach((dup) => {
      console.warn(`   ${dup.name} (${dup.postcode}) - Index ${dup.previousIndex} and ${dup.currentIndex}`);
    });
    return false;
  }
  return true;
}

/**
 * Validate service categories
 */
function validateServiceCategories(providers) {
  const issues = [];
  const categoryStats = {};

  providers.forEach((provider) => {
    if (!provider.services || !Array.isArray(provider.services)) {
      issues.push(`${provider.id}: Missing or invalid services array`);
      return;
    }

    provider.services.forEach((service, idx) => {
      if (!VALID_CATEGORIES.includes(service.category)) {
        issues.push(
          `${provider.id} (${provider.name}): Service "${service.name}" has invalid category "${service.category}"`
        );
      }

      categoryStats[service.category] = (categoryStats[service.category] || 0) + 1;
    });
  });

  if (issues.length > 0) {
    console.error('❌ Service category validation failed:');
    issues.forEach((issue) => console.error(`   ${issue}`));
    return false;
  }

  console.log('✅ Service category distribution:');
  Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`   ${category}: ${count} services`);
    });

  return true;
}

/**
 * Validate provider types
 */
function validateProviderTypes(providers) {
  const issues = [];
  const typeStats = {};

  providers.forEach((provider) => {
    if (!VALID_PROVIDER_TYPES.includes(provider.type)) {
      issues.push(`${provider.id}: Invalid provider type "${provider.type}"`);
    }
    typeStats[provider.type] = (typeStats[provider.type] || 0) + 1;
  });

  if (issues.length > 0) {
    console.error('❌ Provider type validation failed:');
    issues.forEach((issue) => console.error(`   ${issue}`));
    return false;
  }

  console.log('✅ Provider type distribution:');
  Object.entries(typeStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count} providers`);
    });

  return true;
}

/**
 * Check geographic distribution
 */
function checkGeographicDistribution(providers) {
  const suburbs = new Set();
  const postcodes = new Map();

  providers.forEach((provider) => {
    suburbs.add(provider.suburb);
    const count = postcodes.get(provider.postcode) || 0;
    postcodes.set(provider.postcode, count + 1);
  });

  console.log(`✅ Geographic coverage: ${suburbs.size} unique suburbs, ${postcodes.size} unique postcodes`);

  // Show postcode distribution
  const topPostcodes = Array.from(postcodes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('   Top postcodes:');
  topPostcodes.forEach(([postcode, count]) => {
    const suburb = providers.find((p) => p.postcode === postcode)?.suburb || 'Unknown';
    console.log(`      ${postcode} (${suburb}): ${count} provider(s)`);
  });

  return true;
}

/**
 * Check data completeness
 */
function checkDataCompleteness(providers) {
  const completeness = {
    total: providers.length,
    withPhone: 0,
    withABN: 0,
    withCoordinates: 0,
    withHours: 0,
    withBulkBilling: 0,
    withTelehealth: 0,
  };

  providers.forEach((provider) => {
    if (provider.phone) completeness.withPhone++;
    if (provider.abn) completeness.withABN++;
    if (provider.lat && provider.lon) completeness.withCoordinates++;
    if (provider.hours) completeness.withHours++;
    if (provider.bulk_billing !== undefined) completeness.withBulkBilling++;
    if (provider.telehealth_available !== undefined) completeness.withTelehealth++;
  });

  console.log('✅ Data completeness:');
  console.log(`   Total providers: ${completeness.total}`);
  console.log(
    `   With phone: ${completeness.withPhone}/${completeness.total} (${Math.round((completeness.withPhone / completeness.total) * 100)}%)`
  );
  console.log(
    `   With ABN: ${completeness.withABN}/${completeness.total} (${Math.round((completeness.withABN / completeness.total) * 100)}%)`
  );
  console.log(
    `   With coordinates: ${completeness.withCoordinates}/${completeness.total} (${Math.round((completeness.withCoordinates / completeness.total) * 100)}%)`
  );
  console.log(
    `   With hours: ${completeness.withHours}/${completeness.total} (${Math.round((completeness.withHours / completeness.total) * 100)}%)`
  );
  console.log(
    `   With bulk billing info: ${completeness.withBulkBilling}/${completeness.total} (${Math.round((completeness.withBulkBilling / completeness.total) * 100)}%)`
  );
  console.log(
    `   With telehealth info: ${completeness.withTelehealth}/${completeness.total} (${Math.round((completeness.withTelehealth / completeness.total) * 100)}%)`
  );

  return true;
}

/**
 * Main validation function
 */
function validateProviders() {
  console.log('🔍 Validating verified_providers.json...\n');

  // Load files
  const providers = loadJSON(PROVIDERS_FILE);
  const schema = loadJSON(SCHEMA_FILE);

  let allValid = true;

  // Run validations
  console.log('1️⃣  JSON Schema Validation');
  if (!validateSchema(providers, schema)) {
    allValid = false;
  }
  console.log();

  console.log('2️⃣  Duplicate Detection');
  if (!checkDuplicates(providers)) {
    allValid = false;
  }
  console.log();

  console.log('3️⃣  Provider Type Validation');
  if (!validateProviderTypes(providers)) {
    allValid = false;
  }
  console.log();

  console.log('4️⃣  Service Category Validation');
  if (!validateServiceCategories(providers)) {
    allValid = false;
  }
  console.log();

  console.log('5️⃣  Geographic Distribution');
  checkGeographicDistribution(providers);
  console.log();

  console.log('6️⃣  Data Completeness');
  checkDataCompleteness(providers);
  console.log();

  // Final result
  if (allValid) {
    console.log('✅ All validations passed! Data is ready for integration.\n');
    console.log('📋 Next steps:');
    console.log('   1. Integrate verified_providers.json into backend data sources');
    console.log('   2. Create verifiedProvidersSearch.ts module');
    console.log('   3. Update providerRouting.ts to prioritize verified sources');
    console.log('   4. Add verified provider layer to Step 3 map (distinction from API results)');
    return 0;
  } else {
    console.log('❌ Validation failed. Please fix the issues above.\n');
    return 1;
  }
}

// Run validation
process.exit(validateProviders());
