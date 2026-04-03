import json
from collections import Counter

with open('backend/data/verified_providers.json', 'r') as f:
    providers = json.load(f)

print("Sampling service categories to understand data coverage:")
categories = Counter()
for provider in providers[:1000]:
    for service in provider.get('services', []):
        cat = service.get('category', 'none')
        categories[cat] += 1

print("Top 30 service categories:")
for cat, count in categories.most_common(30):
    print(f"  {cat}: {count}")

print("\n\nProviders with 'NDIS' keyword:")
ndis_count = 0
disability_count = 0

for provider in providers:
    name_lower = provider.get('name', '').lower()
    if 'ndis' in name_lower:
        ndis_count += 1
        if ndis_count <= 3:
            print(f"  NDIS: {provider.get('name')} (postcode: {provider.get('postcode')})")

for provider in providers:
    name_lower = provider.get('name', '').lower()
    services_text = ' '.join([
        s.get('name', '').lower() + ' ' + s.get('category', '').lower()
        for s in provider.get('services', [])
    ])
    if 'disability' in name_lower or 'disability' in services_text:
        disability_count += 1
        if disability_count <= 3:
            print(f"  Disability: {provider.get('name')} (postcode: {provider.get('postcode')})")

print(f"\nProviders with 'NDIS' in name: {ndis_count}")
print(f"Providers with 'disability' keyword: {disability_count}")
