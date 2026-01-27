# Lipa-Cart Backend — Project Context

> This file is the living context document for the Lipa-Cart backend (Strapi CMS). Update it as the project evolves.

## Overview

Lipa-Cart is a grocery delivery app for East Africa (Uganda/Kenya). This repository (`LC`) is the **Strapi 5 backend** that serves as the CMS API for product catalog, categories, recipes, shoppers, and riders. The Flutter frontend lives in a separate repo (`Lipa-Cart`).

## Architecture

```
Flutter App
├── Strapi (this repo) — CMS API for content (products, categories, recipes, shoppers, riders)
└── Supabase — Auth (OTP), realtime order tracking, storage, user data (orders, cart, addresses)
    └── PostgreSQL (shared database)
```

- **Strapi** manages read-heavy, admin-curated content
- **Supabase** handles auth, user-specific data, and realtime features

## Tech Stack

| Layer       | Technology              |
|-------------|------------------------|
| CMS         | Strapi 5.33.4          |
| Language    | TypeScript             |
| Database    | SQLite (dev) / PostgreSQL via Supabase (prod) |
| Node        | >=20.0.0               |
| Package Mgr | npm                    |

## Project Structure

```
LC/
├── config/          # Strapi configuration (database, server, admin, plugins)
├── database/        # Database migrations
├── public/          # Static assets
├── scripts/         # Utility scripts (seed.js)
├── src/
│   ├── admin/       # Admin panel customization
│   ├── api/         # Content-type APIs (routes, controllers, services)
│   ├── components/  # Shared Strapi components
│   ├── extensions/  # Plugin extensions
│   └── index.ts     # App bootstrap
├── types/           # TypeScript type definitions
└── dist/            # Build output
```

## Current API Content Types

> Starter template types removed (about, article, author, category, global) along with seed data.

> Target content types for Lipa-Cart:
- **Product** — name, slug, description, price, original_price, unit, min/max quantity, availability, featured flag, rating, images, tags, category relation
- **Category** — name, slug, description, image, color, sort_order, is_active, products relation
- **Recipe** — name, slug, description, image, author, prep/cook time, servings, difficulty, rating, ingredients (component), instructions (component), tags
- **Shopper** — name, phone, email, profile_image, is_active, rating
- **Rider** — name, phone, email, profile_image, vehicle_type, vehicle_plate, is_active, rating

## Key Commands

```bash
npm run dev        # Start Strapi in development mode (with auto-reload)
npm run build      # Build admin panel
npm run start      # Start Strapi in production mode
npm run seed:example  # Run seed script
```

## Environment & Config

- Dev DB: SQLite (built-in, `better-sqlite3`)
- Prod DB: Supabase PostgreSQL (requires `pg` package + env vars)
- Required prod env vars: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`

## Frontend Integration

- Flutter app at `/Users/daphnepearl/Documents/Lipa-Cart`
- Frontend context: `/Users/daphnepearl/Documents/Lipa-Cart/claude.md`
- API consumed via REST: `{STRAPI_URL}/api/{content-type}?populate=*`
- Public role permissions needed: `find` and `findOne` for Products, Categories, Recipes; `find` for Shoppers, Riders

## Currency & Localization

- Currency: UGX (Uganda Shilling)
- Phone format: +256 (Uganda)
- Region: East Africa

## Status / Progress

- [x] Strapi project initialized (v5.33.4)
- [x] Remove starter template content types (about, article, author, global) + seed data
- [ ] Create Product content type
- [ ] Create Category content type (adapt existing)
- [ ] Create Recipe content type
- [ ] Create Shopper content type
- [ ] Create Rider content type
- [ ] Configure public API permissions
- [ ] Add PostgreSQL support for production
- [ ] Seed database with sample data
- [ ] Deploy Strapi (Render/Railway)

## Notes

<!-- Add development notes, decisions, and gotchas here -->
