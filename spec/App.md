# App Component Specification

## Overview
The App component is the main application component with routing and state management.

---

## Current Implementation

### File Location
`src/App.jsx`

### Features
- React Router navigation
- Authentication state management
- Inventory state management
- Menu state management
- Role-based access control
- Responsive sidebar control

---

## State
| State       | Type    | Description                    |
|-------------|---------|--------------------------------|
| isOpen      | boolean | Sidebar visibility            |
| inventory   | array   | Inventory items list          |
| menu        | array   | Menu items list              |
| user        | object  | Current logged-in user        |
| loading     | boolean | Loading state                 |

---

## Access Rights Configuration
```javascript
const accessRights = {
  superadmin: ["dashboard", "payments", "history", "menu", "inventory", "report"],
  admin: ["dashboard", "history", "inventory", "report", "payments", "menu"],
  chef: ["dashboard", "history", "report", "menu"],
  user: ["dashboard", "payments", "history", "report"],
};
```

---

## Routes
| Path                  | Component         | Access                |
|-----------------------|------------------|----------------------|
| /                     | Login            | Public               |
| /logout               | Logout           | Authenticated       |
| /dashboard            | Dashboard        | All roles           |
| /payments             | Payments         | superadmin, admin, user |
| /history              | History          | All roles           |
| /menu                 | Menu             | superadmin, chef    |
| /inventory            | Inventory        | superadmin, admin   |
| /reports/inventory   | InventoryReport  | All roles           |
| /reports/total-sales  | TotalSalesReport | All roles          |
| /user-create          | UserCreate       | superadmin          |

---

## Required Changes

### Inventory Update Handler
The Payment page receives `setInventory` prop. When order completes or cancels in History page, need to refresh inventory.

### Implementation
- Add inventory refresh function
- Pass to History page via props or context
- Call after Complete/Cancel actions

---

## Dependencies
- `react`
- `react-router-dom`
- `supabase`
- `sweetalert2`

---

## Acceptance Criteria
1. App passes necessary props to pages
2. Inventory state updates after Complete/Cancel
3. All routes work correctly with new features
