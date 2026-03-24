const fs = require('fs');
const path = require('path');

const PROVIDERS_FILE = path.join(__dirname, '..', 'backend', 'data', 'verified_providers.json');

function normalizeNeed(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function deriveNeedsFromServices(services = []) {
  const needs = new Set();

  for (const service of services) {
    const category = String(service?.category || '').trim();
    const name = String(service?.name || '').toLowerCase();

    if (category) needs.add(category);
    if (category === 'disability_support') needs.add('ndis');

    if (name.includes('occupational')) needs.add('occupational_therapy');
    if (name.includes('speech')) needs.add('speech_pathology');
    if (name.includes('physio')) needs.add('physiotherapy');
    if (name.includes('diet')) needs.add('dietitian');
    if (name.includes('podiat')) needs.add('podiatry');
    if (name.includes('behaviour')) needs.add('behaviour_support');
    if (name.includes('therapy')) needs.add('therapy_supports');
    if (name.includes('nursing')) needs.add('nursing_support');
    if (name.includes('assistive')) needs.add('assistive_technology');
    if (name.includes('daily activit') || name.includes('daily life')) {
      needs.add('daily_living_support');
    }
    if (name.includes('supported independent living') || /\bsil\b/i.test(name)) {
      needs.add('supported_independent_living');
      needs.add('home_support');
      needs.add('daily_living_support');
    }
  }

  return Array.from(needs).map(normalizeNeed).filter(Boolean);
}

function run() {
  if (!fs.existsSync(PROVIDERS_FILE)) {
    console.error(`File not found: ${PROVIDERS_FILE}`);
    process.exit(1);
  }

  const providers = JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));
  let changed = 0;

  for (const provider of providers) {
    const existingNeeds = Array.isArray(provider.needs)
      ? provider.needs.map((need) => normalizeNeed(need)).filter(Boolean)
      : [];

    const derivedNeeds = deriveNeedsFromServices(provider.services || []);
    const mergedNeeds = Array.from(new Set([...existingNeeds, ...derivedNeeds]));

    if (mergedNeeds.length === 0) continue;

    const before = JSON.stringify(existingNeeds);
    const after = JSON.stringify(mergedNeeds);
    if (before !== after) {
      provider.needs = mergedNeeds;
      changed += 1;
    }
  }

  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(providers, null, 2), 'utf8');
  console.log(`Backfill complete. Updated providers: ${changed}. Total providers: ${providers.length}`);
}

run();
