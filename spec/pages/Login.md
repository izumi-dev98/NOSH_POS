# Login Page Specification

## Overview
The Login page provides user authentication for the POS system.

---

## Current Implementation

### File Location
`src/pages/ Login.jsx` (note: filename has space)

### Features
- Username and password input fields
- Form validation
- Authentication against user table
- LocalStorage session storage
- Redirect to dashboard on success

### State
| State    | Type   | Description          |
|----------|--------|----------------------|
| username | string | Username input value |
| password | string | Password input value |

---

## UI Structure
```
+------------------------------------------+
|                                          |
|           POS System                     |
|         Sign in to continue              |
|                                          |
|  Username                                |
|  [________________________]              |
|                                          |
|  Password                                |
|  [________________________]              |
|                                          |
|  [           Login                       ]|
|                                          |
|         © 2026 POS (Vibe Coding)        |
+------------------------------------------+
```

---

## Authentication Flow
1. User enters username and password
2. Form validates non-empty inputs
3. Query user table for matching username
4. Verify password matches
5. Store user in localStorage
6. Update App state via setUser prop
7. Navigate to dashboard

---

## Error Handling
- Empty fields: "Please enter username and password"
- User not found: "User not found"
- Wrong password: "Wrong password"
- General error: "Something went wrong"

---

## Styling
- Centered layout with fixed position
- Card: max-w-sm, rounded-2xl, shadow-2xl
- Input: rounded-lg, focus:ring-blue-500
- Button: bg-blue-600, hover:bg-blue-700

---

## Dependencies
- `react`
- `react-router-dom` (useNavigate)
- `supabase` (database query)
- `sweetalert2` (notifications)

---

## No Changes Required
This component does not need modifications for the new features.
