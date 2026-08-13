# History Page Specification

## Overview
The History page displays all orders with their items. Each order card now includes action buttons for managing order status.

---

## Current Features
- Display all orders with items
- Search by Order ID or Item Name
- Pagination (8 orders per page)
- Print receipt functionality

---

## New Features

### Order Status
Each order has a status field:
- **pending** - Order created via "Print Order" button, not yet completed
- **completed** - Order completed, inventory deducted
- **cancelled** - Order cancelled, inventory returned

### Action Buttons

| Button   | Available For     | Function                                    |
|----------|-------------------|---------------------------------------------|
| Print    | All statuses     | Print receipt                               |
| Complete | pending only      | Mark as completed (inventory already deducted) |
| Cancel   | pending only      | Return inventory, mark cancelled           |

---

## UI Layout

```
+----------------------------------------------------------+
|  ORDER HISTORY                                            |
+----------------------------------------------------------+
|  [Search by Order ID or Item Name...]                    |
+----------------------------------------------------------+
|  +------------------+  +------------------+               |
|  | Order #1         || | Order #2         |               |
|  | Slip: abc123     || | Slip: def456     |               |
|  | Status: Pending  || | Status: Completed|               |
|  +------------------+  +------------------+               |
|  | Item xQty Price || | Item xQty Price  |               |
|  | ...              || | ...              |               |
|  +------------------+  +------------------+               |
|  | Total: 15000    || | Total: 20000     |               |
|  | [Print][Complete][Cancel] || [Print]       |               |
|  +------------------+  +------------------+               |
+----------------------------------------------------------+
|  [Prev] [1] [2] [3] [Next]                               |
+----------------------------------------------------------+
```

---

## Status Badge Colors
- **Pending**: `bg-yellow-100 text-yellow-800`
- **Completed**: `bg-green-100 text-green-800`
- **Cancelled**: `bg-red-100 text-red-800`

---

## Complete Action Flow
1. User clicks "Complete" on pending order
2. Update order status to 'completed'
3. Refresh history list
4. Show success message

*Note: Inventory was already deducted when order was printed from Payment page.*

---

## Cancel Action Flow
1. User clicks "Cancel" on pending order
2. Show confirmation dialog
3. Get order items and their menu ingredients
4. For each menu ingredient:
   - Calculate return: `ingredient.qty * order_item.qty`
   - Update inventory: `inventory.qty = inventory.qty + return`
5. Update order status to 'cancelled'
6. Refresh history list
7. Show success message

---

## API Requirements
- `orders` table must have `status` column
- Supabase functions needed:
  - Update order status
  - Batch update inventory (deduct/add)
