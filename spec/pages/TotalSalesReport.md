# Total Sales Report Page Specification

## Overview
The Total Sales Report page displays sales data with filtering and export capabilities.

---

## Current Implementation

### File Location
`src/pages/TotalSalesReport.jsx`

### Features
- Display all order items
- Preset filters: All, Day, Week, Month, Year
- Custom date range picker
- Search by menu name
- Export to Excel
- Pagination (10 rows per page)
- Total sales summary

---

## Required Changes

### Filter by Order Status
- Only include `completed` orders in sales calculations
- Exclude `pending` and `cancelled` orders

### Implementation
```javascript
// Filter only completed orders
const completedOrders = orders.filter(o => o.status === 'completed');
const orderIds = completedOrders.map(o => o.id);

// Filter order_items for completed orders only
const salesItems = orderItems.filter(item => orderIds.includes(item.order_id));
```

---

## UI Structure
```
+--------------------------------------------------+
|  Total Sales Report                              |
|  [All] [Day] [Week] [Month] [Year]              |
|  [Start Date] - [End Date] [Apply]              |
+--------------------------------------------------+
|  Total Sales: 150,000 MMK                       |
+--------------------------------------------------+
|  [Search menu...]                                |
+--------------------------------------------------+
|  Slip ID | Menu | Qty | Price | Total | Date  |
|  123     | Rice | 2   | 5000  | 10000 | 1/15 |
+--------------------------------------------------+
|  [Prev] [1] [2] [Next]                          |
+--------------------------------------------------+
```

---

## Impact of Status Changes
| Action   | Sales Impact                                      |
|----------|--------------------------------------------------|
| Complete | Order total added to sales report                |
| Cancel   | Order total removed from sales report            |

---

## Dependencies
- `react`
- `supabase`
- `xlsx`
- `file-saver`

---

## Acceptance Criteria
1. Sales report shows only completed orders
2. Pending orders not counted
3. Cancelled orders not counted
4. Total updates when orders complete/cancel
