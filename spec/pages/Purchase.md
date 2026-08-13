# Purchase Page Specification

## Overview
The Purchase page manages purchase orders from suppliers.

---

## Database Schema

### purchases table
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| invoice_number | VARCHAR(50) | Auto-generated (PO-YYYYMMDD-XXXX) |
| date | DATE | Purchase date |
| supplier_id | INTEGER | Foreign key to suppliers |
| total_amount | NUMERIC(10,2) | Total purchase amount |
| notes | TEXT | Optional notes |
| status | VARCHAR(20) | 'pending', 'received', 'cancelled' |
| created_at | TIMESTAMP | Creation timestamp |

### purchase_items table
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| purchase_id | INTEGER | Foreign key to purchases |
| item_name | VARCHAR(255) | Item name |
| qty | NUMERIC(10,2) | Quantity ordered |
| unit_price | NUMERIC(10,2) | Price per unit |
| total_price | NUMERIC(10,2) | qty * unit_price |

---

## Features

### 1. List Purchases
- Display all purchase orders in a table
- Show: Invoice #, Date, Supplier, Total Amount, Status
- Search by invoice number or supplier name
- Pagination (10 items per page)

### 2. Create Purchase
- Auto-generate invoice number (format: PO-YYYYMMDD-XXXX)
- Select supplier from dropdown
- Select purchase date
- Add multiple line items:
  - Select item from inventory
  - Enter quantity
  - Enter unit price (auto-fill from inventory if price exists)
  - Auto-calculate total
- Add/remove line items dynamically
- Calculate grand total

### 3. Edit Purchase
- Modify purchase header (date, supplier, status)
- Modify line items (add, edit, remove)

### 4. Delete Purchase
- Soft delete with confirmation dialog

---

## UI Structure

```
+--------------------------------------------------+
|  📦 Purchase Order                               |
|  [Search...]                    [+ New Purchase] |
+--------------------------------------------------+
|  # | Invoice    | Date   | Supplier | Total | Status |
|  1 | PO-20240318-0001 | 2024-03-18 | ABC Co | $500 | Pending |
+--------------------------------------------------+
|  [Prev] [1] [Next]                               |
+--------------------------------------------------+

[Modal: New/Edit Purchase]
+------------------------------------------+
|  Invoice: PO-20240318-0001 (Auto)       |
|  Date:      [____________]               |
|  Supplier:  [Select Supplier v]          |
|  Status:    [Pending v]                  |
+------------------------------------------+
|  Items:                                    |
|  +----------------------------------------+
|  | Item Name | Qty | Unit Price | Total |
|  | [_______] | 10  | 5.00       | 50.00 | [X]
|  | [_______] | 5   | 20.00      | 100.00| [X]
|  +----------------------------------------+
|  [+ Add Item]                             |
+------------------------------------------+
|  Grand Total: $150.00                    |
|  Notes: [________________]               |
|  [Cancel] [Save Purchase]                 |
+------------------------------------------+
```

---

## User Interactions

1. **Click "New Purchase"** - Opens modal with auto-generated invoice number
2. **Select Supplier** - Dropdown populated from suppliers table
3. **Add Item** - Click "+ Add Item" to add new row
4. **Remove Item** - Click "X" on row to remove
5. **Auto-calculate** - Total updates automatically when qty/price changes
6. **Edit** - Click Edit to modify existing purchase
7. **Delete** - Click Delete with confirmation

---

## Access Control
- Roles allowed: superadmin, admin

---

## Dependencies
- `react`
- `supabase`
- `sweetalert2`