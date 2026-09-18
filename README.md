# NOSH POS

NOSH POS is a restaurant and inventory management system built with React, Vite, Tailwind CSS, and Supabase.

## Features

- POS checkout with menu items, discounts, taxes, payment methods, and receipt printing
- Order history with completion, cancellation, and inventory adjustments
- Inventory opening, daily movement, purchase, add-stock, usage, adjustment, and closing quantities
- Monthly inventory carry-forward from previous closing quantity to current opening quantity
- FIFO stock layers and inventory valuation
- Purchase orders, suppliers, purchase returns, and expiry alerts
- Inventory, sales, usage, purchase, profit/loss, supplier, expired-stock, and top-selling reports
- Daily movement comparison with real closing quantities
- Role-based access control and configurable User Rights
- User department and position fields
- PBKDF2 password hashing and password change from the profile menu
- Activity Log for login, logout, print, export, process, and permission actions
- Automatic Activity Log cleanup after six months
- Light and dark themes

## Requirements

- Node.js 18+ or current LTS
- npm
- Supabase project

## Installation

```bash
npm install
```

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Do not commit private credentials or service-role keys.

## Database Setup

Run the SQL migrations in Supabase SQL Editor for the same project configured in `.env`.

Important migrations:

1. Existing files in [migrations](migrations)
2. [migrations/2026-09-18-update-user-profile-password.sql](migrations/2026-09-18-update-user-profile-password.sql)
3. [migrations/2026-09-18-create-activity-logs.sql](migrations/2026-09-18-create-activity-logs.sql)
4. [src/migrations/user_rights_schema.sql](src/migrations/user_rights_schema.sql), if User Rights is not installed

The user profile migration adds:

- `department`
- `position`
- `password_hash`

The Activity Log migration adds the audit table, access policies, and a daily cleanup job for records older than six months.

## Password Flow

Existing users can log in once with their current password. After successful login, the app creates a PBKDF2 hash, stores it in `password_hash`, and clears the old plaintext password.

New users and password changes use the hash immediately. Password verification is performed in [src/utils/passwordService.js](src/utils/passwordService.js).

## Run the App

```bash
npm run dev
```

Open the Vite URL, normally:

```text
http://localhost:5173/
```

If localhost binding is restricted:

```bash
npm run dev -- --host 0.0.0.0
```

## Commands

```bash
npm run dev       # Start development server
npm run build     # Build production assets
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## Main Routes

- `/dashboard` - Dashboard
- `/payments` - POS checkout
- `/history` - Order history
- `/menu` - Menu management
- `/category` - Menu categories
- `/inventory` - Inventory management
- `/internal-consumption` - Internal usage and add stock
- `/purchase-order` - Purchase orders
- `/purchase-return` - Purchase returns
- `/supplier` - Suppliers
- `/reports/inventory` - Inventory and daily movement report
- `/reports/total-sales` - Sales report
- `/reports/sale-usage` - Sale usage report
- `/reports/internal-usage-add-stock` - Usage and add-stock report
- `/reports/profit-loss` - Profit and loss report
- `/reports/supplier-outstanding` - Supplier report
- `/reports/expire` - Expired inventory report
- `/purchase-report` - Purchase report
- `/purchase-return-report` - Purchase return report
- `/activity-log` - User activity and print history
- `/user-create` - User management
- `/user-right` - Permission management

## Inventory Calculation

For a selected month:

```text
Closing Qty = Opening Qty
            + Purchase
            + Add Stock
            + Adjustment
            - Sale Usage
            - Internal Usage
```

The next month opening quantity uses the previous month closing quantity. Movement filters use movement dates rather than inventory creation dates.

## User Roles

- `superadmin` - Full access; permissions cannot be edited
- `admin` - Administrative access
- `chef` - Menu, category, internal usage, history, and related access
- `user` - Dashboard, payments, history, and internal consumption access

Permissions are defined in [src/utils/accessControl.js](src/utils/accessControl.js) and enforced by [src/pages/PrivateRoute.jsx](src/pages/PrivateRoute.jsx).

## Activity Log

Activity Log records include the user, role, module, action, entity, description, timestamp, and print/process information. User Rights changes are also recorded.

Activity records are retained for six months. The database cleanup job runs daily.

## Project Structure

- `src/App.jsx` - Routes, shared state, theme, and global activity capture
- `src/components/Navbar.jsx` - Theme, user profile, and password change
- `src/components/Sidebar.jsx` - Permission-aware navigation
- `src/pages/Pyaments.jsx` - POS checkout
- `src/pages/Inventory.jsx` - Inventory and monthly movement management
- `src/pages/InventoryReport.jsx` - Inventory reports and comparisons
- `src/pages/ActivityLog.jsx` - Activity Log page
- `src/pages/UserCreate.jsx` - User profile management
- `src/pages/UserRight.jsx` - User permission management
- `src/utils/activityLogService.js` - Activity logging
- `src/utils/passwordService.js` - Password hashing and verification
- `src/utils/inventoryOpening.js` - Monthly opening and closing calculations
- `src/utils/dailyMovementService.js` - Daily movement updates
- `migrations/` - Supabase SQL migrations

## License

Copyright (c) 2026 Nosh. All rights reserved. This project is proprietary and confidential.
