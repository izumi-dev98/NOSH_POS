# Layout Component Specification

## Overview
The Layout component provides the main application shell structure.

---

## Current Implementation

### File Location
`src/Layout.jsx`

### Features
- Fixed Navbar at top
- Fixed Sidebar on left
- Mobile overlay for sidebar
- Scrollable main content area

### Props
| Prop     | Type     | Description           |
|----------|----------|----------------------|
| children | node     | Page content to render |

---

## UI Structure
```
+---------------------------+
| Navbar (fixed top)        |
+---------------------------+
| Sidebar |  Main Content   |
| (fixed)  |  (scrollable)   |
|          |                 |
|          |                 |
+---------------------------+
```

---

## Styling
- Outer container: fixed, full viewport
- Sidebar: fixed, w-60, height calc(100vh - 3.5rem)
- Main: pt-14, h-full, overflow-y-auto

---

## Dependencies
- `react`
- `react-router-dom`

---

## No Changes Required
This is a layout component that wraps pages.
