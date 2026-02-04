# LipaCart Database ERD & Relationships

Visual representation of the database schema with cardinality and relationships.

---

## 📊 Complete Entity Relationship Diagram

```
                                    USERS (Base)
                                        │
                        ┌───────────────┼───────────────┬───────────┐
                        │               │               │           │
                    ┌───┴───┐       ┌───┴───┐      ┌───┴───┐   ┌───┴───┐
                    │CUSTOMER│      │SHOPPER│      │ RIDER │   │ ADMIN │
                    │  1:1   │      │  1:1  │      │  1:1  │   │  1:1  │
                    └───┬───┘       └───┬───┘      └───┬───┘   └───────┘
                        │               │               │
                        │ 1             │ 1             │ 1
                        │               │               │
                        │ *             │ *             │ *
                    ┌───┴───┐           │               │
                    │ADDRESS│           │               │
                    │ 1:*   │           │               │
                    └───┬───┘           │               │
                        │               │               │
                        └───────┬───────┴───────┬───────┘
                                │               │
                                │ *             │ *         * │
                            ┌───┴───────────────┴───────────┴────┐
                            │            ORDERS                  │
                            │                                    │
                            │  • customer_id (1 customer → *)    │
                            │  • shopper_id  (1 shopper → *)     │
                            │  • rider_id    (1 rider → *)       │
                            │  • address_id  (1 address → *)     │
                            └────┬─────┬──────┬──────┬──────┬────┘
                                 │     │      │      │      │
                       ┌─────────┘     │      │      │      └─────────┐
                       │               │      │      │                │
                    ┌──┴──┐       ┌───┴──┐ ┌─┴──┐ ┌─┴──────┐   ┌────┴─────┐
                    │ORDER│       │PAYMENT│ │MSG │ │ PHOTOS │   │ RATINGS  │
                    │ITEMS│       │ 1:*   │ │1:* │ │  1:*   │   │ 1:0..1   │
                    │1:1..*│      └───────┘ └────┘ └────────┘   └──────────┘
                    └──┬──┘
                       │
                       │ *
                       │
                    ┌──┴────┐
                    │PRODUCT│
                    │ 0..1  │
                    └───────┘


              PROMO_CODES                    EARNINGS
                   │                             │
                   │ 1                           │ 1
                   │                             │
                   │ *                           │ *
              ┌────┴────────┐              ┌────┴─────┐
              │ PROMO_CODE  │              │  USERS   │
              │   USAGE     │              │ (shopper/│
              │             │              │  rider)  │
              └─────────────┘              └──────────┘


              RIDER_LOCATIONS              NOTIFICATIONS
                   │                             │
                   │ *                           │ *
                   │                             │
              ┌────┴─────┐                  ┌───┴────┐
              │  ORDERS  │                  │ USERS  │
              │          │                  │        │
              └──────────┘                  └────────┘
```

---

## 🔗 Relationship Details

### 1. User Type Hierarchy (1:1)

**One user can only be ONE type**:

```
users (1) ←──→ (0..1) customers
users (1) ←──→ (0..1) shoppers
users (1) ←──→ (0..1) riders
users (1) ←──→ (0..1) admins
```

**Implementation**:
- `users.user_type` CHECK constraint
- Foreign keys in customers/shoppers/riders/admins tables with UNIQUE constraint
- Enforces that one user ID can only appear in one role table

---

### 2. Customer → Addresses (1:Many)

**One customer can have multiple delivery addresses**:

```
customers (1) ←──→ (*) addresses
```

**Example**:
- Jane has 3 addresses: Home, Office, Gym
- Each address belongs to only one customer

**Fields**:
- `addresses.user_id` → `users.id` (customer's user_id)
- `addresses.is_default` - only one can be true per customer

---

### 3. Customer → Orders (1:Many)

**One customer places many orders over time**:

```
customers (1) ←──→ (*) orders
```

**Example**:
- Sarah has placed 50 orders since joining

**Fields**:
- `orders.customer_id` → `users.id` (required, indexed)

---

### 4. Shopper → Orders (1:Many)

**One shopper fulfills many orders**:

```
shoppers (1) ←──→ (*) orders
```

**Example**:
- Moses has completed 200 shopping orders

**Fields**:
- `orders.shopper_id` → `users.id` (nullable until assigned)

---

### 5. Rider → Orders (1:Many)

**One rider delivers many orders**:

```
riders (1) ←──→ (*) orders
```

**Example**:
- Patrick has delivered 150 orders

**Fields**:
- `orders.rider_id` → `users.id` (nullable until assigned)

---

### 6. Address → Orders (1:Many)

**One address used for multiple orders**:

```
addresses (1) ←──→ (*) orders
```

**Example**:
- Jane's home address used for 30 different orders

**Fields**:
- `orders.delivery_address_id` → `addresses.id` (required)

---

### 7. Order → Order Items (1:One-or-More)

**One order MUST have at least one item**:

```
orders (1) ←──→ (1..*) order_items
```

**Example**:
- Order #123 has 5 items: tomatoes, onions, rice, milk, bread
- Cannot create order without items (business logic)

**Fields**:
- `order_items.order_id` → `orders.id` (required, cascade delete)

---

### 8. Product → Order Items (1:Many, Optional)

**One product appears in many order items**:

```
products (0..1) ←──→ (*) order_items
```

**Example**:
- "Tomatoes" product appears in 500 different order items
- Order items can have `product_id = NULL` for custom items

**Fields**:
- `order_items.product_id` → `products.id` (nullable)
- `order_items.product_name` always stored (snapshot)

---

### 9. Order Item → Substitute (1:Zero-or-One)

**One item may have one substitute item** (self-reference):

```
order_items (1) ←──→ (0..1) order_items (substitute)
```

**Example**:
- Original: Red onions (not found)
- Substitute: White onions (found)

**Fields**:
- `order_items.substitute_for_item_id` → `order_items.id` (nullable, self-reference)

---

### 10. Order → Payments (1:One-or-More)

**One order can have multiple payment attempts**:

```
orders (1) ←──→ (1..*) payments
```

**Example**:
- Order #456 has 3 payment records:
  1. Failed (network error)
  2. Completed (successful)
  3. Refunded (cancelled)

**Fields**:
- `payments.order_id` → `orders.id` (required)

---

### 11. Order → Rating (1:Zero-or-One)

**One order can have at most one rating**:

```
orders (1) ←──→ (0..1) ratings
```

**Example**:
- Order #789 has 1 rating (5 stars, great service)
- Order #790 has 0 ratings (customer didn't rate)

**Fields**:
- `ratings.order_id` → `orders.id` (UNIQUE constraint)

---

### 12. Order → Messages (1:Many)

**One order has many chat messages**:

```
orders (1) ←──→ (*) messages
```

**Example**:
- Order #100 has 12 messages between customer, shopper, and rider

**Fields**:
- `messages.order_id` → `orders.id` (required)
- `messages.sender_id` → `users.id` (required)

---

### 13. Order → Photos (1:Many)

**One order has many photos during fulfillment**:

```
orders (1) ←──→ (*) order_photos
```

**Example**:
- Order #200 has 8 photos:
  - 5 item photos (from shopper)
  - 1 package photo (shopper)
  - 1 pickup photo (rider)
  - 1 delivery photo (rider)

**Fields**:
- `order_photos.order_id` → `orders.id` (required)
- `order_photos.order_item_id` → `order_items.id` (optional)

---

### 14. Order → GPS Locations (1:Many)

**One order has many GPS tracking points**:

```
orders (1) ←──→ (*) rider_locations
```

**Example**:
- Order #300 has 45 GPS points tracking rider's delivery journey

**Fields**:
- `rider_locations.order_id` → `orders.id` (optional)
- `rider_locations.rider_id` → `users.id` (required)

---

### 15. User → Notifications (1:Many)

**One user receives many notifications**:

```
users (1) ←──→ (*) notifications
```

**Example**:
- Mary has 150 notifications (order updates, promos, etc.)

**Fields**:
- `notifications.user_id` → `users.id` (required)

---

### 16. Promo Code → Usage (1:Many)

**One promo code used many times**:

```
promo_codes (1) ←──→ (*) promo_code_usage
```

**Example**:
- Promo "WELCOME10" used 500 times by different customers

**Fields**:
- `promo_code_usage.promo_code_id` → `promo_codes.id` (required)

---

### 17. User → Promo Usage (1:Many)

**One user uses many different promo codes**:

```
users (1) ←──→ (*) promo_code_usage
```

**Example**:
- Alex used 5 different codes: WELCOME10, SAVE20, FREESHIP, etc.

**Fields**:
- `promo_code_usage.user_id` → `users.id` (required)

---

### 18. Order → Promo Usage (1:Zero-or-One)

**One order can use zero or one promo code**:

```
orders (1) ←──→ (0..1) promo_code_usage
```

**Example**:
- Order #500 used promo "SAVE20"
- Order #501 used no promo

**Fields**:
- `promo_code_usage.order_id` → `orders.id` (UNIQUE constraint)

---

### 19. User → Earnings (1:Many)

**One user (shopper/rider) has many earning records**:

```
users (1) ←──→ (*) earnings
```

**Example**:
- Shopper David has 100 earning entries (one per completed order)

**Fields**:
- `earnings.user_id` → `users.id` (required)

---

### 20. Order → Earnings (1:Multiple)

**One order generates multiple earnings** (typically 2: shopper + rider):

```
orders (1) ←──→ (2..*) earnings
```

**Example**:
- Order #600 creates 2 earnings:
  - UGX 5,000 for shopper
  - UGX 3,000 for rider

**Fields**:
- `earnings.order_id` → `orders.id` (optional)
- `earnings.type` (shopping, delivery, bonus, penalty)

---

### 21. Customer → Referrals (1:Many)

**One customer can refer many other customers** (self-reference):

```
customers (1) ←──→ (*) customers (referrals)
```

**Example**:
- Lisa referred 10 friends who signed up

**Fields**:
- `customers.referred_by` → `customers.id` (nullable, self-reference)
- `customers.referral_code` (unique code for sharing)

---

## 📐 Cardinality Symbols

| Symbol | Meaning | Example |
|--------|---------|---------|
| **1** | Exactly one | Order has exactly 1 customer |
| **0..1** | Zero or one | Order may have 0 or 1 rating |
| ***** | Zero or more | Customer has 0 or more orders |
| **1..*** | One or more | Order has 1 or more items |

---

## 🎯 Key Constraints

### Mandatory Relationships (Must Exist)
- ✅ Order **MUST** have a customer
- ✅ Order **MUST** have at least one item
- ✅ Order **MUST** have a delivery address
- ✅ Order **MUST** have at least one payment attempt

### Optional Relationships (May or May Not Exist)
- ⚪ Order **MAY** have a shopper (null until assigned)
- ⚪ Order **MAY** have a rider (null until assigned)
- ⚪ Order **MAY** have a rating (customer might not rate)
- ⚪ Order **MAY** use a promo code

---

## 🔄 Data Flow Example

### Complete Order Lifecycle

```
1. Customer creates order
   └─> orders (customer_id, status='pending')
   └─> order_items (3 items)
   └─> payments (status='pending')

2. Payment successful
   └─> payments (status='completed')
   └─> orders (status='payment_confirmed')

3. Shopper assigned
   └─> orders (shopper_id=X, status='shopper_assigned')
   └─> notifications (to shopper)

4. Shopper shopping
   └─> orders (status='shopping')
   └─> order_items (found=true/false)
   └─> order_photos (item photos)
   └─> messages (chat with customer)

5. Ready for pickup
   └─> orders (status='ready_for_pickup')
   └─> order_photos (package photo)

6. Rider assigned
   └─> orders (rider_id=Y, status='rider_assigned')
   └─> notifications (to rider)

7. In transit
   └─> orders (status='in_transit')
   └─> rider_locations (GPS updates every 10s)

8. Delivered
   └─> orders (status='delivered')
   └─> order_photos (delivery photo)
   └─> earnings (2 records: shopper + rider)

9. Customer rates
   └─> ratings (overall=5, shopper=5, rider=5)
   └─> shoppers (rating updated)
   └─> riders (rating updated)
```

---

## 📊 Database Statistics

### Expected Cardinalities (1 year, 1000 active users)

| Table | Estimated Rows |
|-------|---------------|
| users | 5,000 |
| customers | 3,000 |
| shoppers | 100 |
| riders | 50 |
| addresses | 6,000 (2 per customer) |
| orders | 100,000 |
| order_items | 400,000 (4 items per order) |
| payments | 150,000 (1.5 per order) |
| ratings | 75,000 (75% rate) |
| messages | 300,000 (3 per order) |
| rider_locations | 50,000 (active 24h only) |
| order_photos | 600,000 (6 per order) |
| notifications | 500,000 |
| promo_codes | 100 |
| promo_code_usage | 30,000 |
| earnings | 200,000 (2 per order) |
| products | 5,000 |

---

**Last Updated**: February 4, 2026  
**Schema Version**: 1.0
