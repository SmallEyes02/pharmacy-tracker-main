<<<<<<< HEAD

# Welcome to Pharmacy Locator Web app

## Project info

_Project title:_ Pharmacy Tracker Application
*Description:*loading
*Features:*loading and you would love them

## Technical Architecture & Stack

This project is built as a highly performance Single-Page Application (SPA) utilizing a Serverless/BaaS (Backend-as-a-Service) architecture. By leveraging Supabase, the system maintains a thin client-side logic layer with a robust, secure database-level enforcement layer.

## Frontend Development

_Core Framework:_ React 18 with TypeScript for type-safe development.
_Build Tool:_ Vite (configured for SPA with client-side routing via React Router v6).
_Styling & UI:_ Tailwind CSS: Utility-first styling for rapid UI development.
_shadcn/ui:_ Accessible, headless components built on Radix UI primitives.

## Backend & Infrastructure (Supabase Ecosystem)

-The application utilizes a decentralized backend approach, removing the need for a traditional middleware server (Express/Node.js).

_API Layer_: PostgREST (Supabase) provides an auto-generated, performant REST API directly from the database schema.

_Compute:_ Supabase Edge Functions (Deno/TypeScript) handle privileged operations, including:_Pharmacy approval workflows_ and
_Administrative user management._

_Automation:_ Database Triggers: Real-time business logic (stock decrement, reference generation).

_pg_cron:_ Scheduled tasks, specifically hourly reservation expiry checks.

## Data Management

_Database:_ PostgreSQL 14 (Supabase Managed).

_Geospatial Data:_ PostGIS Extension for handling geographic coordinates.
Pharmacy locations are stored using geography(Point, 4326).

_Security:_ Row Level Security (RLS) policies ensure that data access is restricted at the database level based on the authenticated user's identity.

## Geolocation & Mapping-

The system implements a custom geospatial engine to handle proximity searches and route visualization.
_Distance Logic:_ Acquisition: Browser Geolocation API (Network coarse fix- GPS refinement).
_Calculation:_ TypeScript implementation of the Haversine Formula for great-circle distance.
_Decoding:_ Client-side parsing of PostGIS EWKB hex coordinates.*Visuals & Routing:*React Leaflet: For interactive map rendering using OpenStreetMap (OSM) tiles.OSRM API: Used for walking route calculations and turn-by-turn directions.
**URL**:

## How to edit this code?

**Use your preferred IDE**

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Setup instructions,Follow these steps:

# Step 1: Install the necessary dependencies.

npm i

# Step 2: Start the development server with auto-reloading and an instant preview.

npm run dev

```

# pharmacy-tracker-main

Locator system to view nearby pharmacies for your medical needs.

> > > > > > > adf16d65bbe8ccc41f59aa5145d69a84468211ac
```
