# PrivateRoute Component Specification

## Overview
The PrivateRoute component protects routes requiring authentication.

---

## Current Implementation

### File Location
`src/pages/PrivateRoute.jsx`

### Features
- Redirect to login if not authenticated
- Role-based access control
- Child component rendering

---

## Props
| Prop         | Type     | Description                    |
|--------------|----------|--------------------------------|
| children     | node     | Component to render            |
| user         | object   | Current logged-in user        |
| allowedRoles | array    | Roles allowed to access       |

---

## Logic
1. If no user → redirect to "/"
2. If allowedRoles defined and user.role not in list → redirect to "/dashboard"
3. Otherwise → render children

---

## No Changes Required
This component does not need modifications for the new features.
