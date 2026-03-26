# Healthcare Provider Search (Victoria)

A web application that helps people in Victoria, Australia discover relevant healthcare, aged care, and disability support pathways, then find nearby providers by postcode or detailed address.

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/9649Y-Yang/Healthcare-Provider-Search/actions)
[![Status](https://img.shields.io/badge/status-active-success)](https://github.com/9649Y-Yang/Healthcare-Provider-Search)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#-license)

## 🎯 Features

- **Step-based eligibility flow**: answer core questions to determine suitable service pathways
- **Service matching**: map user profile inputs to healthcare support categories
- **Provider search by postcode or address**: find nearby providers within a configurable radius
- **Interactive map-area filtering**: pan/zoom and click **Search in this area** to refresh list results for the current viewport
- **Verified provider integration**: curated provider data for healthcare, disability/NDIS, and aged-care services
- **Improved aged-care matching**: aged-care service selections are mapped to aged-care providers and sub-needs (assessment, home support, residential care, respite, carer support)
- **Click-to-open tooltips**: Step 1 explanations open on icon click and close when clicking outside
- **Data update workflows**: preview and apply manual or automated service catalog updates

## 🎬 Demo GIF

> Add your recorded walkthrough GIF to make this section shine.

![Healthcare Provider Search Demo](https://via.placeholder.com/1200x650.png?text=Add+Demo+GIF+URL+Here)

Recommended: replace this URL with a GIF hosted on GitHub assets, Giphy, or Cloudinary.

## 🖼️ Screenshots

### Eligibility and service matching flow

![Eligibility Flow](frontend/src/assets/hero.png)

### Map and provider results

![Provider Map Results](https://via.placeholder.com/1200x700.png?text=Add+Provider+Map+Screenshot)

### Service selection and filters

![Service Selection](https://via.placeholder.com/1200x700.png?text=Add+Service+Selection+Screenshot)

## 🛠️ Tech Stack

### Backend
- **Node.js + TypeScript**
- **Express.js** API
- **sql.js** (SQLite-compatible storage in file)
- **CORS**

### Frontend
- **React** + **TypeScript**
- **Vite**
- **Leaflet** for map display and viewport-aware filtering

### Data / Automation
- Local JSON datasets and SQLite file storage
- Optional Playwright script for automated NDIS provider export/download workflows

## 📋 Prerequisites

- Node.js (v18+ recommended)
- npm (v8+)

## 🚀 Getting Started

### 1) Backend setup

```bash
cd backend
npm install
npm run dev
```

Backend runs on: `http://localhost:3000`

### 2) Frontend setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: `http://localhost:5173` and proxies `/api` to backend.

## 📖 User Flow

1. **Step 1 – Eligibility basics**
   - Enter age, location type, and key eligibility responses.
2. **Step 2 – Service pathway selection**
   - Review matched service categories and select relevant options.
3. **Step 3 – Provider search**
   - Enter a Victorian postcode or detailed address, choose radius, then view providers on map/list.
   - Pan/zoom map and use **Search in this area** to filter to current viewport.

## 🔌 API Endpoints

### Core
- `GET /api/services` — load available service catalog
- `GET /api/needs` — list needs across active services
- `POST /api/eligibility` — return matched services for a profile
- `POST /api/providers/search` — search nearby providers by postcode **or** address + selected services

### Data update
- `POST /api/update` — manual update preview/apply
- `POST /api/update/auto` — fetch + validate + preview/apply from configured sources

### Auto-refresh status
- `GET /api/update/status` — view current auto-refresh state
- `POST /api/update/refresh-now` — trigger immediate refresh from configured sources

## 🔄 Data Update Workflow

### Provider search request example

`POST /api/providers/search`

```json
{
   "postcode": "3000",
   "serviceIds": [20],
   "radiusKm": 25
}
```

or

```json
{
   "address": "300 Grattan Street, Parkville VIC",
   "serviceIds": [20],
   "radiusKm": 10
}
```

### Manual update

`POST /api/update`

```json
{
  "services": [],
  "apply": false
}
```

- `apply: false` → preview diff only
- `apply: true` → save to database

### Automated update

`POST /api/update/auto`

```json
{
  "sources": ["https://example.com/services.json"],
  "apply": false,
  "allowWarnings": false,
  "agentLevel": 1
}
```

Notes:
- If `sources` is omitted, backend loads from `backend/data/update_sources.json`.
- If validation warnings exist and `allowWarnings` is `false`, response is blocked (`422`).
- Use `apply: true` to commit fetched services.

## 📁 Project Structure

```text
Healthcare Provider Search/
├── backend/
│   ├── data/
│   │   ├── seed_services.json
│   │   ├── verified_providers.json
│   │   └── services.sqlite
│   ├── src/
│   │   ├── index.ts
│   │   ├── db.ts
│   │   ├── rules.ts
│   │   ├── providerSearch.ts
│   │   └── verifiedProvidersSearch.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── ProviderMap.tsx
│   └── package.json
└── scripts/
    ├── download-ndis-providers-playwright.js
    ├── import-ndis-providers.js
   ├── enrich-aged-care-providers.js
    └── validate-*.js
```

## 🧪 Useful Commands

### Backend

```bash
cd backend
npm run dev
npm run build
npm run start
npm run seed
```

### Frontend

```bash
cd frontend
npm run dev
npm run build
npm run preview
```

### Scripts (optional)

```bash
cd scripts
npm install
npm run download:ndis
```

## 📝 Notes

- Database persists locally at `backend/data/services.sqlite`.
- Verified providers are loaded from `backend/data/verified_providers.json`.
- Provider lookup supports postcode and detailed address geocoding.
- Provider search routing prioritises: **verified dataset → NHSD → Google Places → OpenStreetMap**.
- Step 3 aged-care selections are mapped to aged-care-specific provider needs to reduce unrelated NDIS results.
- This project is currently scoped to **Victoria (VIC), Australia**.

## 📄 License

MIT
