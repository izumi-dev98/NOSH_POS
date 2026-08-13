# Sidebar Component Specification

## Overview
The Sidebar component provides navigation menu for the POS system based on user roles.

---

## Current Implementation

### File Location
`src/components/Sidebar.jsx`

### Features
- Role-based menu access control
- Responsive navigation with collapsible state
- Reports dropdown with sub-menu items
- Logout navigation

### Role Access Matrix
| Role       | Dashboard | Payments | History | Menu | Inventory | Reports | User-Create |
|------------|-----------|----------|---------|------|-----------|---------|-------------|
| superadmin | ✓         | ✓        | ✓       | ✓    | ✓         | ✓       | ✓           |
| admin      | ✓         | ✓        | ✓       | ✓    | ✓         | ✓       |             |
| chef       | ✓         |          | ✓       | ✓    |           | ✓       |             |
| user       | ✓         | ✓        | ✓       |      |           | ✓       |             |

### Props
| Prop    | Type    | Description                    |
|---------|---------|--------------------------------|
| isOpen  | boolean | Sidebar visibility state      |

### State
| State        | Type    | Description                    |
|--------------|---------|--------------------------------|
| reportOpen   | boolean | Reports dropdown toggle state  |

---

## UI Structure
```
+-------------------------+
|  Navigation Menu        |
+-------------------------+
|  Dashboard              |
|  Payments              |
|  History               |
|  Menu                  |
|  Inventory             |
|  Reports ▼             |
|    - Inventory Report  |
|    - Total Sales       |
|  Create User           |
|  Logout                |
+-------------------------+
```

---

## Styling
- **Base Link**: `block px-4 py-2 rounded-lg border transition text-sm`
- **Normal State**: `border-gray-300 text-gray-700 hover:text-blue-600 hover:border-blue-400`
- **Active State**: `bg-blue-50 text-blue-600 border-blue-500 font-semibold`
- **Logout**: `border-red-300 text-red-500 hover:bg-red-50`

---

## Dependencies
- `react`
- `react-router-dom` (NavLink)
- localStorage (user role)
- Access rights configuration object

---

## No Changes Required
This component does not need modifications for the new features.
