# Inventory Report Page Specification

## Overview
The Inventory Report page displays current inventory status and allows export.

---

## Current Implementation

### File Location
`src/pages/InventoryReport.jsx`

### Features
- List all inventory items
- Search by item name
- Pagination (5 items per page)
- Export to Excel
- Low stock visual indicators

---

## No Changes Required
This component does not need modifications for the new features.

---

## Low Stock Thresholds
- **Critical**: qty < 5 (red, pulsing)
- **Low**: qty < 10 (red)
- **Normal**: qty >= 10 (green)

---

## UI Structure
```
+--------------------------------------------------+
|  Inventory Report                                |
|  [Search...]                    [Export Excel]     |
+--------------------------------------------------+
|  Item Name  | Quantity | Type                    |
|  Rice       | [12]     | Grain                  |
|  Chicken    | [3!]     | Meat (Critical!)       |
|  Oil        | [8]      | Liquid (Low Stock)     |
+--------------------------------------------------+
|  [Prev] [1] [2] [Next]                          |
+--------------------------------------------------+
```

---

## Dependencies
- `react`
- `supabase`
- `xlsx` (Excel export)
- `file-saver` (download)

---

## Current Behavior
Report shows current inventory quantities.
Quantities are updated by:
- Order completion (deduct)
- Order cancellation (return)
