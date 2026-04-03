import json

with open('backend/data/verified_providers.json', 'r') as f:
    providers = json.load(f)

print("NDIS providers found in the file:")
print("=" * 60)

ndis_list = []
for provider in providers:
    name_lower = provider.get('name', '').lower()
    has_ndis_service = any(
        'ndis' in s.get('category', '').lower() 
        for s in provider.get('services', [])
    )
    
    if 'ndis' in name_lower or 'ndia' in name_lower or has_ndis_service:
        ndis_list.append(provider)

for i, p in enumerate(ndis_list, 1):
    print(f"{i}. {p.get('name')}")
    print(f"   ID: {p.get('id')}")
    print(f"   Postcode: {p.get('postcode')}")
    print(f"   Address: {p.get('address')}")
    print(f"   Type: {p.get('type')}")
    services = [s.get('name') for s in p.get('services', [])]
    print(f"   Services: {services[:3] if services else 'None'}")
    print()

print(f"Total strict NDIS providers: {len(ndis_list)}")
print(f"\nPostcodes for these providers: {sorted(set(str(p.get('postcode')) for p in ndis_list))}")

# Check what postcodes exist in the data
print("\n\nAll Melbourne postcode ranges (3000-3999) in dataset:")
melbourne_postcodes = {}
for provider in providers:
    try:
        pc = int(provider.get('postcode', 0))
        if 3000 <= pc <= 3999:
            if pc not in melbourne_postcodes:
                melbourne_postcodes[pc] = []
            melbourne_postcodes[pc].append(provider.get('name'))
    except (ValueError, TypeError):
        pass

print(f"Total Melbourne postcodes with providers: {len(melbourne_postcodes)}")
if melbourne_postcodes:
    print(f"Postcodes: {sorted(melbourne_postcodes.keys())[:20]}")
    for pc in sorted(melbourne_postcodes.keys())[:5]:
        print(f"  {pc}: {len(melbourne_postcodes[pc])} providers (sample: {melbourne_postcodes[pc][0]})")
