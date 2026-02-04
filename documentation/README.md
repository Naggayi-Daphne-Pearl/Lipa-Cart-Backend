# LipaCart Database Schema

Complete PostgreSQL database schema for the LipaCart grocery delivery platform. Designed for **Supabase** with Row Level Security (RLS), real-time subscriptions, and geospatial queries.

---

## 📋 Overview

This database supports a **three-sided marketplace**:
1. **Customers** - Order groceries for delivery
2. **Shoppers** - Fulfill orders by shopping at markets
3. **Riders** - Deliver completed orders to customers

**Total Tables**: 17  
**Extensions Required**: `uuid-ossp`, `postgis`, `pg_trgm`

---

## 🗂 Files

| File | Description |
|------|-------------|
| **schema.sql** | Complete database schema with all 17 tables and indexes |
| **functions.sql** | 15 PostgreSQL functions and triggers for automation |
| **policies.sql** | Row Level Security (RLS) policies for all tables |
| **queries.sql** | 20 example queries for common operations |
| **README.md** | This file |

---

## 🚀 Quick Start

### 1. Create Database (Supabase)

```bash
# Connect to your Supabase project
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

### 2. Run Schema

```bash
psql -f schema.sql
psql -f functions.sql
psql -f policies.sql
```

### 3. Verify Installation

```sql
-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check functions
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
ORDER BY routine_name;
```

---

## 📊 Database Schema

### Core Tables (17)

#### **User Management (5)**
- `users` - Base table for all user types
- `customers` - Customer-specific data
- `shoppers` - Personal shopper data
- `riders` - Delivery rider data
- `addresses` - Customer delivery addresses

#### **Orders (4)**
- `orders` - Main orders table
- `order_items` - Items in each order
- `order_photos` - Photos during shopping/delivery
- `messages` - In-app chat

#### **Financial (2)**
- `payments` - Payment transactions
- `earnings` - Shopper/rider earnings tracking

#### **Reviews (1)**
- `ratings` - Order ratings and reviews

#### **Catalog (1)**
- `products` - Product catalog (synced from Strapi)

#### **Tracking (1)**
- `rider_locations` - Real-time GPS tracking

#### **Marketing (2)**
- `promo_codes` - Discount codes
- `promo_code_usage` - Promo redemption tracking

#### **System (1)**
- `notifications` - Push notification log

---

## 🔗 Entity Relationships

### Key Cardinalities

| Relationship | Cardinality | Description |
|-------------|-------------|-------------|
| User → Customer/Shopper/Rider | 1:1 | One user has one role |
| Customer → Orders | 1:* | Customer places many orders |
| Shopper → Orders | 1:* | Shopper fulfills many orders |
| Rider → Orders | 1:* | Rider delivers many orders |
| Order → Order Items | 1:1..* | Order has at least one item |
| Order → Payments | 1:1..* | Order has payment attempts |
| Order → Rating | 1:0..1 | Order may have one rating |
| Order → Messages | 1:* | Order has chat messages |
| Customer → Addresses | 1:* | Customer has multiple addresses |

---

## ⚙️ Key Features

### 1. Geospatial Queries
Uses PostGIS for location-based matching:
- Find shoppers within 5km of customer
- Find riders within 10km of pickup
- Calculate delivery distances

```sql
-- Example: Find nearby shoppers
SELECT * FROM shoppers
WHERE earth_distance(
  ll_to_earth(market_gps_lat, market_gps_lng),
  ll_to_earth($customer_lat, $customer_lng)
) < 5000;
```

### 2. Full-Text Search
Products have `tsvector` search index:

```sql
-- Search products
SELECT * FROM products
WHERE search_vector @@ to_tsquery('english', 'tomato | onion')
ORDER BY ts_rank(search_vector, to_tsquery('english', 'tomato | onion')) DESC;
```

### 3. Real-Time Updates
PostgreSQL `NOTIFY` for live updates:
- New orders
- Order status changes
- Messages

### 4. Automated Triggers
- Auto-generate order numbers (`LC-2024-001234`)
- Update ratings when reviews added
- Update completion counts
- Update earnings totals
- Generate referral codes

### 5. Row Level Security (RLS)
Every table has RLS policies:
- Customers see only their orders
- Shoppers see assigned orders
- Riders see assigned orders
- Admins see everything

---

## 🔐 Security

### Authentication
Uses Supabase Auth with `auth.uid()` for RLS policies.

### User Types
```sql
CHECK (user_type IN ('customer', 'shopper', 'rider', 'admin'))
```

### RLS Examples

```sql
-- Customers see own orders
CREATE POLICY "Customers see own orders"
  ON orders FOR SELECT
  USING (customer_id = auth.uid());

-- Shoppers see assigned orders
CREATE POLICY "Shoppers see assigned orders"
  ON orders FOR SELECT
  USING (shopper_id = auth.uid());
```

---

## 📈 Order Lifecycle

```
1. pending              → Order created
2. payment_processing   → Payment being processed
3. payment_confirmed    → Payment successful
4. shopper_assigned     → Shopper assigned
5. shopping             → Shopper shopping
6. ready_for_pickup     → Ready for rider
7. rider_assigned       → Rider assigned
8. in_transit           → Rider delivering
9. delivered            → Completed ✓
```

**Alternative paths**: `cancelled`, `refunded`

---

## 💰 Currency & Localization

- **Currency**: UGX (Uganda Shilling)
- **Phone Format**: +256 (Uganda)
- **Region**: East Africa (Uganda/Kenya)

All prices stored as `DECIMAL(10, 2)` for UGX amounts.

---

## 📊 Indexes

### Performance Indexes
- All foreign keys indexed
- `users.phone` (unique lookups)
- `orders.status` (filtering active orders)
- `orders.created_at DESC` (recent orders)
- Geospatial indexes on `shoppers.market_gps_*` and `riders.current_gps_*`

### Search Indexes
- `products.search_vector` (GIN index for full-text search)
- `products.name` (pattern matching)

---

## 🧹 Maintenance

### Cleanup Old Data

```sql
-- Delete rider locations older than 24 hours (run via cron)
SELECT cleanup_old_rider_locations();

-- Archive old notifications (example)
DELETE FROM notifications 
WHERE created_at < NOW() - INTERVAL '90 days' 
  AND is_read = true;
```

### Vacuum & Analyze

```sql
-- Regular maintenance
VACUUM ANALYZE;

-- For specific high-traffic tables
VACUUM ANALYZE orders;
VACUUM ANALYZE order_items;
VACUUM ANALYZE rider_locations;
```

---

## 🔧 Example Queries

See [queries.sql](queries.sql) for 20 common queries including:

1. Find available shoppers/riders near location
2. Get complete order details
3. Search products
4. Get customer order history
5. Get shopper active orders
6. Get rider deliveries
7. Validate promo codes
8. Get earnings summaries
9. Get chat messages
10. Track rider location
11. Get top-rated shoppers/riders
12. Analytics dashboard data

---

## 🧪 Testing

### Sample Data

```sql
-- Create test customer
INSERT INTO users (phone, name, user_type) 
VALUES ('+256700000001', 'Test Customer', 'customer')
RETURNING id;

INSERT INTO customers (user_id) 
VALUES ('[user_id_from_above]');

-- Create test order
INSERT INTO orders (
  customer_id, 
  delivery_address_id, 
  subtotal, 
  service_fee, 
  delivery_fee, 
  total
) VALUES (
  '[customer_user_id]',
  '[address_id]',
  50000,
  5000,
  5000,
  60000
);
```

---

## 📝 Migration Strategy

### From Development to Production

1. **Export Schema**
   ```bash
   pg_dump -s -h localhost -U postgres lipacart > schema_backup.sql
   ```

2. **Export Data**
   ```bash
   pg_dump -a -h localhost -U postgres lipacart > data_backup.sql
   ```

3. **Apply to Supabase**
   ```bash
   psql "postgres://..." < schema.sql
   psql "postgres://..." < functions.sql
   psql "postgres://..." < policies.sql
   ```

### Future Migrations

Create timestamped migration files:
```
migrations/
  2024_02_04_001_create_users_table.sql
  2024_02_04_002_create_orders_table.sql
  2024_02_05_001_add_rider_heading_column.sql
```

---

## 🚨 Important Notes

### Payment Security
- **Never store raw card numbers**
- Use tokenization from payment gateway
- `payment_token` field for tokenized cards only
- PCI-DSS compliance required for card payments

### Data Privacy
- Implement GDPR compliance for user data
- Allow customers to request data deletion
- Anonymize data after account deletion

### Performance
- Monitor slow queries with `pg_stat_statements`
- Add indexes as needed based on query patterns
- Consider partitioning `rider_locations` by date if high volume
- Use connection pooling (Supabase includes PgBouncer)

---

## 🔗 Integration with Strapi

Products are synced from Strapi CMS:
- Strapi manages product catalog
- Sync product data to Supabase periodically
- Or query Strapi API directly for product details

**Strapi Endpoint**: `{STRAPI_URL}/api/products?populate=*`

---

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

## 🤝 Contributing

When adding new tables or fields:
1. Update `schema.sql`
2. Add appropriate indexes
3. Create RLS policies in `policies.sql`
4. Add triggers if needed in `functions.sql`
5. Document example queries in `queries.sql`
6. Update this README

---

## 📄 License

This schema is part of the LipaCart project. See main project LICENSE file.

---

**Last Updated**: February 4, 2026  
**Schema Version**: 1.0  
**Database**: PostgreSQL 15+ (Supabase)
