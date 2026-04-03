import json

with open('backend/data/verified_providers.json', 'r') as f:
    providers = json.load(f)

print("NDIS PROVIDERS DATA QUALITY AUDIT")
print("=" * 70)

# Find all NDIS providers
ndis_list = []
for provider in providers:
    name_lower = provider.get('name', '').lower()
    has_ndis_service = any(
        'ndis' in s.get('category', '').lower() 
        for s in provider.get('services', [])
    )
    
    if 'ndis' in name_lower or 'ndia' in name_lower or has_ndis_service:
        ndis_list.append(provider)

print(f"Total NDIS providers: {len(ndis_list)}")

# Validate address data
has_address = []
missing_address = []
for p in ndis_list:
    if p.get('address') and p.get('address').strip():
        has_address.append(p)
    else:
        missing_address.append(p)

print(f"NDIS providers with address: {len(has_address)}")
print(f"NDIS providers missing address: {len(missing_address)}")

# Melbourne NDIS providers with valid data
melbourne_ndis_with_data = []
for p in ndis_list:
    try:
        pc = int(p.get('postcode', 0))
        if 3000 <= pc <= 3999:
            # Check if it has complete critical fields
            name = p.get('name', '').strip()
            address = p.get('address', '').strip()
            lat = p.get('lat')
            lon = p.get('lon')
            phone = p.get('phone', '').strip()
            
            if all([name, address, lat is not None, lon is not None]):
                melbourne_ndis_with_data.append(p)
    except (ValueError, TypeError):
        pass

print(f"\nMelbourne NDIS providers (3000-3999) with complete data: {len(melbourne_ndis_with_data)}")

if melbourne_ndis_with_data:
    print("\nCompleteness check:")
    for p in melbourne_ndis_with_data:
        print(f"  ✓ {p.get('name')} ({p.get('postcode')})")
        print(f"    Address: {p.get('address')}")
        print(f"    Services: {[s.get('name') for s in p.get('services', [])]}")
        print()

# Try broader approach - disability_support category
print("\n" + "=" * 70)
print("ALTERNATIVE: Disability Support Providers (broader category)")
print("=" * 70)

disability_providers = []
for provider in providers:
    services_text = ' '.join([
        s.get('category', '').lower()
        for s in provider.get('services', [])
    ])
    
    if 'disability_support' in services_text:
        disability_providers.append(provider)

print(f"Total disability_support providers: {len(disability_providers)}")

# Filter to Melbourne
melbourne_disability = []
for p in disability_providers:
    try:
        pc = int(p.get('postcode', 0))
        if 3000 <= pc <= 3999:
            name = p.get('name', '').strip()
            address = p.get('address', '').strip()
            lat = p.get('lat')
            lon = p.get('lon')
            
            if all([name, address, lat is not None, lon is not None]):
                melbourne_disability.append(p)
    except (ValueError, TypeError):
        pass

print(f"Melbourne disability_support providers with complete data: {len(melbourne_disability)}")

if melbourne_disability:
    print(f"\nSample Melbourne disability support providers:")
    for p in melbourne_disability[:10]:
        services = [s.get('name') for s in p.get('services', [])][:2]
        print(f"  - {p.get('name')} ({p.get('postcode')})")
        print(f"    Services: {services}")
