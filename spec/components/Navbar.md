# Navbar Component Specification

## Overview
The Navbar component is the top header bar of the POS application.

---

## Current Implementation

### File Location
`src/components/Navbar.jsx`

### Features
- Sidebar toggle button (hamburger menu)
- Application title display
- Logged-in user display

### Props
| Prop          | Type       | Description                    |
|---------------|------------|--------------------------------|
| toggleSidebar | function   | Callback to toggle sidebar     |

### State
| State | Type   | Description                |
|-------|--------|---------------------------|
| user  | object | Current logged-in user    |

---

## UI Structure
```
+----------------------------------------------------------+
|  ☰   POS SYSTEM                        Hello, {username} |
+----------------------------------------------------------+
```

---

## Styling
- **Header**: Fixed position, white background, bottom border, shadow
- **Height**: `h-10` (2.5rem / 40px)
- **Toggle Button**: `text-2xl sm:text-3xl`, hover text-blue-600
- **Title**: `text-base sm:text-lg font-semibold`
- **User**: `text-sm sm:text-base font-medium`, capitalize username

---

## Behavior
- Toggle button shows/hides sidebar on mobile
- Displays "Hello, {username}" on the right side
- Username is capitalized

---

## Dependencies
- `react`
- `localStorage` (get user data)

---

## No Changes Required
This component does not need modifications for the new features.
