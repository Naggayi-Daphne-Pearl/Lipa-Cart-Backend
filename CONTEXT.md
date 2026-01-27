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
  - Project: `cusjbtbacxfpbuwafgzy`
  - URL: `https://cusjbtbacxfpbuwafgzy.supabase.co`

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

Only catalog/content data lives in Strapi. Transactional/user data (users, orders, payments, ratings, addresses) stays in Supabase.

- **Category** — name, slug, description, image, color, sort_order, is_active; has many Subcategories & Products
- **Subcategory** — name, slug, description, image, sort_order, is_active; belongs to Category, has many Products
- **Product** — name, slug, description, estimated_price, common_units (json), image, is_active; belongs to Category & Subcategory
- **Recipe** — name, slug, description (richtext), image, author_name, author_image, prep_time, cook_time, servings, difficulty (enum), rating, review_count, ingredients (component), instructions (component), tags (json)
- **Shopping List Template** — name, slug, description, emoji, color, items (component)

### Components

- `recipe.ingredient` — name, quantity, unit, product (relation), notes
- `recipe.instruction` — step_number, description, duration_minutes
- `list.item` — name, quantity, unit, budget_amount, product (relation), notes

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
- [x] Create Category content type
- [x] Create Subcategory content type
- [x] Create Product content type
- [x] Create Recipe content type
- [x] Create Shopping List Template content type
- [x] Create components (recipe.ingredient, recipe.instruction, list.item)
- [ ] Configure public API permissions
- [x] Add PostgreSQL support for production (Supabase)
- [ ] Seed database with sample data
- [ ] Deploy Strapi (Render/Railway)

## Notes

<!-- Add development notes, decisions, and gotchas here -->
