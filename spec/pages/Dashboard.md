# Dashboard Page Specification

## Overview
The Dashboard page displays sales analytics and statistics.

---

## Current Implementation

### File Location
`src/pages/Dashboard.jsx`

### Features
- Monthly sales bar chart
- Most selling menu item display
- Month selector (last 12 months)
- Sales data aggregation by menu item

### State
| State         | Type   | Description                    |
|---------------|--------|--------------------------------|
| monthlyData   | array  | Sales data grouped by menu     |
| mostSelling   | array  | Top selling item [name, total] |
| selectedMonth | string | Current selected month (YYYY-MM) |

---

## UI Structure
```
+--------------------------------------------------+
|  Dashboard                                        |
+--------------------------------------------------+
|  [Month Selector: January 2026 ▼]                 |
+--------------------------------------------------+
|  Monthly Sales                                   |
|  +--------------------------------------------+ |
|  |                                            | |
|  |         [Bar Chart]                        | |
|  |                                            | |
|  +--------------------------------------------+ |
+--------------------------------------------------+
|  Most Selling Menu                              |
|  Item Name — Total Sales                        |
+--------------------------------------------------+
```

---

## Data Fetching
- Fetch orders for selected month (start to end)
- Fetch all order_items
- Fetch all menu items
- Join order_items with menu data
- Filter items belonging to selected month orders

---

## Chart Configuration
- Library: `react-chartjs-2` / `chart.js`
- Type: Bar chart
- Label: "Total Sales (MMK)"
- Color: `rgba(37, 99, 235, 0.8)`
- Border radius: 6px

---

## Sales Calculation
```javascript
salesMap[menu_name] += (price * qty);
```

---

## Dependencies
- `react`
- `supabase` (data fetching)
- `chart.js` / `react-chartjs-2`
- `sweetalert2`

---

## Changes for New Features

### Required Changes
- **Filter by status**: Only include completed orders in dashboard calculations
- **Status check**: Filter orders where `status === 'completed'`

### Implementation
```javascript
// Filter only completed orders
const completedOrders = orders.filter(o => o.status === 'completed');
```

---

## Acceptance Criteria
1. Dashboard shows sales only from completed orders
2. Pending and cancelled orders are excluded
3. Chart updates when order status changes
