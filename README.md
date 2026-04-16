# Pharmacy Tracker Application

## Project Overview

The **Pharmacy Tracker Application** is a web-based system designed to help users locate nearby pharmacies, check medicine availability, and make reservations in real time.

The system improves access to healthcare by providing:

- Location-based pharmacy search
- Medicine availability tracking
- Reservation and management features
- Administrative control over pharmacies and users

---

## Key Features

- Search for medicines across nearby pharmacies
- Geolocation-based pharmacy discovery
- Pharmacy inventory management (Pharmacist dashboard)
- Medicine reservation system
- Automatic reservation expiry
- Admin approval and user management
- Interactive map with route directions

---

## System Architecture

This project is built as a **Single-Page Application (SPA)** using a **Serverless/BaaS architecture** powered by Supabase.

- Thin frontend (client-side logic)
- Backend logic enforced at database level
- No traditional Node.js server required

---

## Frontend Stack

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **Routing:** React Router v6
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui (Radix UI primitives)

---

## Backend & Infrastructure (Supabase)

- **Database:** PostgreSQL 14 (Managed by Supabase)
- **API Layer:** Auto-generated REST API via PostgREST
- **Authentication:** Supabase Auth
- **Edge Functions:**
  - Pharmacy approval workflows
  - Admin user management

- **Automation:**
  - Database triggers (stock updates, ID generation)
  - Scheduled jobs using pg_cron (reservation expiry)

---

## Data & Security

- **Geospatial Support:** PostGIS
  - Stores pharmacy locations as `geography(Point, 4326)`

- **Security:** Row Level Security (RLS)
  - Ensures users only access authorized data

---

## Geolocation & Mapping

- **Location Detection:** Browser Geolocation API
- **Distance Calculation:** Haversine Formula (TypeScript)
- **Map Rendering:** React Leaflet (OpenStreetMap)
- **Routing:** OSRM API for directions

---

## Setup & Installation

### Prerequisites

- Node.js (v16 or higher recommended)
- npm

### Installation Steps

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```
