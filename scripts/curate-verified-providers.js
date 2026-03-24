const fs = require('fs');
const path = require('path');

const PROVIDERS_FILE = path.join(__dirname, '..', 'backend', 'data', 'verified_providers.json');

const REMOVE_EXACT_NAMES = new Set([
  'STABILISE PTY LTD',
  'Nexus Bookkeeping (Aust) Pty Ltd',
  'Jnr Life Pty. Ltd.',
  'BEDGUARD PTY LTD',
  'NATIONAL AUSTRALIAN NAPPIES (NAN) PTY. LTD.',
  'WENTWORTH CARE FURNITURE PTY LTD',
  'CHARTER MAXI TAXI PTY LTD',
  'Mr Trampoline Pty Ltd',
  'MACLIM PTY LTD',
  'Fitness & Health Geelong Pty Ltd',
  'Norden Body Works Pty Ltd',
  'Traverse IT Pty Ltd',
  'LIGHTWAVE TRADING AUSTRALIA PTY. LTD.',
  'The Trustee for Twil Family Trust',
  'NORTH RICHMOND COMMUNITY HEALTH LIMITED',
  'The Trustee for Metro Baby Trust',
  'SEVENTY2 CONSTRUCTIONS PTY LTD',
  'MAKER CONSTRUCTIONS PTY LTD',
  'RONYAS CONSTRUCTION PTY LTD',
  'SILVER LAKE CONSTRUCTIONS PTY LTD',
  'SALIMCO CONSTRUCTIONS PTY LTD',
  'GREENLEAVES GARDENING & LANDSCAPING PTY LTD',
  'Furniture for Backs Pty. Ltd.',
  'The Trustee for Wilding Foods Unit Trust',
  'The Trustee for Bariatric Essentials Unit Trust',
  "WOMAN'S WAY CLEANING SERVICES PTY. LTD.",
  'Specialised Trauma Cleaning Services Pty Ltd',
  'EARTH CLEANING PTY LTD',
  'Melbourne Metro Commercial Cleaning Pty Ltd',
  'Miss Bella Cleaning Services Pty Ltd',
  'A.J COLVIN & E.F COLVIN',
  'DIGITAL BRAND BUILDERS PTY. LTD.',
  'Campbells Construction Technology Pty Ltd',
]);

const NON_HEALTH_NAME_KEYWORDS = [
  'bookkeeping',
  'accountants',
  'taxi',
  'trampoline',
  'furniture',
  'mowing',
  'building',
  'landscaping',
  'gym',
  'fitness',
  'nappies',
  'driving school',
  'asset management',
  'construction',
  'constructions',
  'cleaning',
  'commercial cleaning',
  'landscaping',
  'gardening',
  'baby',
  'metro-baby',
  'foods',
  'food',
  'catering',
  'meal',
  'furniture',
  'flooring',
  'wilding',
  'befitfood',
];

const HEALTH_HINT_KEYWORDS = [
  'health',
  'medical',
  'disability',
  'ndis',
  'care',
  'therapy',
  'physio',
  'psychology',
  'occupational',
  'speech',
  'allied',
  'clinic',
  'hearing',
  'orthotic',
  'prosthetic',
];

function normalizeNeed(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hasKeyword(value, keywords) {
  const text = String(value || '').toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
}

function shouldRemoveProvider(provider) {
  if (provider.source !== 'ndis_commission') {
    return false;
  }

  const name = String(provider.name || '');
  const website = String(provider.website || '');

  if (REMOVE_EXACT_NAMES.has(name)) {
    return true;
  }

  const nonHealthSignal =
    hasKeyword(name, NON_HEALTH_NAME_KEYWORDS) || hasKeyword(website, NON_HEALTH_NAME_KEYWORDS);
  const hasHealthSignal =
    hasKeyword(name, HEALTH_HINT_KEYWORDS) ||
    hasKeyword(website, HEALTH_HINT_KEYWORDS) ||
    hasKeyword((provider.services || []).map((service) => service.name).join(' '), HEALTH_HINT_KEYWORDS);

  if (nonHealthSignal && !hasHealthSignal) {
    return true;
  }

  const hasOnlyGenericNeeds =
    Array.isArray(provider.needs) &&
    provider.needs.length > 0 &&
    provider.needs.every((need) => ["disability_support", "ndis"].includes(normalizeNeed(need)));

  if (hasOnlyGenericNeeds && nonHealthSignal) {
    return true;
  }

  return false;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeStrings(values) {
  return Array.from(new Set(values.map((value) => normalizeNeed(value)).filter(Boolean)));
}

function curate() {
  const providers = JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8'));

  const removedProviders = [];
  const keptProviders = [];

  for (const provider of providers) {
    if (shouldRemoveProvider(provider)) {
      removedProviders.push({ id: provider.id, name: provider.name, website: provider.website || '' });
      continue;
    }
    keptProviders.push(provider);
  }

  let renamedCount = 0;
  let nrchUpdated = 0;

  for (const provider of keptProviders) {
    if (provider.name === 'The Trustee for Zuccolo Gottardo Family Trust') {
      provider.name = 'CASA MIA CARE SERVICES';
      provider.legal_name = 'The Trustee for Zuccolo Gottardo Family Trust';
      provider.collection_notes = provider.collection_notes
        ? `${provider.collection_notes} Trading name surfaced from provider website.`
        : 'Trading name surfaced from provider website.';
      renamedCount++;
    }

    if (provider.id === 'VIC_021' && provider.name === 'North Richmond Community Health (NRCH)') {
      provider.services = [
        { name: 'Nutrition and Dietetics (NDIS)', category: 'allied_health' },
        { name: 'Occupational Therapy (NDIS)', category: 'allied_health' },
        { name: 'Speech Pathology (NDIS)', category: 'allied_health' },
      ];
      provider.needs = dedupeStrings([
        'allied_health',
        'disability_support',
        'ndis',
        'nutrition',
        'dietitian',
        'occupational_therapy',
        'speech_pathology',
        'therapy_supports',
      ]);

      const pages = ensureArray(provider.source_pages);
      if (!pages.includes('https://nrch.com.au/services/childrens-therapies/')) {
        pages.push('https://nrch.com.au/services/childrens-therapies/');
      }
      provider.source_pages = pages;
      provider.collection_notes =
        'NDIS service scope narrowed to Nutrition and Dietetics, Occupational Therapy, and Speech Pathology based on NRCH Children\'s Therapies page.';
      nrchUpdated++;
    }
  }

  fs.writeFileSync(PROVIDERS_FILE, JSON.stringify(keptProviders, null, 2), 'utf8');

  console.log('Curated provider dataset:');
  console.log(`  Removed providers: ${removedProviders.length}`);
  console.log(`  Renamed providers: ${renamedCount}`);
  console.log(`  NRCH updates:      ${nrchUpdated}`);

  if (removedProviders.length > 0) {
    console.log('\nRemoved entries:');
    for (const removed of removedProviders) {
      console.log(`  - ${removed.id} | ${removed.name} | ${removed.website}`);
    }
  }
}

curate();
