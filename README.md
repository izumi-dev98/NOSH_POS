# ATY_F-B_POS

A restaurant / retail Point of Sale (POS) system built with React, Vite, Tailwind CSS, and Supabase.

The app supports checkout, inventory control, purchase orders, FIFO inventory tracking, payment methods, discount management, reporting, and expiry alerts.

## Features

- Order checkout with cart items, payment type, discount type, and print order flow
- Inventory management with stock tracking and FIFO deduction/restoration
- Purchase orders with supplier details and item entry
- Order history with status updates, completion/cancellation, and inventory adjustments
- Discount type management for percentage and fixed-price discounts
- Expiry date alert system for expiring or expired purchase items
- Reports for inventory value, sales, usage, expired stock, purchase returns, and supplier outstanding
- Role-based navigation and access control
- AI analytics/chat for quick business insights

## Requirements

- Node.js 18+ or compatible LTS version
- npm
- Supabase project for database and auth

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd ATY_F-B_POS
```

2. Install dependencies:

```bash
npm install
```

3. Configure Supabase:

Update `src/createClients.js` with your Supabase project URL and public anon key.

```js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://your-project.supabase.co",
  "your-public-anon-key"
);

export default supabase;
```

4. Run the development server:

```bash
npm run dev
```

5. Open the app in the browser using the local URL shown by Vite, usually `http://localhost:5173`.

## Environment setup suggestion

For a safer configuration, use environment variables and load them in `src/createClients.js`.

Example:

```js
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Then create a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

## Supabase schema overview

Key database tables used by this POS system include:

- `orders` — order headers with totals, status, payment type, discount type, and remarks
- `order_items` — line items for each order, including quantity, price, and discount
- `menu` — products or services available for sale
- `menu_ingredients` — inventory components needed for each menu item
- `inventory` — stock items with current quantity and category/type
- `discount_types` — discount definitions for percentage and fixed-price discounts
- `inventory_fifo_layers` — FIFO stock layer tracking to support accurate inventory costing

Relationships:

- `orders` (1) → `order_items` (N)
- `order_items` (N) → `menu` (1)
- `menu` (1) → `menu_ingredients` (N)
- `menu_ingredients` (N) → `inventory` (1)
- `orders` (N) → `discount_types` (1)

```
orders
  └─ order_items
        └─ menu
              └─ menu_ingredients
                    └─ inventory

orders
  └─ discount_types
```

Example schema changes:

```sql
ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD CONSTRAINT status_check CHECK (status IN ('pending', 'completed', 'cancelled'));
ALTER TABLE discount_types ADD COLUMN discount_amount NUMERIC;
```

## Main table summary

- `orders`
  - `id`, `created_at`, `total`, `status`, `payment_type`, `discount_type`, `discount_percent`, `discount_amount`, `remark`
- `order_items`
  - `id`, `order_id`, `menu_id`, `qty`, `price`, `discount_percent`, `discount_amount`
- `menu`
  - `id`, `menu_name`, `price`, `category`, `has_ingredients`
- `menu_ingredients`
  - `id`, `menu_id`, `inventory_id`, `qty`
- `inventory`
  - `id`, `item_name`, `qty`, `type`, `unit`, `price`
- `discount_types`
  - `id`, `discount_name`, `discount_percent`, `discount_amount`, `is_active`
- `inventory_fifo_layers`
  - `id`, `inventory_id`, `purchase_item_id`, `remaining_qty`, `cost_price`, `created_at`

## Authentication and access control

- `src/utils/accessControl.js` controls permissions for pages and actions
- `src/pages/PrivateRoute.jsx` protects routes behind user authentication
- User roles determine access to payments, history, inventory, reports, purchase, and discount management

## App structure

- `src/App.jsx` — application shell, routes, auth session state, theme toggle, expiry checks, global inventory/menu state
- `src/createClients.js` — Supabase client configuration
- `src/pages/Pyaments.jsx` — payment/cart checkout page and order completion
- `src/pages/History.jsx` — order history and status management with inventory restore/deduct logic
- `src/pages/DiscountType.jsx` — add/edit discount types with percent and fixed-value support
- `src/pages/Inventory.jsx` — inventory item management and stock updates
- `src/pages/Purchase.jsx` — purchase order creation and supplier purchase flow
- `src/pages/PurchaseReturn.jsx` — purchase return processing
- `src/components/Navbar.jsx` — top app navigation bar
- `src/components/Sidebar.jsx` — role-based route navigation
- `src/utils/fifoService.js` — FIFO inventory layer logic and stock deduction utilities
- `src/utils/expiryService.js` — expiry detection and alert helpers

## SQL migrations and schema scripts

The repository includes SQL files for schema changes and inventory tracking:

- `migrations/2026-07-24-add-discount-amount-to-discount-types.sql`
- `migrations/2026-07-19-create-inventory-categories.sql`
- `migrations/2026-07-19-add-category-to-internal-consumption-items.sql`
- `migrations/2026-07-19-usage-stock-categories.sql`
- `migrations/2026-07-14-add-order-cancel-columns.sql`
- `migrations/2026-07-14-add-order-complete-columns.sql`
- `inventory_fifo_layers.sql`
- `purchase_return_fifo.sql`

These scripts help extend the database to support discount amount storage, FIFO inventory layers, category tracking, and order status fields.

## How to use

- Use the sidebar to navigate between Dashboard, Payments, History, Inventory, and Reports.
- Add or update inventory items from the Inventory page.
- Create purchase orders and supplier entries from the Purchase section.
- Checkout orders from the Payments page using cart items, select discount and payment type.
- Manage discount types in the Discount Type page to support percent or fixed-price discounts.
- Review past orders and change status via the History page, where inventory is restored or deducted automatically.
- Monitor expiring stock through expiry alerts and report pages.

## Useful notes

- The cart action button label is `Clear Cart` for better clarity.
- Payment type selection is shown above discount type in the checkout sidebar.
- Fixed-price discount support is available in discount types and summary display.
- Role-based access control is implemented in `src/utils/accessControl.js`.
- Expiry checks run on session load and notify users about expiring or expired items.

## Available commands

- `npm run dev` — start the development server
- `npm run build` — build production assets
- `npm run preview` — preview the production build locally
- `npm run lint` — run ESLint across the project

## Next improvements

- Add environment variable support for Supabase config
- Add authentication and role seeds for initial users
- Add database migration automation or deploy scripts
- Add tests for checkout, inventory, and history flows

## License

No license is included in this repository. Add a `LICENSE` file if you want to publish or share this project.
