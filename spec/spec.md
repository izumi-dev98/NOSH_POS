# POS VIBE - Feature Specification

## Project Overview
- **Project Name**: POS VIBE (Point of Sale System)
- **Type**: React Web Application with Supabase Backend
- **Core Functionality**: Restaurant POS system with order management, inventory tracking, and sales reporting
- **Target Users**: Restaurant staff (superadmin, admin, chef, user roles)

---

## Feature Specifications

### 1. History Page - Order Actions

#### Current State
- History cards display order items with Print button only
- No status tracking for orders

#### New Implementation

**1.1 Order Status Field**
- Add `status` field to `orders` table (values: `pending`, `completed`, `cancelled`)
- Default status: `pending` when order is created

**1.2 History Card Actions**
Each history card will have three buttons based on order status:

| Status    | Print | Complete | Cancel |
|-----------|-------|----------|--------|
| pending   | Yes   | Yes      | Yes    |
| completed | Yes   | No       | No     |
| cancelled | Yes   | No       | No     |

**1.3 Button Behaviors**

- **Print Button**: Opens receipt print dialog (existing functionality)
- **Complete Button**:
  - Only available for `pending` orders
  - Subtracts inventory for menu items that have integrated ingredients
  - Updates order status to `completed`
  - Updates sales report totals
- **Cancel Button**:
  - Only available for `pending` orders
  - Returns menu integrated items back to inventory (reverses any previous deductions)
  - Subtracts the order amount from sales reports
  - Updates order status to `cancelled`

---

### 2. Payment Cart - Split Action Buttons

#### Current State
- Single "Complete & Print Order" button that:
  - Creates order
  - Subtracts inventory immediately
  - Prints receipt

#### New Implementation

**2.1 Button Split**

| Button          | Action                                                                 |
|-----------------|------------------------------------------------------------------------|
| **Print Order** | Creates order with `pending` status, prints receipt, does NOT deduct inventory |
| **Complete**    | For pending orders: deducts inventory, updates status to `completed` |

**2.2 Print Order Behavior**
- Creates new order in `orders` table with `status: pending`
- Creates order items in `order_items` table
- Prints receipt immediately
- Cart clears after printing
- Inventory remains unchanged
- Order appears in History page with "pending" status

**2.3 Complete Behavior (in History)**
- For pending orders only
- Iterates through order items
- For each item with menu ingredients:
  - Subtracts ingredient quantities from inventory
  - Updates `inventory` table
- Updates order status to `completed`

---

### 3. Inventory Integration

#### Menu Integration Check
- Menu items are linked to inventory items via `menu_ingredients` table
- Each menu item has `menu_ingredients` entries specifying:
  - `menu_id`: Reference to menu item
  - `inventory_id`: Reference to inventory item
  - `qty`: Quantity of inventory item needed per menu unit

#### Inventory Deduction Logic (Complete)
```javascript
for each order_item:
  get menu_ingredients for menu_id
  for each ingredient:
    inventory_id = ingredient.inventory_id
    deduct_qty = ingredient.qty * order_item.qty
    update inventory set qty = qty - deduct_qty
```

#### Inventory Return Logic (Cancel)
```javascript
for each order_item:
  get menu_ingredients for menu_id
  for each ingredient:
    inventory_id = ingredient.inventory_id
    return_qty = ingredient.qty * order_item.qty
    update inventory set qty = qty + return_qty
```

---

### 4. Report Adjustments

#### Sales Report Impact
- **Cancel Action**: Subtracts cancelled order amount from total sales
- Order items from cancelled orders should be excluded from sales calculations
- Only `completed` orders count toward total sales

#### Inventory Report Impact
- **Complete Action**: Reduces inventory quantities (permanent)
- **Cancel Action**: Returns inventory quantities to previous state
- Report reflects current inventory after all operations

---

## Database Changes Required

### orders table
```sql
ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending';
-- Values: 'pending', 'completed', 'cancelled'
-- Default: 'pending'
```

---

## UI/UX Changes

### History Page Card
```
+------------------------------------------+
| Order #1                    Slip: 123     |
| 2024-01-15 12:30 PM                      |
+------------------------------------------+
| Item 1           x2        10,000        |
| Item 2           x1        5,000         |
+------------------------------------------+
| Total: 15,000          [Pending]        |
+------------------------------------------+
| [Print]        [Complete]    [Cancel]    |
+------------------------------------------+
```

### Payment Page Buttons
```
+---------------------------+----------------+
|                          | Total: 15,000  |
|                          +----------------+
|  Cart Items...           | [Print Order]  |
|                          | [Complete]     |
+---------------------------+----------------+
```

### Button States
- **Pending orders**: All three buttons visible and active
- **Completed orders**: Only Print button visible
- **Cancelled orders**: Only Print button visible

### Status Badge
- Add visual status badge on each card:
  - Pending: Yellow/Orange background
  - Completed: Green background
  - Cancelled: Red background

---

## Acceptance Criteria

1. **History Page**
   - [ ] Each order card shows status (pending/completed/cancelled)
   - [ ] Complete button only visible for pending orders
   - [ ] Cancel button only visible for pending orders
   - [ ] Clicking Complete deducts inventory for menu-integrated items
   - [ ] Clicking Cancel returns inventory and marks order as cancelled

2. **Payment Page**
   - [ ] "Print Order" button creates pending order without deducting inventory
   - [ ] "Complete" button in cart is removed
   - [ ] Complete action happens only in History page

3. **Reports**
   - [ ] Sales report excludes cancelled orders from totals
   - [ ] Inventory report reflects all deductions/returns accurately

4. **Database**
   - [ ] Orders table has status field
   - [ ] New orders default to pending status

---

## Implementation Priority

1. Database migration (add status column)
2. Modify Payment page (split buttons)
3. Modify History page (add Complete/Cancel buttons)
4. Add inventory deduction logic for Complete
5. Add inventory return logic for Cancel
6. Update reports to filter by status
