# Inventory Page Specification

## Overview
The Inventory page allows management of inventory items (raw materials).

---

## Current Implementation

### File Location
`src/pages/Inventory.jsx`

### Features
- List all inventory items
- Add new inventory item
- Edit existing item
- Delete item
- Search items
- Pagination (5 items per page)

---

## No Changes Required
This component does not need modifications for the new features.

---

## Inventory Fields
- `item_name`: Name of the inventory item
- `qty`: Current quantity in stock
- `type`: Category/type of item

---

## UI Structure
```
+--------------------------------------------------+
|  📦 Inventory                                    |
|  [Search...]                    [+ Add Item]      |
+--------------------------------------------------+
|  # | Item      | Qty | Type    | Actions        |
|  1 | Rice      | 100 | Grain   | [Edit][X]     |
|  2 | Chicken   | 50  | Meat    | [Edit][X]     |
+--------------------------------------------------+
|  [Prev] [1] [2] [Next]                          |
+--------------------------------------------------+

[Modal: Add/Edit Item]
+------------------------------------------+
|  Item Name: [____________]                |
|  Quantity:  [____________]                |
|  Type:      [____________]                |
|  [Cancel] [Save]                        |
+------------------------------------------+
```

---

## Dependencies
- `react`
- `supabase`
- `sweetalert2`

---

## Integration with New Features
Inventory quantities are updated when:
1. Order completes → inventory deducted
2. Order cancelled → inventory returned
