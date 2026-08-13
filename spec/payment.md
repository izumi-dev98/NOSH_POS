# Payment Page Specification

## Overview
The Payment page allows users to add menu items to cart and complete orders. The functionality is being split to support pending orders.

---

## Current Features
- Display menu items with search
- Add items to cart
- Adjust cart item quantities
- "Complete & Print Order" button (single action)

---

## New Features

### Button Split

The original "Complete & Print Order" button is now split into two separate actions:

| Button        | Status Created | Inventory Deducted | Prints Receipt |
|---------------|---------------|-------------------|----------------|
| Print Order   | pending       | Yes               | Yes            |
| Complete*     | completed     | No                | No             |

*Note: Complete action is moved to History page for pending orders.

---

## Print Order Action Flow

1. User clicks "Print Order"
2. Validate cart is not empty
3. Create order in database:
   ```javascript
   {
     total: cartTotal,
     status: 'pending'
   }
   ```
4. Create order items:
   ```javascript
   {
     order_id: orderId,
     menu_id: item.id,
     qty: item.qty,
     price: item.price
   }
   ```
5. Print receipt
6. Clear cart
7. Show success message
8. Order appears in History with "pending" status

---

## Complete Action Flow (in History Page)
See: [History Page Specification](./history.md)

---

## Cart Behavior

- Cart persists during session
- Quantity adjustment checks inventory availability
- Removing all items clears cart
- Cart total updates in real-time

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

## Receipt Print Content

```html
<h1>POS SYSTEM SLIP</h1>
<p>Slip ID: {order_id}</p>
<p>Date: {date}</p>
<table>
  <thead>
    <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
  </thead>
  <tbody>
    {cart items}
  </tbody>
  <tfoot>
    <tr><td colspan="3">Total</td><td>{total}</td></tr>
  </tfoot>
</table>
<p>Thank you!</p>
```

---

## Validation Rules
- Cart must not be empty
- Each cart item must have valid menu_id and qty
- Total must be greater than 0
