# Breakroom

A location-based community platform for sharing workplace experiences in New York City. Users can explore businesses on an interactive map, share salary and role data, post stories, and discover neighborhood-level insights about workplaces.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Mobile App                      │
│         (Capacitor — iOS & Android)              │
├─────────────────────────────────────────────────┤
│                                                  │
│   React 18 + TypeScript + Vite                   │
│   ├── MobileApp (3-slide swipeable carousel)     │
│   │   ├── SettingsPage   — job history mgmt      │
│   │   ├── HomePage       — map + search          │
│   │   └── ExplorePage    — community feed        │
│   │                                              │
│   ├── MapLibre + Deck.GL — interactive map       │
│   │   ├── Custom vector tiles (.pbf)             │
│   │   ├── GeoJSON NYC boundaries                 │
│   │   └── Viewport-based business loading        │
│   │                                              │
│   ├── Smart Search                               │
│   │   ├── DataMuse API (term expansion)          │
│   │   ├── Fuse.js (fuzzy matching)               │
│   │   ├── Hospitality synonym index              │
│   │   └── Supabase RPC (trigram + spatial)       │
│   │                                              │
│   └── UI: shadcn/ui + Tailwind + Framer Motion  │
│                                                  │
├─────────────────────────────────────────────────┤
│                  Supabase                        │
│   ├── Auth (device-based identity)               │
│   ├── PostGIS (spatial queries)                  │
│   ├── Tables: businesses, business_roles, posts, │
│   │   votes, role_votes, profiles,               │
│   │   current_jobs, past_jobs                    │
│   ├── RPC: spatial search, global text search    │
│   └── RLS policies per table                     │
└─────────────────────────────────────────────────┘
```

## Getting Started

Requires Node.js (install with [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
git clone https://github.com/acvetne9/breakroom.git
cd breakroom
npm i
npm run dev
```

The dev server runs on `http://localhost:8080`.

### Mobile Builds

```sh
npx cap sync
npx cap open android   # or: npx cap open ios
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion |
| **Maps** | MapLibre GL, Deck.GL, Turf.js, Supercluster, custom .pbf vector tiles |
| **Search** | DataMuse API, Fuse.js, string-similarity, hospitality synonym index |
| **Backend** | Supabase (PostgreSQL + PostGIS + Auth + RLS) |
| **Mobile** | Capacitor v7 (iOS & Android) |
| **Data** | @tanstack/react-query, session caching, optimistic updates |
