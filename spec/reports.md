# Reports Specification

## Overview
Reports pages display sales and inventory data. These reports need to be updated to account for order status changes.

---

## Total Sales Report

### Current Behavior
- Displays all orders regardless of status
- Calculates total from all order_items

### New Behavior

**Filter by Order Status**
- Only include `completed` orders in sales calculations
- Exclude `pending` and `cancelled` orders

**Impact of Status Changes**

| Action   | Sales Impact                                      |
|----------|--------------------------------------------------|
| Complete | Adds order total to sales report                |
| Cancel   | Subtracts order total from sales report          |

### Implementation
```javascript
// Filter only completed orders
const completedOrders = orders.filter(o => o.status === 'completed');
const orderIds = completedOrders.map(o => o.id);

// Filter order_items for completed orders only
const salesItems = orderItems.filter(item => orderIds.includes(item.order_id));
```

---

## Inventory Report

### Current Behavior
- Displays current inventory quantities
- Shows low stock warnings

### New Behavior

**Reflects All Changes**
- Inventory quantities are updated immediately on Complete
- Inventory quantities are restored on Cancel
- Report always shows current state

**Low Stock Thresholds**
- < 5 units: Critical (red, pulsing)
- < 10 units: Low (red)
- >= 10 units: Normal (green)

---

## Report Pages

### Total Sales Report (`/reports/total-sales`)

**Features:**
- Preset filters: All, Day, Week, Month, Year
- Custom date range picker
- Search by menu name
- Export to Excel
- Pagination (10 rows per page)
- Total sales summary

**Columns:**
| Column    | Description              |
|-----------|--------------------------|
| Slip ID   | Order ID                 |
| Menu      | Menu item name           |
| Qty       | Quantity ordered         |
| Price     | Price per unit          |
| Total     | Line total (qty × price) |
| Date      | Order date              |

**Status Filter (Future Enhancement)**
- Option to view breakdown by status
- Option to include/exclude cancelled orders

---

### Inventory Report (`/reports/inventory`)

**Features:**
- Search by item name
- Export to Excel
- Pagination (5 rows per page)
- Low stock visual indicators

**Columns:**
| Column     | Description           |
|------------|----------------------|
| Item Name  | Inventory item name  |
| Quantity   | Current stock        |
| Type       | Item type/category  |

---

## Excel Export

### Sales Report Export
Includes only completed order items:
- Order_ID
- Menu
- Quantity
- Price
- Total
- Date

### Inventory Report Export
Includes all current inventory:
- Item Name
- Quantity
- Type

---

## Acceptance Criteria

1. Sales report calculates totals from completed orders only
2. Cancelled orders do not appear in sales totals
3. Inventory report reflects current inventory after Complete/Cancel
4. Excel exports match displayed data
5. Filters work correctly with status changes
