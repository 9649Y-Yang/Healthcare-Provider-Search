import json
from collections import defaultdict
from typing import Dict, List, Set, Tuple, Optional

# Read the file
with open('backend/data/verified_providers.json', 'r') as f:
    providers = json.load(f)

print(f"Total providers in file: {len(providers)}")

# Step 1: Filter NDIS providers (with "ndis" or "disability" in description/services)
ndis_providers = []
ndis_keywords = {'ndis', 'disability', 'participants support', 'supported accommodation', 'disability support'}

for provider in providers:
    # Check name
    name_lower = provider.get('name', '').lower()
    
    # Check services
    services_text = ' '.join([
        s.get('name', '').lower() + ' ' + s.get('category', '').lower()
        for s in provider.get('services', [])
    ])
    
    # Check if provider has NDIS or disability keywords
    has_ndis = any(kw in name_lower or kw in services_text for kw in ndis_keywords)
    
    if has_ndis:
        ndis_providers.append(provider)

print(f"NDIS providers found: {len(ndis_providers)}")

# Step 2: Filter to Melbourne postcodes (3000-3999)
melbourne_ndis = []
for provider in ndis_providers:
    postcode = provider.get('postcode')
    if postcode and isinstance(postcode, str):
        try:
            postcode_int = int(postcode)
            if 3000 <= postcode_int <= 3999:
                melbourne_ndis.append(provider)
        except (ValueError, TypeError):
            pass
    elif postcode and isinstance(postcode, int):
        if 3000 <= postcode <= 3999:
            melbourne_ndis.append(provider)

print(f"Melbourne NDIS providers (postcodes 3000-3999): {len(melbourne_ndis)}")

# Step 3: Map valid NDIS service types to providers
valid_ndis_service_types = {
    'therapy', 'personal_care', 'assistive_technology', 'assistive_tech',
    'community_participation', 'behaviour_support', 'lived_experience_support',
    'support_coordination', 'assessment', 'training', 'employment_support'
}

# Group by postcode
postcodes_map: Dict[str, List[Dict]] = defaultdict(list)
size_indicators = {
    'large': {'royal', 'hospital', 'university', 'council', 'community', 'services', 'centre'},
    'established': {'centre', 'services', 'organization', 'support', 'network'}
}

for provider in melbourne_ndis:
    # Validate critical fields
    name = provider.get('name', '').strip()
    address = provider.get('address', '').strip()
    postcode = str(provider.get('postcode', '')).strip()
    phone = provider.get('phone', '').strip()
    website = provider.get('website', '').strip()
    lat = provider.get('lat')
    lon = provider.get('lon')
    
    # Remove if missing critical fields
    if not all([name, address, postcode, lat is not None, lon is not None]):
        continue
    
    # Determine service type(s) from services
    service_types = set()
    for service in provider.get('services', []):
        category = service.get('category', '').lower()
        name_service = service.get('name', '').lower()
        
        # Check if category or name contains valid service type keywords
        if 'therapy' in category or 'therapy' in name_service or 'physiotherapy' in name_service:
            service_types.add('therapy')
        elif 'personal' in category or 'personal care' in name_service or 'domestic' in name_service:
            service_types.add('personal_care')
        elif 'assistive' in category or 'assistive' in name_service or 'technology' in name_service or 'equipment' in name_service:
            service_types.add('assistive_tech')
        elif 'community' in category or 'community' in name_service:
            service_types.add('community_participation')
        elif 'behaviour' in category or 'behaviour' in name_service or 'psychology' in name_service or 'mental' in name_service:
            service_types.add('behaviour_support')
        elif 'lived' in category or 'peer' in name_service:
            service_types.add('lived_experience_support')
        elif 'coordination' in category or 'coordination' in name_service:
            service_types.add('support_coordination')
        elif 'assessment' in category or 'assessment' in name_service or 'planning' in name_service:
            service_types.add('assessment')
        elif 'training' in category or 'training' in name_service or 'skill' in name_service:
            service_types.add('training')
        elif 'employment' in category or 'employment' in name_service or 'job' in name_service:
            service_types.add('employment_support')
    
    # If no service type found, skip
    if not service_types:
        continue
    
    # Calculate size score (prefer larger providers)
    size_score = 0
    name_lower = name.lower()
    if any(indicator in name_lower for indicator in size_indicators['large']):
        size_score += 2
    if any(indicator in name_lower for indicator in size_indicators['established']):
        size_score += 1
    
    postcodes_map[postcode].append({
        'name': name,
        'postcode': postcode,
        'address': address,
        'phone': phone,
        'website': website,
        'lat': lat,
        'lon': lon,
        'service_types': list(service_types),
        'size_score': size_score,
        'provider_obj': provider
    })

print(f"\nMelbourne postcodes with NDIS providers: {len(postcodes_map)}")
print(f"\nPostcodes with coverage: {sorted(postcodes_map.keys())[:30]}")
print(f"Total postcodes with NDIS: {len(postcodes_map)}")

# Step 4: Select 3 providers per postcode with different service types
curated_providers: List[Dict] = []
postcodes_with_3 = 0

for postcode in sorted(postcodes_map.keys()):
    providers_in_postcode = postcodes_map[postcode]
    
    # Sort by size score (descending) then by name (for consistency)
    providers_in_postcode.sort(key=lambda x: (-x['size_score'], x['name']))
    
    # Select up to 3 with different service types
    selected = []
    used_service_types: Set[str] = set()
    
    for candidate in providers_in_postcode:
        # Check if candidate has any service types not yet used
        new_types = set(candidate['service_types']) - used_service_types
        
        if new_types and len(selected) < 3:
            selected.append(candidate)
            used_service_types.update(new_types)
    
    # Add selected providers to output
    for provider_data in selected:
        curated_providers.append({
            'name': provider_data['name'],
            'postcode': provider_data['postcode'],
            'address': provider_data['address'],
            'service_type': provider_data['service_types'][0],  # Primary service type
            'phone': provider_data['phone'],
            'website': provider_data['website'],
            'lat': provider_data['lat'],
            'lon': provider_data['lon']
        })
    
    if len(selected) == 3:
        postcodes_with_3 += 1

print(f"\n=== CURATION RESULTS ===")
print(f"Postcodes with exactly 3 providers: {postcodes_with_3}")
print(f"Total curated providers: {len(curated_providers)}")
print(f"Total unique postcodes covered: {len(set(p['postcode'] for p in curated_providers))}")

# Output the curated providers
output_file = 'backend/data/curated_ndis_providers_melbourne.json'
with open(output_file, 'w') as f:
    json.dump(curated_providers, f, indent=2)

print(f"\nCurated providers saved to: {output_file}")

# Print sample
print(f"\n=== SAMPLE (First 10 providers) ===")
for i, provider in enumerate(curated_providers[:10], 1):
    print(f"{i}. {provider['name']} ({provider['postcode']}) - {provider['service_type']}")
    print(f"   Address: {provider['address']}")
    print(f"   Phone: {provider['phone']}")
