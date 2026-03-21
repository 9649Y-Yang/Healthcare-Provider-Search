# Healthcare Provider Search (Victoria)

A local, data-driven eligibility search tool for Victorian aged care and disability support services (CHSP / HACC / NDIS-related).

## Run locally

### 1) Backend

```powershell
cd backend
npm install
npm run dev
```

Backend API runs on `http://localhost:3000`.

### 2) Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:5173` and proxies `/api` to backend.

## API update workflow

### Manual dataset update

- Endpoint: `POST /api/update`
- Body: `{ services: Service[], apply: boolean }`
- Returns diff: `{ added, removed, updated }`

### Automated fetch + validation + save action

- Endpoint: `POST /api/update/auto`
- Purpose: fetch latest services from configured sources, run structural/trust checks, diff against DB, optionally apply.

Request body:

```json
{
  "sources": ["https://example.com/services.json"],
  "apply": false,
  "allowWarnings": false
}
```

Notes:

- `sources` is optional if `backend/data/update_sources.json` contains a `sources` array.
- If validation warnings exist and `allowWarnings` is `false`, API returns `422` and does not write to DB.
- Set `apply: true` to save fetched services to SQLite after preview.

Validation checks include:

- required service shape (`name`, `needs`, `eligibility` normalization)
- `source_url` URL format
- trusted source heuristics for healthcare/government domains
- descriptive quality warnings (for example very short descriptions)
