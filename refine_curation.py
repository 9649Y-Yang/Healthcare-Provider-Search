import json
from collections import defaultdict, Counter
from typing import Dict, List, Set

# Read the file
with open('backend/data/verified_providers.json', 'r') as f:
    providers = json.load(f)

print(f"Total providers in file: {len(providers)}")

# Step 1: STRICT filter for ACTUAL NDIS providers - must have 'ndis' in name OR explicit 'ndis' service category
# Do NOT count generic 'disability_support' as NDIS-specific
ndis_providers = []

for provider in providers:
    name_lower = provider.get('name', '').lower()
    
    # Check for explicit NDIS keywords in name
    has_ndis_in_name = 'ndis' in name_lower or 'ndia' in name_lower
    
    # Check for explicit 'ndis' or 'NDIS' category in services (very specific)
    has_ndis_service = any(
        'ndis' in s.get('category', '').lower() 
        for s in provider.get('services', [])
    )
    
    if has_ndis_in_name or has_ndis_service:
        ndis_providers.append(provider)

print(f"Strict NDIS providers (name or service contains 'ndis'): {len(ndis_providers)}")

# If NDIS count is very low, relax slightly to include disability support providers
# but be selective about it
if len(ndis_providers) < 50:
    print("\nWARNING: Very few explicit NDIS providers found.")
    print("Expanding to include major disability support providers...")
    
    # Get disability service providers that appear to be NDIS-supporting
    major_keywords = {'disability support', 'ndis', 'disability services', 'support services'}
    
    for provider in providers:
        if provider in ndis_providers:
            continue
            
        name_lower = provider.get('name', '').lower()
        provider_type = provider.get('type', '').lower()
        
        # Add if it's a disability support organization
        has_disability_category = any(
            'disability' in s.get('category', '').lower()
            for s in provider.get('services', [])
        )
        
        if has_disability_category and provider_type in {'disability_support', 'community', 'ngo', 'services', 'organization'}:
            ndis_providers.append(provider)

print(f"After expansion: {len(ndis_providers)} potential NDIS providers")

# Step 2: Filter to Melbourne postcodes (3000-3999)
melbourne_ndis = []
for provider in ndis_providers:
    postcode = provider.get('postcode')
    if postcode:
        try:
            postcode_int = int(postcode)
            if 3000 <= postcode_int <= 3999:
                melbourne_ndis.append(provider)
        except (ValueError, TypeError):
            pass

print(f"Melbourne NDIS providers (postcodes 3000-3999): {len(melbourne_ndis)}")

# Step 3: Map service types and validate
postcodes_map: Dict[str, List[Dict]] = defaultdict(list)

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
    
    # Determine service type(s) - STRICT mapping to NDIS service types
    service_types = set()
    
    for service in provider.get('services', []):
        category = service.get('category', '').lower()
        name_service = service.get('name', '').lower()
        
        # Map to NDIS service types
        if any(x in category or x in name_service for x in ['therapy', 'physiotherapy', 'speech', 'occupational']):
            service_types.add('therapy')
        elif any(x in category or x in name_service for x in ['personal care', 'personal_care', 'domestic', 'home support']):
            service_types.add('personal_care')
        elif any(x in category or x in name_service for x in ['assistive', 'technology', 'equipment', 'aid']):
            service_types.add('assistive_tech')
        elif any(x in category or x in name_service for x in ['community', 'community_participation', 'social']):
            service_types.add('community_participation')
        elif any(x in category or x in name_service for x in ['behaviour', 'behavioral', 'psychology', 'mental health']):
            service_types.add('behaviour_support')
        elif any(x in category or x in name_service for x in ['lived experience', 'peer support', 'peer']):
            service_types.add('lived_experience_support')
        elif any(x in category or x in name_service for x in ['coordination', 'coordinator']):
            service_types.add('support_coordination')
        elif any(x in category or x in name_service for x in ['assessment', 'evaluation', 'planning']):
            service_types.add('assessment')
        elif any(x in category or x in name_service for x in ['training', 'education', 'skill']):
            service_types.add('training')
        elif any(x in category or x in name_service for x in ['employment', 'employment support', 'job']):
            service_types.add('employment_support')
        elif 'disability_support' in category or 'disability support' in name_service:
            # Generic catch-all - assign generic support category
            service_types.add('support_coordination')
    
    # Must have at least one identifiable NDIS service type
    if not service_types:
        continue
    
    # Calculate size/establishment score
    size_score = 0
    name_lower = name.lower()
    if any(x in name_lower for x in ['royal', 'hospital', 'university', 'health']):
        size_score += 3
    if any(x in name_lower for x in ['centre', 'center', 'services', 'network', 'council']):
        size_score += 2
    if any(x in name_lower for x in ['community', 'support']):
        size_score += 1
    
    postcodes_map[postcode].append({
        'name': name,
        'postcode': postcode,
        'address': address,
        'phone': phone,
        'website': website,
        'lat': lat,
        'lon': lon,
        'service_types': sorted(list(service_types)),
        'size_score': size_score,
        'id': provider.get('id', 'N/A')
    })

print(f"\nMelbourne postcodes with providers: {len(postcodes_map)}")
if postcodes_map:
    print(f"Postcodes: {sorted(postcodes_map.keys())}")

# Step 4: Select up to 3 providers per postcode with different service types
curated_providers: List[Dict] = []
postcodes_with_3 = 0
postcodes_with_2 = 0
postcodes_with_1 = 0
selection_issues = []

for postcode in sorted(postcodes_map.keys()):
    providers_in_postcode = postcodes_map[postcode]
    
    # Sort by size score (descending) then by name
    providers_in_postcode.sort(key=lambda x: (-x['size_score'], x['name']))
    
    # Greedy selection: pick up to 3 with different primary service types
    selected = []
    used_service_types: Set[str] = set()
    
    for candidate in providers_in_postcode:
        if len(selected) >= 3:
            break
            
        # Get primary service type for this candidate
        primary_type = candidate['service_types'][0] if candidate['service_types'] else 'support_coordination'
        
        if primary_type not in used_service_types:
            selected.append(candidate)
            used_service_types.add(primary_type)
    
    # Track what we selected
    if len(selected) == 3:
        postcodes_with_3 += 1
    elif len(selected) == 2:
        postcodes_with_2 += 1
    elif len(selected) == 1:
        postcodes_with_1 += 1
        selection_issues.append(f"Postcode {postcode}: Only 1 provider found with different service type")
    
    # Add to output
    for provider_data in selected:
        curated_providers.append({
            'name': provider_data['name'],
            'postcode': provider_data['postcode'],
            'address': provider_data['address'],
            'service_type': provider_data['service_types'][0],
            'phone': provider_data['phone'],
            'website': provider_data['website'],
            'lat': provider_data['lat'],
            'lon': provider_data['lon']
        })

print(f"\n=== CURATION SUMMARY ===")
print(f"Postcodes with 3 providers: {postcodes_with_3}")
print(f"Postcodes with 2 providers: {postcodes_with_2}")
print(f"Postcodes with 1 provider: {postcodes_with_1}")
print(f"Total curated providers: {len(curated_providers)}")
print(f"Unique postcodes covered: {len(set(p['postcode'] for p in curated_providers))}")

# Output curated providers
output_file = 'backend/data/curated_ndis_providers_melbourne.json'
with open(output_file, 'w') as f:
    json.dump(curated_providers, f, indent=2)

print(f"\nCurated providers exported to: {output_file}")

# Print detailed sample
print(f"\n=== DETAILED SAMPLE ===")
for i, provider in enumerate(curated_providers[:15], 1):
    print(f"{i}. {provider['name']}")
    print(f"   Postcode: {provider['postcode']}")
    print(f"   Service Type: {provider['service_type']}")
    print(f"   Address: {provider['address']}")
    print(f"   Phone: {provider['phone']}")
    print(f"   Lat/Lon: {provider['lat']}, {provider['lon']}")
    print()

# Report issues
if selection_issues:
    print(f"\n=== QUALITY ISSUES ({len(selection_issues)}) ===")
    for issue in selection_issues[:10]:
        print(f"  ⚠ {issue}")
    if len(selection_issues) > 10:
        print(f"  ... and {len(selection_issues) - 10} more")
