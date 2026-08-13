# Payment Page Specification

## Overview
The Payment page (Pyaments.jsx) allows users to add menu items to cart and create orders.

---

## Current Implementation

### File Location
`src/pages/Pyaments.jsx`

### Features
- Display menu items with search
- Add items to cart
- Adjust cart item quantities
- Stock validation against inventory
- "Complete & Print Order" button (single action)
- Auto-deduct inventory on complete

---

## Required Changes

### Button Split

The original "Complete & Print Order" button needs to be split:

| Button        | Status Created | Inventory Deducted | Prints Receipt |
|---------------|---------------|-------------------|----------------|
| Print Order   | pending       | No                | Yes            |
| Complete      | completed     | Yes               | No             |

### Print Order Action Flow
1. User clicks "Print Order"
2. Validate cart is not empty
3. Create order with `status: 'pending'`
4. Create order items in database
5. Print receipt
6. Clear cart
7. Show success message

### Complete Action
- Removed from Payment page
- Moved to History page for pending orders

---

## UI Layout
```
+---------------------------------------------------+
|  PAYMENTS                                         |
+---------------------------------------------------+
|  [Search menu...]                                  |
+---------------------------------------------------+
|  +---------------------+  +---------------------+ |
|  | MENU                |  | CART                | |
|  +---------------------+  +---------------------+ |
|  | [Item A]  5000     |  | Item A x2   10000   | |
|  | [Item B]  3000     |  | [+][-]              | |
|  | [Item C]  8000     |  +---------------------+ |
|  | ...                 |  | Item B x1    3000   | |
|  +---------------------+  +---------------------+ |
|                           |                      | |
|                           +---------------------+ |
|                           | Total: 13000        | |
|                           +---------------------+ |
|                           | [Print Order]       | |
|                           +---------------------+ |
+---------------------------------------------------+
```

---

## Existing Features to Preserve

### Stock Validation
- Check inventory before adding to cart
- Calculate max quantity based on available stock
- Show warning when reaching stock limit

### Cart Management
- Add/remove items
- Adjust quantities
- Real-time total calculation

### Receipt Printing
- Print slip with order details
- Format: Order ID, Date, Items table, Total

---

## Dependencies
- `react`
- `supabase`
- `sweetalert2`

---

## Acceptance Criteria
1. "Print Order" creates pending order without deducting inventory
2. Inventory deducted only when Complete is clicked in History
3. Receipt prints immediately after Print Order
4. Cart clears after Print Order
5. Stock validation still works correctly
