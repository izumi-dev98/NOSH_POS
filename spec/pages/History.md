# History Page Specification

## Overview
The History page displays all orders with their items and provides actions for managing order status.

---

## Current Implementation

### File Location
`src/pages/History.jsx`

### Features
- Display all orders with items
- Search by Order ID or Item Name
- Pagination (8 orders per page)
- Print receipt functionality

---

## Required Changes

### Order Status Display
- Add status field to order cards
- Display status badge with colors:
  - **pending**: Yellow/Orange (`bg-yellow-100 text-yellow-800`)
  - **completed**: Green (`bg-green-100 text-green-800`)
  - **cancelled**: Red (`bg-red-100 text-red-800`)

### Action Buttons

| Button   | Available For     | Function                                    |
|----------|-------------------|---------------------------------------------|
| Print    | All statuses     | Print receipt (existing)                   |
| Complete | pending only     | Deduct inventory, mark completed             |
| Cancel   | pending only     | Return inventory, mark cancelled           |

---

## Complete Action Flow
1. User clicks "Complete" on pending order
2. Fetch order items and their menu ingredients
3. For each menu ingredient:
   - Calculate: `deduction = ingredient.qty * order_item.qty`
   - Update: `inventory.qty = inventory.qty - deduction`
4. Update order status to 'completed'
5. Refresh history list
6. Show success message

---

## Cancel Action Flow
1. User clicks "Cancel" on pending order
2. Show confirmation dialog (Swal)
3. Fetch order items and their menu ingredients
4. For each menu ingredient:
   - Calculate: `return = ingredient.qty * order_item.qty`
   - Update: `inventory.qty = inventory.qty + return`
5. Update order status to 'cancelled'
6. Refresh history list
7. Show success message

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
|  | [Pending]        || | [Completed]      |               |
|  +------------------+  +------------------+               |
|  | Item xQty Price || | Item xQty Price  |               |
|  | ...              || | ...              |               |
|  +------------------+  +------------------+               |
|  | Total: 15000    || | Total: 20000     |               |
|  | [Print]         || | [Print]          |               |
|  | [Complete][Cancel] |                  +------------------+ |               |
|  +------------------+               |
+----------------------------------------------------------+
|  [Prev] [1] [2] [3] [Next]                               |
+----------------------------------------------------------+
```

---

## Database Requirements
- `orders` table must have `status` column
- Default value: 'pending'

---

## Dependencies
- `react`
- `supabase`
- `sweetalert2`

---

## Acceptance Criteria
1. Each order card shows status badge
2. Complete button only visible for pending orders
3. Cancel button only visible for pending orders
4. Complete deducts inventory correctly
5. Cancel returns inventory correctly
6. Status updates persist to database
