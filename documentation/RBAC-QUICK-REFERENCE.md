# Lipa-Cart RBAC Quick Reference

## 🎭 Four User Roles

| Role | Access Level | Key Actions |
|------|-------------|-------------|
| 👤 **Customer** | Own data only | Browse, order, pay, rate |
| 🛒 **Shopper** | Assigned orders | Shop items, update prices, add substitutes |
| 🏍️ **Rider** | Assigned deliveries | Pick up, deliver, upload proof |
| 👨‍💼 **Admin** | Full platform | Manage all users/orders, resolve disputes |

## 🔑 Role Assignment

Roles apply to **Strapi auth users**, not custom user profiles.

### Two User Systems:
1. **Custom User Profiles** (`api::user.user`) - phone, name, user_type
2. **Strapi Auth Users** (`plugin::users-permissions.user`) - login credentials, role

### How to Assign Roles:

**Option 1: Strapi Admin Panel**
- Go to Content Manager → Users (Users & Permissions plugin)
- Create/edit user and select role

**Option 2: Programmatically** (when syncing with Supabase)
```typescript
import { createAuthUserWithRole } from '../services/role-helper';

const authUser = await createAuthUserWithRole(strapi, {
  username: supabaseUserId,
  email: email,
  userType: 'customer' // Automatically gets Customer role
});
```

See `src/services/role-helper.ts` for helper functions.

## 📊 Permission Levels

- **Find/FindOne**: View/list data
- **Create**: Add new records
- **Update**: Modify existing records  
- **Delete**: Remove records (admins only)

## 🚦 Access Examples

### ✅ Customer Can:
- GET `/api/products` - Browse catalog
- POST `/api/orders` - Place order
- PUT `/api/addresses/:own_id` - Update own address
- POST `/api/ratings` - Rate order

### ❌ Customer Cannot:
- PUT `/api/orders/:id/status` - Update order status
- GET `/api/users` - List all users
- DELETE `/api/orders/:id` - Delete orders

### ✅ Shopper Can:
- GET `/api/orders?shopper.id=$own` - View assigned orders
- PUT `/api/order-items/:id` - Update item prices
- POST `/api/order-items` - Add substitutes
- PUT `/api/shoppers/:own_id` - Update availability

### ❌ Shopper Cannot:
- GET `/api/orders` - View all orders (only assigned)
- DELETE `/api/order-items/:id` - Delete items
- POST `/api/payments` - Process payments

### ✅ Admin Can:
- **Everything** - Full CRUD on all resources
- Assign orders to shoppers/riders
- Resolve disputes and refunds
- View analytics across platform

## 🛡️ Security Layers

1. **Strapi RBAC**: API endpoint permissions
2. **Supabase RLS**: Database row-level security
3. **Controller Logic**: Business rules validation

## 📱 Testing

Use JWT token in Authorization header:
```
Authorization: Bearer eyJhbGci...
```

Get token via:
```
POST /api/auth/local
{
  "identifier": "phone_or_email",
  "password": "password"
}
```

## 📚 Full Documentation

See [RBAC.md](./RBAC.md) for complete details.
