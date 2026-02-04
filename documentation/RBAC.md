# Role-Based Access Control (RBAC) Documentation

## Overview

Lipa-Cart uses Strapi's Users & Permissions plugin to implement fine-grained role-based access control (RBAC). Each user type (`customer`, `shopper`, `rider`, `admin`) has a corresponding role with specific permissions tailored to their needs in the system.

---

## User Roles

### 1. 👤 Customer Role

**Purpose**: Regular app users who browse products and place orders.

**Capabilities**:
- ✅ Browse product catalog (categories, subcategories, products)
- ✅ View recipes and shopping lists
- ✅ Manage own profile and preferences
- ✅ Create, update, and delete delivery addresses
- ✅ Place new orders and cancel pending orders
- ✅ View order history and track current orders
- ✅ Make payments
- ✅ Rate and review completed orders
- ✅ View assigned shopper and rider information
- ❌ Cannot access other users' data
- ❌ Cannot modify order items after placement
- ❌ Cannot access admin functions

**Use Cases**:
- Sarah wants to order groceries for the week
- John needs to add a new delivery address
- Mary wants to track her current order
- David wants to rate his shopper after delivery

---

### 2. 🛒 Shopper Role

**Purpose**: Personal shoppers who fulfill grocery orders at markets.

**Capabilities**:
- ✅ View product catalog for reference
- ✅ Manage own profile (location, online status)
- ✅ View orders assigned to them
- ✅ Update order status (shopping, completed)
- ✅ Mark items as found/not found
- ✅ Update actual prices of items
- ✅ Create substitution items
- ✅ Upload photos of items
- ✅ View customer contact info (for coordination)
- ✅ View own ratings and earnings
- ❌ Cannot see other shoppers' orders
- ❌ Cannot modify orders not assigned to them
- ❌ Cannot delete orders
- ❌ Cannot access admin functions

**Use Cases**:
- Jane receives a new order notification
- Peter marks items as found while shopping
- Alice suggests a substitution for out-of-stock item
- Mike uploads photo of fresh produce for customer approval

---

### 3. 🏍️ Rider Role

**Purpose**: Delivery riders who transport orders from shoppers to customers.

**Capabilities**:
- ✅ Manage own profile (location, online status, vehicle info)
- ✅ View delivery orders assigned to them
- ✅ Update delivery status (picked up, in transit, delivered)
- ✅ View order items for delivery verification
- ✅ View customer delivery address and contact info
- ✅ View shopper info (for pickup coordination)
- ✅ Upload delivery photos (proof of delivery)
- ✅ View own ratings and earnings
- ❌ Cannot see other riders' deliveries
- ❌ Cannot modify order items
- ❌ Cannot cancel orders
- ❌ Cannot access admin functions

**Use Cases**:
- Tom picks up completed order from shopper
- Linda navigates to customer's delivery address
- Kevin uploads photo proof of delivery
- Rachel coordinates pickup time with shopper

---

### 4. 👨‍💼 Admin Role

**Purpose**: Operational staff with elevated privileges for managing the platform.

**Capabilities**:
- ✅ Full access to all orders across the platform
- ✅ View and manage all users (customers, shoppers, riders)
- ✅ Verify and approve shopper/rider applications
- ✅ Handle order disputes and refunds
- ✅ View all payments and transactions
- ✅ Manage all ratings and reviews
- ✅ Access analytics and reports
- ✅ Manually assign orders to shoppers/riders
- ✅ Override order statuses
- ✅ Delete inappropriate content
- ⚠️ Cannot access Strapi CMS admin panel (that's for CMS Admins)

**Admin Sub-Roles** (via `permissions` field):
- **Super Admin**: Full system access
- **Operations**: Order management, assignment, disputes
- **Support**: Customer service, handle complaints
- **Analytics**: View reports, dashboards (read-only)

**Use Cases**:
- Admin resolves dispute about substituted item
- Support agent helps customer with payment issue
- Operations manager assigns order to available shopper
- Analyst reviews daily order metrics

---

## Permission Matrix

| Content Type | Customer | Shopper | Rider | Admin |
|--------------|----------|---------|-------|-------|
| **Categories** | Find, FindOne | Find, FindOne | - | Find, FindOne |
| **Products** | Find, FindOne | Find, FindOne | - | Find, FindOne |
| **Recipes** | Find, FindOne | - | - | Find, FindOne |
| **Own Profile** | Find, FindOne, Update | Find, FindOne, Create, Update | Find, FindOne, Create, Update | Find, FindOne, Create, Update, Delete |
| **Other Users** | Find shoppers/riders | Find customers | Find customers, shoppers | Full CRUD |
| **Addresses** | Full CRUD (own) | Find, FindOne | Find, FindOne | Full CRUD |
| **Orders** | Find, FindOne, Create, Update (cancel) | Find, FindOne, Update (status) | Find, FindOne, Update (delivery) | Full CRUD |
| **Order Items** | Find, FindOne, Create | Find, FindOne, Update, Create (substitutes) | Find, FindOne | Full CRUD |
| **Payments** | Find, FindOne, Create | Find, FindOne | Find, FindOne | Full CRUD |
| **Ratings** | Find, FindOne, Create, Update | Find, FindOne | Find, FindOne | Full CRUD |

---

## Role Assignment

### Important Architecture Note

**Lipa-Cart has TWO separate user systems:**

1. **Custom User Profiles** (`api::user.user`):
   - Stores: phone, name, user_type, profile_photo
   - Relations to customers/shoppers/riders tables
   - NO `role` field (this is intentional)

2. **Strapi Auth Users** (`plugin::users-permissions.user`):
   - Handles: authentication (login/password)
   - Has: username, email, password, role
   - Used for API authentication

### Correct Role Assignment Flow

Since our custom user profiles don't handle authentication, role assignment should happen when creating auth users:

#### Option 1: Manual Assignment via Strapi Admin Panel
1. Go to Content Manager → Users (from Users & Permissions plugin)
2. Create/edit a user
3. Select their role: Customer, Shopper, Rider, or Admin

#### Option 2: Programmatic Assignment (Recommended)
When implementing Supabase authentication in your Flutter app, create a Strapi webhook or service to sync users:

```typescript
// In a custom controller or service
async syncUserFromSupabase(supabaseUserId: string, userType: string) {
  // Find the corresponding role
  const role = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: userType } });
  
  // Create Strapi auth user with role
  const strapiUser = await strapi.plugins['users-permissions']
    .services.user.add({
      username: supabaseUserId,
      email: `${supabaseUserId}@app.generated`,
      role: role.id,
      confirmed: true,
    });
  
  // Create custom user profile
  await strapi.entityService.create('api::user.user', {
    data: {
      phone: phoneNumber,
      user_type: userType,
      // Link to customers/shoppers/riders as needed
    },
  });
}
```

### Implementation

1. **Bootstrap Setup** (`src/index.ts`):
   - Runs `setupRoles()` on server start
   - Creates/updates all roles with permissions

2. **User Profile Controller** (`src/api/user/controllers/user.ts`):
   - Manages custom user profiles (phone, name, user_type)
   - Does NOT assign roles (that's for auth users)

3. **Middleware** (`src/middlewares/auto-assign-role.ts`):
   - Placeholder for future role-related logic
   - Currently inactive (intentional)

---

## Row-Level Security (RLS)

While Strapi handles API-level permissions, you should also implement Supabase RLS policies for database-level security:

### Customer RLS Examples

```sql
-- Customers can only view their own orders
CREATE POLICY customer_view_own_orders ON orders
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- Customers can only update their own addresses
CREATE POLICY customer_update_own_addresses ON addresses
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());
```

### Shopper RLS Examples

```sql
-- Shoppers can only view orders assigned to them
CREATE POLICY shopper_view_assigned_orders ON orders
  FOR SELECT
  TO authenticated
  USING (shopper_id = auth.uid());

-- Shoppers can only update orders they're assigned to
CREATE POLICY shopper_update_assigned_orders ON orders
  FOR UPDATE
  TO authenticated
  USING (shopper_id = auth.uid());
```

---

## Testing Roles

### Using Postman

1. **Get JWT Token**:
   ```
   POST /api/auth/local
   {
     "identifier": "phone_or_email",
     "password": "password"
   }
   ```

2. **Use Token in Headers**:
   ```
   Authorization: Bearer YOUR_JWT_TOKEN
   ```

3. **Test Permissions**:
   - Try accessing endpoints allowed for your role ✅
   - Try accessing forbidden endpoints ❌
   - Verify you get 403 Forbidden for unauthorized actions

### Example Test Scenarios

**Customer Tests**:
- ✅ Can GET /api/products
- ✅ Can POST /api/orders
- ❌ Should fail: PUT /api/orders/:id/status (only shoppers can update status)
- ❌ Should fail: GET /api/users (cannot list all users)

**Shopper Tests**:
- ✅ Can PUT /api/orders/:assigned_order_id
- ✅ Can PUT /api/order-items/:id (update actual price)
- ❌ Should fail: DELETE /api/orders/:id (only admins can delete)
- ❌ Should fail: PUT /api/orders/:unassigned_order_id (not assigned to this shopper)

---

## Best Practices

### 1. Principle of Least Privilege
Give users only the permissions they need to perform their job.

### 2. Use API Controllers for Business Logic
Permissions control WHAT users can access, controllers control HOW they can use it:

```typescript
// In order controller
async update(ctx) {
  const { id } = ctx.params;
  const user = ctx.state.user;
  
  // Shoppers can only update orders assigned to them
  if (user.user_type === 'shopper') {
    const order = await strapi.entityService.findOne('api::order.order', id);
    if (order.shopper.id !== user.id) {
      return ctx.forbidden('Not your order');
    }
  }
  
  return super.update(ctx);
}
```

### 3. Validate on Both Frontend and Backend
Never trust client-side validation alone. Always validate permissions on the backend.

### 4. Audit Permission Changes
Log when users perform sensitive actions:

```typescript
console.log(`User ${user.id} (${user.user_type}) updated order ${orderId}`);
```

### 5. Regular Permission Reviews
Periodically review role permissions to ensure they still align with business needs.

---

## Troubleshooting

### "Forbidden" Error (403)
- Check if user has correct role assigned
- Verify role has permission for the action
- Check if RLS policies (Supabase) are blocking access

### Role Not Assigned Automatically
- Ensure `user_type` field is set correctly
- Check middleware is registered in `config/middlewares.ts`
- Verify role exists in database (`plugin::users-permissions.role`)

### Permission Not Working
- Restart Strapi server after role changes
- Check permission is `enabled: true` in database
- Verify action matches format: `api::content-type.content-type.action`

---

## Related Files

- **Role Setup**: `scripts/setup-roles.ts`
- **Bootstrap**: `src/index.ts`
- **User Controller**: `src/api/user/controllers/user.ts`
- **Middleware**: `src/middlewares/auto-assign-role.ts`
- **Database Schema**: `database/schema.sql`
- **ERD**: `database/ERD.md`

---

## Additional Resources

- [Strapi Users & Permissions Plugin Docs](https://docs.strapi.io/user-docs/plugins/strapi-plugins#users-permissions-plugin)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RBAC Best Practices](https://www.postgresql.org/docs/current/ddl-priv.html)
