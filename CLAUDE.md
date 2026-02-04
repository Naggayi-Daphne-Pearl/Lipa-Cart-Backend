# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lipa-Cart Backend - a Strapi 5 headless CMS for a grocery delivery app targeting East Africa (Uganda/Kenya). The Flutter frontend lives at `/Users/daphnepearl/Documents/Lipa-Cart`.

## Commands

```bash
npm run dev        # Development server with hot reload (default port 1337)
npm run build      # Build admin panel for production
npm run start      # Production mode
npm run console    # Strapi REPL console
```

## Architecture

**Stack**: Strapi 5.33.4 + TypeScript + SQLite (dev) / PostgreSQL via Supabase (prod)

**Content Types** (all in `src/api/`):
- `category` → `subcategory` → `product` (hierarchical catalog)
- `recipe` (uses `recipe.ingredient` and `recipe.instruction` components)
- `shopping-list` (uses `list.item` component)

**Components** (reusable nested structures in `src/components/`):
- `recipe/ingredient.json`, `recipe/instruction.json`
- `list/item.json`

**Key Files**:
- `src/index.ts` - Bootstrap: sets public permissions + triggers seed
- `scripts/seed.ts` - Two-phase seeding (entities first, images in background)
- `config/database.ts` - Auto-switches between SQLite (dev) and PostgreSQL (prod)

## Strapi Patterns

All controllers/services/routes use the factory pattern with minimal custom logic:
```typescript
export default factories.createCoreController('api::category.category');
```

Schema definitions are JSON files (`schema.json`), not TypeScript. Content type changes require editing these JSON schemas directly.

## API

Base: `/api/`

Public endpoints (read-only): `/api/categories`, `/api/subcategories`, `/api/products`, `/api/recipes`, `/api/shopping-lists`

Query with relations: `?populate=*`

Pagination defaults: 25 items, max 100 (`config/api.ts`)

## Database

- **Development**: SQLite at `.tmp/data.db`
- **Production**: PostgreSQL via `DATABASE_URL` env var (Supabase)

## Deployment

Configured for Railway (`railway.toml`) and Render (`render.yaml`). Both use:
```bash
npm install && npm run build  # Build
npm run start                  # Start
```
