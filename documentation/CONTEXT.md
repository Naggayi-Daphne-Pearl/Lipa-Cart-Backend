# Lipa-Cart Backend — Comprehensive Project Context

> **Living Document**: This file provides complete context for the Lipa-Cart Strapi backend. Update as the project evolves.

---

## 🎯 Project Overview

**Lipa-Cart** is a grocery delivery application targeting **East Africa** (Uganda/Kenya). This repository (`LC`) serves as the **headless CMS backend** built on **Strapi 5**, managing all catalog content, recipes, and shopping list templates for the platform.

### What Does This Project Do?

This Strapi backend provides:
1. **Product Catalog API** - Categories, subcategories, and products with pricing and images
2. **Recipe Management** - Cooking recipes with ingredients, instructions, and metadata
3. **Shopping List Templates** - Pre-made shopping lists for common grocery needs
4. **Content Management** - Admin panel for managing all catalog content
5. **Public REST API** - Read-only endpoints for the Flutter mobile app

### System Architecture

```
┌─────────────────────┐
│   Flutter App       │ ← Customer-facing mobile app
│   (Separate Repo)   │
└──────────┬──────────┘
           │
           ├─────────────────────────┐
           │                         │
           ▼                         ▼
┌──────────────────┐      ┌──────────────────────┐
│  Strapi CMS      │      │     Supabase         │
│  (This Repo)     │      │                      │
│                  │      │  - Auth (OTP)        │
│  - Categories    │      │  - User Data         │
│  - Products      │      │  - Orders/Cart       │
│  - Recipes       │      │  - Addresses         │
│  - Shopping Lists│      │  - Payments          │
│                  │      │  - Realtime Updates  │
└──────────────────┘      └──────────────────────┘
         │                         │
         └────────┬────────────────┘
                  ▼
         ┌─────────────────┐
         │   PostgreSQL    │
         │   (Production)  │
         └─────────────────┘
```

**Key Architectural Decisions:**
- **Strapi** manages **static, admin-curated content** (products, categories, recipes)
- **Supabase** handles **dynamic, user-specific data** (orders, cart, auth, payments)
- **Separation of Concerns**: Read-heavy catalog vs. transactional user data

### Supabase Connection
- **Project**: `cusjbtbacxfpbuwafgzy`
- **URL**: `https://cusjbtbacxfpbuwafgzy.supabase.co`
- **Shared Database**: PostgreSQL (used by both Strapi and Supabase)

---

## 🛠 Tech Stack

| Component       | Technology                                    | Version/Details        |
|----------------|----------------------------------------------|------------------------|
| **CMS**        | Strapi                                       | 5.33.4                 |
| **Language**   | TypeScript                                   | ^5.x                   |
| **Runtime**    | Node.js                                      | >=20.0.0 <=24.x.x      |
| **Database**   | SQLite (dev) / PostgreSQL (prod)             | better-sqlite3 / pg    |
| **Package Mgr**| npm                                          | >=6.0.0                |
| **Frontend**   | Flutter (separate repo)                      | -                      |
| **Auth/Backend**| Supabase                                    | -                      |

**Dependencies Highlights:**
- `@strapi/strapi`: Core CMS framework
- `@strapi/plugin-users-permissions`: Public API permissions
- `better-sqlite3`: Development database
- `pg`: Production PostgreSQL client
- `fs-extra`, `mime-types`: File/image handling for seed script

---

## 📁 Project Structure

```
LC/
├── config/                    # Strapi configuration
│   ├── database.ts           # Auto-switches SQLite ↔ PostgreSQL
│   ├── server.ts             # Server config (port, host)
│   ├── admin.ts              # Admin panel config
│   ├── api.ts                # REST API config (pagination, etc.)
│   ├── middlewares.ts        # Middleware stack
│   └── plugins.ts            # Plugin configuration
│
├── database/migrations/       # Database migration files
│
├── public/                    # Static assets
│   ├── robots.txt
│   └── uploads/              # Uploaded media files
│
├── scripts/
│   └── seed.ts               # Data seeding script (categories, products, recipes)
│
├── src/
│   ├── index.ts              # App bootstrap (sets public permissions, runs seed)
│   │
│   ├── admin/                # Admin panel customization
│   │   ├── app.example.tsx
│   │   ├── tsconfig.json
│   │   └── vite.config.example.ts
│   │
│   ├── api/                  # Content-Type Definitions
│   │   ├── category/         # Categories (Fruits, Meat, etc.)
│   │   ├── subcategory/      # Subcategories under categories
│   │   ├── product/          # Individual grocery products
│   │   ├── recipe/           # Cooking recipes
│   │   └── shopping-list/    # Shopping list templates
│   │
│   ├── components/           # Reusable Strapi components
│   │   ├── recipe/
│   │   │   ├── ingredient.json    # Recipe ingredient component
│   │   │   └── instruction.json   # Recipe instruction component
│   │   └── list/
│   │       └── item.json         # Shopping list item component
│   │
│   └── extensions/           # Plugin extensions
│
├── types/generated/          # Auto-generated TypeScript types
│   ├── components.d.ts
│   └── contentTypes.d.ts
│
├── package.json              # Dependencies & scripts
├── tsconfig.json             # TypeScript config
├── railway.toml              # Railway deployment config
├── render.yaml               # Render deployment config
├── CONTEXT.md               # This file
└── CLAUDE.md                # AI assistant guidelines
```

---

## 📊 Data Model

### Active Content Types (5)

#### 1. **Category**
Product categories for the grocery catalog.

**Fields:**
- `name` (string, required) - Display name
- `slug` (uid) - URL-friendly identifier
- `description` (text) - Category description
- `image` (media) - Category thumbnail
- `color` (string) - Brand color for UI
- `sort_order` (integer, default: 0) - Display order
- `is_active` (boolean, default: true) - Visibility toggle

**Relations:**
- `subcategories` (one-to-many → Subcategory)
- `products` (one-to-many → Product)

**Examples:** Fruits & Vegetables, Meat & Poultry, Dairy & Eggs

---

#### 2. **Subcategory**
Subcategories under main categories.

**Fields:**
- `name` (string, required)
- `slug` (uid)
- `description` (text)
- `image` (media)
- `sort_order` (integer, default: 0)
- `is_active` (boolean, default: true)

**Relations:**
- `category` (many-to-one → Category)
- `products` (one-to-many → Product)

**Examples:** Fresh Fruits, Leafy Greens, Chicken Products

---

#### 3. **Product**
Individual grocery products.

**Fields:**
- `name` (string, required) - Product name
- `slug` (uid)
- `description` (text) - Product details
- `estimated_price` (decimal, required) - Price in UGX
- `common_units` (json) - Common purchase units (e.g., ["kg", "piece", "bunch"])
- `image` (media) - Product photo
- `is_active` (boolean, default: true)

**Relations:**
- `category` (many-to-one → Category)
- `subcategory` (many-to-one → Subcategory)

**Examples:** Tomatoes, Chicken Breast, Fresh Milk

---

#### 4. **Recipe**
Cooking recipes with ingredients and instructions.

**Fields:**
- `name` (string, required) - Recipe title
- `slug` (uid)
- `description` (richtext) - Recipe overview
- `image` (media) - Recipe hero image
- `author_name` (string) - Recipe author
- `author_image` (media) - Author avatar
- `prep_time` (integer) - Preparation time (minutes)
- `cook_time` (integer) - Cooking time (minutes)
- `servings` (integer) - Number of servings
- `difficulty` (enum: easy/medium/hard)
- `rating` (decimal) - Average rating
- `review_count` (integer, default: 0)
- `ingredients` (component: recipe.ingredient, repeatable)
- `instructions` (component: recipe.instruction, repeatable)
- `tags` (json) - Searchable tags

**Examples:** Matoke with Groundnut Sauce, Chicken Luwombo

---

#### 5. **Shopping List (Template)**
Pre-made shopping lists for common grocery needs.

**Fields:**
- `name` (string, required) - List name
- `slug` (uid)
- `description` (text) - List description
- `emoji` (string) - Icon/emoji for UI
- `color` (string) - Brand color
- `items` (component: list.item, repeatable)

**Examples:** Weekly Essentials, Party Supplies, Baby Care

---

### Components (Reusable Nested Structures)

#### **recipe.ingredient**
```json
{
  "name": "string (required)",      // e.g., "Tomatoes"
  "quantity": "decimal",            // e.g., 3
  "unit": "string",                 // e.g., "medium-sized"
  "product": "relation → Product",  // Optional link to product
  "notes": "string"                 // e.g., "diced"
}
```

#### **recipe.instruction**
```json
{
  "step_number": "integer",         // Step order
  "description": "text",            // Instruction text
  "duration_minutes": "integer"     // Time for this step
}
```

#### **list.item**
```json
{
  "name": "string (required)",      // e.g., "Milk"
  "quantity": "decimal (default: 1)",
  "unit": "string",                 // e.g., "liters"
  "budget_amount": "decimal",       // Estimated cost in UGX
  "product": "relation → Product",  // Optional link
  "notes": "string"
}
```

---

### Inactive/Placeholder Content Types

The following folders exist but have no schemas yet:
- `address/` - (Future: delivery addresses - likely moved to Supabase)
- `admin-user/` - (Likely redundant with Strapi's built-in admin users)
- `customer/` - (User profiles - handled by Supabase)
- `order/` - (Orders - handled by Supabase)
- `order-item/` - (Order line items - handled by Supabase)
- `payment/` - (Payments - handled by Supabase)
- `rating/` - (Product ratings - handled by Supabase)
- `rider/` - (Delivery riders - TBD)
- `shopper/` - (Personal shoppers - TBD)
- `user/` - (Users - handled by Supabase)

---

## 🔌 API Endpoints

### Base URL
- **Development**: `http://localhost:1337/api`
- **Production**: `{STRAPI_URL}/api`

### Public Endpoints (Read-Only)

All endpoints require no authentication (public role).

| Endpoint                    | Method | Description              | Query Params          |
|-----------------------------|--------|--------------------------|-----------------------|
| `/api/categories`           | GET    | List all categories      | `?populate=*`         |
| `/api/categories/:id`       | GET    | Get single category      | `?populate=*`         |
| `/api/subcategories`        | GET    | List all subcategories   | `?populate=*`         |
| `/api/subcategories/:id`    | GET    | Get single subcategory   | `?populate=*`         |
| `/api/products`             | GET    | List all products        | `?populate=*`         |
| `/api/products/:id`         | GET    | Get single product       | `?populate=*`         |
| `/api/recipes`              | GET    | List all recipes         | `?populate=*`         |
| `/api/recipes/:id`          | GET    | Get single recipe        | `?populate=*`         |
| `/api/shopping-lists`       | GET    | List all shopping lists  | `?populate=*`         |
| `/api/shopping-lists/:id`   | GET    | Get single shopping list | `?populate=*`         |

**Query Parameters:**
- `?populate=*` - Include all relations and media
- `?populate[category]=*` - Populate specific relation
- `?filters[is_active][$eq]=true` - Filter active items
- `?pagination[page]=1&pagination[pageSize]=25` - Pagination

**Pagination Defaults** (configured in `config/api.ts`):
- Default page size: 25
- Max page size: 100

---

## 🚀 Development Workflow

### Key Commands

```bash
# Development
npm run dev         # Start with hot-reload (default port: 1337)
npm run develop     # Alias for dev

# Production Build
npm run build       # Build admin panel for production
npm run start       # Start in production mode (no auto-reload)

# Utilities
npm run console     # Strapi REPL console (advanced)
npm run strapi      # Run any Strapi CLI command
npm run upgrade     # Upgrade Strapi to latest version
npm run upgrade:dry # Check for upgrades without installing
```

### Development Server
- **URL**: http://localhost:1337
- **Admin Panel**: http://localhost:1337/admin
- **API Base**: http://localhost:1337/api

### First-Time Setup
```bash
npm install
npm run dev
# Create admin user at http://localhost:1337/admin
```

---

## 🗄 Database Configuration

### Development (SQLite)
- **File**: `.tmp/data.db`
- **Client**: `better-sqlite3`
- **Auto-configured**: No env vars needed

### Production (PostgreSQL via Supabase)
- **Client**: `pg`
- **Required Env Vars**:
  ```bash
  DATABASE_CLIENT=postgres
  DATABASE_URL=postgresql://user:pass@host:port/db
  DATABASE_SSL_REJECT_UNAUTHORIZED=false  # For Supabase
  DATABASE_SCHEMA=public
  DATABASE_POOL_MIN=2
  DATABASE_POOL_MAX=10
  ```

### Auto-Switching Logic (`config/database.ts`)
```typescript
const client = env('DATABASE_CLIENT', 'postgres');
// Automatically uses SQLite if DATABASE_URL not set
// Switches to PostgreSQL in production via env var
```

---

## 🌱 Data Seeding

### Seed Script (`scripts/seed.ts`)

**Purpose**: Populate database with sample data for development/testing.

**What It Seeds:**
1. **Categories** (8 total)
   - Fruits & Vegetables, Meat & Poultry, Dairy & Eggs, Bakery & Bread, 
     Beverages, Snacks & Confectionery, Household Essentials, Baby & Kids

2. **Subcategories** (~24 total)
   - Fresh Fruits, Leafy Greens, Chicken Products, etc.

3. **Products** (~80 total)
   - Tomatoes, Chicken Breast, Fresh Milk, etc.

4. **Recipes** (~10 total)
   - Local East African recipes with ingredients and instructions

5. **Shopping Lists** (~5 templates)
   - Weekly Essentials, Party Supplies, etc.

**Two-Phase Seeding:**
1. **Phase 1**: Create entities with text data
2. **Phase 2**: Download and upload images (background, non-blocking)

**Image Sources**: Unsplash API (royalty-free images)

**Execution:**
- Runs automatically on bootstrap (`src/index.ts`)
- Only seeds if collections are empty
- Logs progress to console

---

## 🔐 Authentication & Permissions

### Admin Users
- **Managed by**: Strapi built-in admin system
- **Access**: Full CRUD on all content types
- **Setup**: First admin created at `/admin` on initial startup

### Public Role (API Consumers)

**Auto-configured in `src/index.ts`:**
```typescript
const publicPermissions = [
  { action: 'find', contentType: 'api::category.category' },
  { action: 'findOne', contentType: 'api::category.category' },
  { action: 'find', contentType: 'api::subcategory.subcategory' },
  { action: 'findOne', contentType: 'api::subcategory.subcategory' },
  { action: 'find', contentType: 'api::product.product' },
  { action: 'findOne', contentType: 'api::product.product' },
  { action: 'find', contentType: 'api::recipe.recipe' },
  { action: 'findOne', contentType: 'api::recipe.recipe' },
  { action: 'find', contentType: 'api::shopping-list.shopping-list' },
  { action: 'findOne', contentType: 'api::shopping-list.shopping-list' },
];
```

**Permissions:**
- ✅ **GET** (find, findOne) - Allowed
- ❌ **POST, PUT, DELETE** - Denied

---

## 📱 Frontend Integration

### Flutter App
- **Location**: `/Users/daphnepearl/Documents/Lipa-Cart`
- **Context File**: `/Users/daphnepearl/Documents/Lipa-Cart/claude.md`

### API Consumption Pattern
```dart
// Example: Fetch all products with relations
final response = await http.get(
  Uri.parse('$strapiUrl/api/products?populate=*')
);
```

### Media URLs
- **Base**: `{STRAPI_URL}`
- **Format**: `/uploads/{filename}_{hash}.{ext}`
- **Access**: Public (no auth required)

---

## 🌍 Localization & Regional Settings

| Setting        | Value                     |
|---------------|---------------------------|
| **Currency**  | UGX (Uganda Shilling)     |
| **Phone**     | +256 (Uganda)             |
| **Region**    | East Africa (Uganda/Kenya)|
| **Language**  | English (primary)         |

---

## 🏗 Strapi Code Patterns

### Content Type Structure
Each content type follows this structure:
```
src/api/{content-type}/
├── content-types/
│   └── {content-type}/
│       └── schema.json         # Data model definition
├── controllers/
│   └── {content-type}.ts       # Request handlers
├── routes/
│   └── {content-type}.ts       # API routes
└── services/
    └── {content-type}.ts       # Business logic
```

### Factory Pattern (Standard)
Most controllers/services/routes use Strapi's factory pattern:

```typescript
// controllers/product.ts
export default factories.createCoreController('api::product.product');

// services/product.ts
export default factories.createCoreService('api::product.product');

// routes/product.ts
export default factories.createCoreRouter('api::product.product');
```

**Customization**: Override specific methods as needed:
```typescript
export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async find(ctx) {
    // Custom logic
    return await super.find(ctx);
  }
}));
```

### Schema Definitions
- **Format**: JSON (not TypeScript)
- **Location**: `src/api/{type}/content-types/{type}/schema.json`
- **Editing**: Direct JSON editing required for schema changes

---

## 🚢 Deployment

### Railway (`railway.toml`)
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm run start"
restartPolicyType = "ON_FAILURE"
```

### Render (`render.yaml`)
```yaml
services:
  - type: web
    name: lipa-cart-api
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start
```

### Environment Variables (Production)
```bash
NODE_ENV=production
DATABASE_CLIENT=postgres
DATABASE_URL=<supabase-connection-string>
STRAPI_ADMIN_SECRET=<random-secret>
APP_KEYS=<comma-separated-keys>
API_TOKEN_SALT=<random-salt>
ADMIN_JWT_SECRET=<random-secret>
JWT_SECRET=<random-secret>
```

---

## ✅ Development Status

### Completed
- [x] Strapi 5 project initialized
- [x] TypeScript configuration
- [x] Database configuration (SQLite + PostgreSQL)
- [x] Category content type
- [x] Subcategory content type
- [x] Product content type
- [x] Recipe content type (with components)
- [x] Shopping List template content type
- [x] Public API permissions
- [x] Seed script with image uploads
- [x] Deployment config (Railway + Render)

### Placeholder (Not Implemented)
- [ ] Rider content type (delivery riders)
- [ ] Shopper content type (personal shoppers)
- [ ] Address, Customer, Order, Payment, Rating (→ moved to Supabase)

### Future Enhancements
- [ ] Search functionality (products, recipes)
- [ ] Product variants (sizes, brands)
- [ ] Multi-language support (Swahili)
- [ ] Admin UI customization
- [ ] Analytics/reporting dashboard

---

## 📚 Additional Resources

### Documentation
- [Strapi 5 Docs](https://docs.strapi.io)
- [Strapi REST API](https://docs.strapi.io/dev-docs/api/rest)
- [Strapi CLI](https://docs.strapi.io/dev-docs/cli)

### Repository Links
- **Backend (This Repo)**: `/Users/daphnepearl/Documents/LC`
- **Frontend (Flutter)**: `/Users/daphnepearl/Documents/Lipa-Cart`

### Support
- [Strapi Discord](https://discord.strapi.io)
- [Strapi Forum](https://forum.strapi.io/)

---

---

## 🗄️ Supabase Database Schema

### Complete PostgreSQL Database

A comprehensive **17-table database schema** has been created in `/database/` for the full LipaCart application (customer app, shopper app, rider app, admin dashboard).

**Database Location**: `/database/`
- **schema.sql** - 17 tables with indexes and constraints
- **functions.sql** - 15 automated functions and triggers
- **policies.sql** - Row Level Security (RLS) policies
- **queries.sql** - 20 example queries for common operations
- **README.md** - Complete database documentation

### Database Tables (17)

**User Management (5)**:
- `users` - Base table for all user types (customer/shopper/rider/admin)
- `customers` - Customer profiles and referral tracking
- `shoppers` - Personal shopper profiles and marketplace data
- `riders` - Delivery rider profiles and vehicle info
- `addresses` - Customer delivery addresses

**Orders (4)**:
- `orders` - Main orders table with full lifecycle tracking
- `order_items` - Individual items in orders (with substitution support)
- `order_photos` - Photos during shopping/pickup/delivery
- `messages` - In-app chat between customer/shopper/rider

**Financial (2)**:
- `payments` - Payment transactions (mobile money, cards)
- `earnings` - Shopper/rider earnings and payouts

**Reviews (1)**:
- `ratings` - Order ratings and reviews

**Catalog (1)**:
- `products` - Product catalog (synced from Strapi CMS)

**Tracking (1)**:
- `rider_locations` - Real-time GPS tracking during delivery

**Marketing (2)**:
- `promo_codes` - Discount codes and promotions
- `promo_code_usage` - Promo code redemption tracking

**System (1)**:
- `notifications` - Push notifications log

### Key Database Features

1. **Geospatial Queries** - PostGIS for location-based shopper/rider matching
2. **Full-Text Search** - Fast product search with `tsvector` indexing
3. **Real-Time Updates** - PostgreSQL `NOTIFY` for live order updates
4. **Row Level Security** - Comprehensive RLS policies for all tables
5. **Automated Triggers** - Auto-generate order numbers, update ratings, track earnings
6. **Audit Trail** - Complete timestamp tracking for all lifecycle events

### Order Lifecycle

```
pending → payment_processing → payment_confirmed → shopper_assigned 
  → shopping → ready_for_pickup → rider_assigned → in_transit → delivered
```

**Alternative paths**: `cancelled`, `refunded`

### Integration with Strapi

Products in Supabase are synced from this Strapi CMS:
- Strapi manages the product catalog (authoritative source)
- Supabase stores product snapshots for orders
- Mobile apps query Strapi API for current product data

---

**Last Updated**: February 4, 2026
- [x] Create Product content type
- [x] Create Recipe content type
- [x] Create Shopping List Template content type
- [x] Create components (recipe.ingredient, recipe.instruction, list.item)
- [x] Configure public API permissions (via bootstrap)
- [x] Add PostgreSQL support for production (Supabase)
- [x] Seed database with sample data
- [x] Deploy Strapi (Render — `render.yaml` configured)

## Notes

<!-- Add development notes, decisions, and gotchas here -->
